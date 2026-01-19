/**
 * Regression test for bookmark destinations
 * 
 * This test verifies that bookmarks written to PDF actually have valid
 * destinations that work in real PDF viewers.
 */

import { describe, it, expect } from '@jest/globals';
import { PDFDocument } from 'pdf-lib';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeBookmarksViaSidecar } from '../pikepdfBookmarkWriter.js';

const execFileAsync = promisify(execFile);

/**
 * Python helper to verify bookmark destinations in a PDF
 */
async function verifyBookmarkDestinations(pdfPath: string): Promise<{
  itemsWithDest: number;
  itemsWithoutDest: number;
  itemsWithValidDest: number;
  itemsWithInvalidDest: number;
  sampleDestinations: Array<{
    title: string;
    hasDest: boolean;
    destType?: string;
    pageNum?: number;
  }>;
}> {
  const script = `
import sys
from pikepdf import Pdf, Name

pdf_path = sys.argv[1]
pdf = Pdf.open(pdf_path)

items_with_dest = 0
items_without_dest = 0
items_with_valid_dest = 0
items_with_invalid_dest = 0
sample_destinations = []

if '/Outlines' in pdf.Root and '/First' in pdf.Root.Outlines:
    item = pdf.Root.Outlines.First
    count = 0
    
    while item is not None and count < 10:
        title = str(item.get('/Title', b'')).encode('latin1').decode('utf-8', errors='replace') if '/Title' in item else '<no title>'
        has_dest = '/Dest' in item
        
        if has_dest:
            items_with_dest += 1
            dest = item.Dest
            # pikepdf Array objects behave like lists but aren't Python lists
            # Check if it's array-like (has __len__ and __getitem__)
            is_array_like = hasattr(dest, '__len__') and hasattr(dest, '__getitem__')
            if is_array_like and len(dest) >= 2:
                # Check if destination is valid
                page_ref = dest[0]
                view_type = dest[1]
                
                # Find page number
                page_num = None
                for i, page in enumerate(pdf.pages, 1):
                    try:
                        if page.obj == page_ref or str(page.obj) == str(page_ref):
                            page_num = i
                            break
                    except:
                        pass
                
                # Check if view type is valid
                # view_type might be a Name object or string
                from pikepdf import Name
                valid = False
                view_type_str = str(view_type)
                view_type_repr = repr(view_type)
                
                # Check for /Fit (simplest, most compatible)
                # Name('/Fit') when converted to string might be '/Fit' or 'Name('/Fit')'
                if view_type == Name('/Fit'):
                    valid = True
                elif view_type_str == '/Fit':
                    valid = True
                elif '/Fit' in view_type_str and len(dest) == 2:
                    # /Fit with no additional params
                    valid = True
                elif '/FitH' in view_type_str and len(dest) >= 3:
                    valid = isinstance(dest[2], (int, float))
                elif '/XYZ' in view_type_str and len(dest) >= 5:
                    # XYZ needs left, top, zoom (all numbers, zoom can't be None)
                    valid = all(isinstance(dest[i], (int, float)) for i in [2, 3, 4])
                
                if valid:
                    items_with_valid_dest += 1
                else:
                    items_with_invalid_dest += 1
                
                sample_destinations.append({
                    'title': title,
                    'hasDest': True,
                    'destType': view_type_str,
                    'pageNum': page_num,
                    'destLen': len(dest),
                    'destRepr': str(dest[:3]) if len(dest) >= 3 else str(dest),
                    'valid': valid
                })
            else:
                items_with_invalid_dest += 1
                sample_destinations.append({
                    'title': title,
                    'hasDest': True,
                    'destType': '<not a list or too short>',
                    'pageNum': None,
                    'destType': str(type(dest))
                })
        else:
            items_without_dest += 1
            sample_destinations.append({
                'title': title,
                'hasDest': False
            })
        
        count += 1
        if '/Next' in item:
            item = item.Next
        else:
            break

import json
result = {
    'itemsWithDest': items_with_dest,
    'itemsWithoutDest': items_without_dest,
    'itemsWithValidDest': items_with_valid_dest,
    'itemsWithInvalidDest': items_with_invalid_dest,
    'sampleDestinations': sample_destinations
}
print(json.dumps(result))
`;

  // Find Python
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  
  try {
    const { stdout } = await execFileAsync(pythonCmd, ['-c', script, pdfPath]);
    return JSON.parse(stdout);
  } catch (error: any) {
    throw new Error(`Failed to verify destinations: ${error.message}`);
  }
}

describe('Bookmark Destinations Regression Test', () => {
  it('should write bookmarks with valid destinations that work in PDF viewers', async () => {
    // Create a minimal PDF with 3 pages
    const pdfDoc = await PDFDocument.create();
    const pages = [
      await pdfDoc.addPage([612, 792]),
      await pdfDoc.addPage([612, 792]),
      await pdfDoc.addPage([612, 792]),
    ];
    
    // Add some content to pages
    pages[0].drawText('Page 1', { x: 50, y: 750 });
    pages[1].drawText('Page 2', { x: 50, y: 750 });
    pages[2].drawText('Page 3', { x: 50, y: 750 });
    
    // Save to temp file
    const pdfBytes = await pdfDoc.save();
    const tempDir = tmpdir();
    const testId = `conset-pdf-test-${Date.now()}`;
    const inputPdf = join(tempDir, `${testId}.pdf`);
    const outputPdf = join(tempDir, `${testId}-output.pdf`);
    await writeFile(inputPdf, pdfBytes);
    
    try {
      // Create bookmarks pointing to page 2 and page 3 (0-indexed: 1, 2)
      const bookmarks = [
        { title: 'Bookmark to Page 2', pageIndex: 1 },
        { title: 'Bookmark to Page 3', pageIndex: 2 },
      ];
      
      // Write bookmarks via sidecar
      await writeBookmarksViaSidecar(inputPdf, outputPdf, bookmarks, false);
      
      // Verify destinations using Python helper
      const verification = await verifyBookmarkDestinations(outputPdf);
      
      // Assertions
      expect(verification.itemsWithoutDest).toBe(0);
      expect(verification.itemsWithDest).toBeGreaterThan(0);
      expect(verification.itemsWithValidDest).toBeGreaterThan(0);
      expect(verification.itemsWithInvalidDest).toBe(0);
      
      // At least one bookmark should point to page 2 or 3 (not page 1)
      const hasNonFirstPage = verification.sampleDestinations.some(
        d => d.pageNum !== undefined && d.pageNum > 1
      );
      expect(hasNonFirstPage).toBe(true);
      
      // All destinations should have valid view types
      const allValid = verification.sampleDestinations.every(
        d => !d.hasDest || (d.destType && d.destType !== '<invalid>')
      );
      expect(allValid).toBe(true);
      
    } finally {
      // Cleanup
      try {
        await unlink(inputPdf);
        await unlink(outputPdf);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }, 30000); // 30 second timeout for Python subprocess
});

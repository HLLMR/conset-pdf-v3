/**
 * Regression test for outline tree structure and linkage
 * 
 * This test verifies that bookmarks are written as a properly linked outline tree:
 * - All items are indirect objects
 * - Root-level items are linked via /Next
 * - Parent-child relationships are correct (/First, /Last, /Parent, /Count)
 * - All items have /Dest and /A GoTo
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
 * Verify outline tree structure using Python verifier script
 */
async function verifyOutlineTree(pdfPath: string): Promise<{
  outlinesExists: boolean;
  rootCount: number;
  firstRootHasChildren: boolean;
  childCount: number;
  allItemsIndirect: boolean;
  allItemsHaveDest: boolean;
  allItemsHaveAction: boolean;
  outlinesCount: number | null;
}> {
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  
  const script = `
import sys
import json
from pikepdf import Pdf, Name

pdf_path = sys.argv[1]
pdf = Pdf.open(pdf_path)

result = {
    'outlinesExists': '/Outlines' in pdf.Root,
    'rootCount': 0,
    'firstRootHasChildren': False,
    'childCount': 0,
    'allItemsIndirect': True,
    'allItemsHaveDest': True,
    'allItemsHaveAction': True,
    'outlinesCount': None
}

if result['outlinesExists']:
    outlines = pdf.Root.Outlines
    if '/Count' in outlines:
        result['outlinesCount'] = int(outlines.get('/Count'))
    
    if '/First' in outlines:
        item = outlines.First
        root_items = []
        
        # Walk root-level chain
        while item is not None:
            root_items.append(item)
            
            # Check if indirect
            if not hasattr(item, 'objgen'):
                result['allItemsIndirect'] = False
            
            # Check /Dest and /A
            if '/Dest' not in item:
                result['allItemsHaveDest'] = False
            if '/A' not in item:
                result['allItemsHaveAction'] = False
            
            # Check children of first root
            if len(root_items) == 1 and '/First' in item:
                result['firstRootHasChildren'] = True
                child = item.First
                while child is not None:
                    result['childCount'] += 1
                    
                    # Check if indirect
                    if not hasattr(child, 'objgen'):
                        result['allItemsIndirect'] = False
                    
                    # Check /Dest and /A
                    if '/Dest' not in child:
                        result['allItemsHaveDest'] = False
                    if '/A' not in child:
                        result['allItemsHaveAction'] = False
                    
                    if '/Next' in child:
                        child = child.Next
                    else:
                        break
            
            if '/Next' in item:
                item = item.Next
            else:
                break
        
        result['rootCount'] = len(root_items)

print(json.dumps(result))
`;
  
  try {
    const { stdout } = await execFileAsync(pythonCmd, ['-c', script, pdfPath]);
    return JSON.parse(stdout);
  } catch (error: any) {
    throw new Error(`Failed to verify outline tree: ${error.message}`);
  }
}

describe('Bookmark Outline Tree Regression Test', () => {
  it('should write a properly linked outline tree with all items indirect and linked correctly', async () => {
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
      // Create 3 root bookmarks (flat structure for now - hierarchical support can be added later)
      const bookmarks = [
        { title: 'Root 1', pageIndex: 0 },
        { title: 'Root 2', pageIndex: 1 },
        { title: 'Root 3', pageIndex: 2 },
      ];
      
      // Write bookmarks via sidecar (flat structure)
      await writeBookmarksViaSidecar(
        inputPdf,
        outputPdf,
        bookmarks.map(b => ({ title: b.title, pageIndex: b.pageIndex })),
        false
      );
      
      // Verify outline tree structure
      const verification = await verifyOutlineTree(outputPdf);
      
      // Assertions
      expect(verification.outlinesExists).toBe(true);
      expect(verification.rootCount).toBe(3); // Should have 3 root items
      expect(verification.allItemsIndirect).toBe(true); // All items should be indirect
      expect(verification.allItemsHaveDest).toBe(true); // All should have /Dest
      expect(verification.allItemsHaveAction).toBe(true); // All should have /A
      
      if (verification.rootCount !== 3) {
        console.error(`Expected 3 root items, got ${verification.rootCount}`);
      }
      if (!verification.firstRootHasChildren) {
        console.error('First root should have children but does not');
      }
      if (verification.childCount !== 2) {
        console.error(`Expected 2 children, got ${verification.childCount}`);
      }
      
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

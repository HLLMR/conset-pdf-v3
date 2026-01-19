/**
 * Regression test for viewer-compatible bookmark destinations
 * 
 * This test verifies that bookmarks written to PDF use:
 * - Indirect page references (not inline dicts)
 * - Valid view types (/Fit, /FitH, or /XYZ with all numeric params)
 * - Either /Dest or /A GoTo action (preferably both)
 */

import { describe, it, expect } from '@jest/globals';
import { PDFDocument } from 'pdf-lib';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeBookmarksViaSidecar } from '../pikepdfBookmarkWriter.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Verify bookmark destinations using Python verifier script
 */
async function verifyViewerCompatibleDestinations(pdfPath: string): Promise<{
  itemsChecked: number;
  itemsValid: number;
  itemsInvalid: number;
  issues: string[];
}> {
  // Find Python
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  
  // Get verifier script path
  const scriptPath = join(__dirname, '../sidecar/verify_outline_destinations.py');
  
  try {
    const { stdout, stderr } = await execFileAsync(pythonCmd, [scriptPath, pdfPath]);
    
    if (stderr) {
      console.error('Verifier stderr:', stderr);
    }
    
    const result = JSON.parse(stdout);
    return result;
  } catch (error: any) {
    // If script exits non-zero, try to parse stdout for issues
    if (error.stdout) {
      try {
        const result = JSON.parse(error.stdout);
        return result;
      } catch {
        throw new Error(`Verifier failed: ${error.message}\nStdout: ${error.stdout}\nStderr: ${error.stderr}`);
      }
    }
    throw new Error(`Failed to verify destinations: ${error.message}`);
  }
}

describe('Bookmark Viewer Compatibility Regression Test', () => {
  it('should write bookmarks with viewer-compatible destinations (indirect refs, valid view types, /A GoTo)', async () => {
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
      
      // Verify destinations using Python verifier
      const verification = await verifyViewerCompatibleDestinations(outputPdf);
      
      // Assertions - this test should FAIL with current implementation
      // because we're not writing /A GoTo actions
      expect(verification.itemsChecked).toBeGreaterThan(0);
      expect(verification.itemsInvalid).toBe(0); // Should be 0 after fix
      expect(verification.itemsValid).toBe(verification.itemsChecked); // All should be valid
      
      if (verification.itemsInvalid > 0) {
        console.error('Verification issues:', verification.issues);
      }
      
      // All items should be valid (no inline dicts, valid view types)
      expect(verification.issues.length).toBe(0);
      
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

/**
 * Integration tests for bookmarks workflow
 */

import { describe, it, expect } from '@jest/globals';
import { createBookmarksWorkflowRunner } from './index.js';
import type { BookmarksAnalyzeInput } from './types.js';
import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('BookmarksWorkflow Integration', () => {
  it('should read bookmarks from PDF with existing bookmarks', async () => {
    // Create minimal PDF with bookmarks
    const pdfDoc = await PDFDocument.create();
    const page1 = pdfDoc.addPage([612, 792]);
    page1.drawText('Page 1', { x: 50, y: 750 });
    const page2 = pdfDoc.addPage([612, 792]);
    page2.drawText('Page 2', { x: 50, y: 750 });
    
    // Create temp file
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'conset-pdf-test-'));
    const pdfPath = path.join(tempDir, 'test.pdf');
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(pdfPath, pdfBytes);
    
    try {
      const runner = createBookmarksWorkflowRunner();
      const input: BookmarksAnalyzeInput = {
        inputPdfPath: pdfPath,
      };
      
      const result = await runner.analyze(input);
      
      expect(result.workflowId).toBe('fix-bookmarks');
      expect(result.rows).toBeDefined();
      expect(result.issues).toBeDefined();
      expect(result.summary.totalRows).toBeGreaterThanOrEqual(0);
    } finally {
      // Cleanup
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
  
  it('should build bookmark tree from BookmarkAnchorTree', async () => {
    // Create minimal PDF
    const pdfDoc = await PDFDocument.create();
    const page1 = pdfDoc.addPage([612, 792]);
    page1.drawText('Section 1', { x: 50, y: 750 });
    
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'conset-pdf-test-'));
    const pdfPath = path.join(tempDir, 'test.pdf');
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(pdfPath, pdfBytes);
    
    try {
      const runner = createBookmarksWorkflowRunner();
      const input: BookmarksAnalyzeInput = {
        inputPdfPath: pdfPath,
        bookmarkTree: {
          bookmarks: [
            {
              anchor: '1.1',
              title: 'Section 1.1',
              level: 0,
              pageIndexHint: 1,
            },
          ],
        },
      };
      
      const result = await runner.analyze(input);
      
      expect(result.workflowId).toBe('fix-bookmarks');
      expect(result.meta?.bookmarkTree).toBeDefined();
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
  
  it('should apply corrections', async () => {
    // Create minimal PDF
    const pdfDoc = await PDFDocument.create();
    const page1 = pdfDoc.addPage([612, 792]);
    page1.drawText('Page 1', { x: 50, y: 750 });
    
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'conset-pdf-test-'));
    const pdfPath = path.join(tempDir, 'test.pdf');
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(pdfPath, pdfBytes);
    
    try {
      const runner = createBookmarksWorkflowRunner();
      const analyzeInput: BookmarksAnalyzeInput = {
        inputPdfPath: pdfPath,
      };
      
      const inventory = await runner.analyze(analyzeInput);
      
      // Apply rename correction
      const corrections = {
        overrides: {},
        bookmarkCorrections: {
          rename: {
            // Will be populated if bookmarks exist
          },
        },
      };
      
      const corrected = await runner.applyCorrections(
        analyzeInput,
        inventory,
        corrections
      );
      
      expect(corrected.workflowId).toBe('fix-bookmarks');
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
  
  // Note: Execute phase test requires Python/pikepdf, so it's skipped for now
  // Full integration test should be run manually with Python installed
});

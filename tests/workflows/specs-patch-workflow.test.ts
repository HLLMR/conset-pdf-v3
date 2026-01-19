/**
 * Specs patch workflow tests
 */

import { describe, it, expect } from '@jest/globals';
import { createSpecsPatchWorkflowRunner } from '@conset-pdf/core';
import type { SpecsPatchAnalyzeInput } from '@conset-pdf/core';

describe('SpecsPatchWorkflow', () => {
  describe('createSpecsPatchWorkflowRunner', () => {
    it('should create a workflow runner', () => {
      const runner = createSpecsPatchWorkflowRunner();
      expect(runner).toBeDefined();
      expect(runner.analyze).toBeDefined();
      expect(runner.applyCorrections).toBeDefined();
      expect(runner.execute).toBeDefined();
    });
  });

  describe('analyze', () => {
    it('should return inventory result with structure', async () => {
      const runner = createSpecsPatchWorkflowRunner();
      
      // Create a minimal test PDF
      const { PDFDocument } = await import('pdf-lib');
      const { writeFileSync } = await import('fs');
      const { join } = await import('path');
      const { tmpdir } = await import('os');
      
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([612, 792]);
      page.drawText('SECTION 23 09 00', { x: 72, y: 720, size: 12 });
      
      const pdfBytes = await pdfDoc.save();
      const testPdfPath = join(tmpdir(), `test-specs-${Date.now()}.pdf`);
      writeFileSync(testPdfPath, pdfBytes);
      
      try {
        const input: SpecsPatchAnalyzeInput = {
          inputPdfPath: testPdfPath,
        };
        
        const result = await runner.analyze(input);
        
        expect(result).toBeDefined();
        expect(result.workflowId).toBe('specs-patch');
        expect(result.rows).toBeDefined();
        expect(Array.isArray(result.rows)).toBe(true);
        expect(result.issues).toBeDefined();
        expect(Array.isArray(result.issues)).toBe(true);
        expect(result.conflicts).toBeDefined();
        expect(Array.isArray(result.conflicts)).toBe(true);
        expect(result.summary).toBeDefined();
        expect(result.summary.totalRows).toBeGreaterThanOrEqual(0);
        expect(result.meta?.specDoc).toBeDefined();
        expect(result.meta?.bookmarkTree).toBeDefined();
      } finally {
        // Cleanup
        const { unlinkSync, existsSync } = await import('fs');
        if (existsSync(testPdfPath)) {
          unlinkSync(testPdfPath);
        }
      }
    });
  });
});

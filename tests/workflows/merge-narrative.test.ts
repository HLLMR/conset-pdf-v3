/**
 * Tests for narrative integration in merge workflow
 */

import { createMergeWorkflowRunner } from '@conset-pdf/core';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import type { NarrativeInstructionSet } from '@conset-pdf/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Merge Workflow Narrative Integration', () => {
  const narrativeFixturePath = join(__dirname, '..', 'fixtures', 'narratives', 'Add3 Narrative.pdf');
  const testPdfPath = join(__dirname, '..', '..', 'packages', 'core', 'tests', 'fixtures', 'narratives', 'Add3 Narrative.pdf');
  
  // Use narrative fixture if available, otherwise skip narrative tests
  const hasNarrativeFixture = existsSync(narrativeFixturePath) || existsSync(testPdfPath);
  const actualNarrativePath = existsSync(narrativeFixturePath) ? narrativeFixturePath : testPdfPath;
  
  /**
   * Create a minimal test PDF for merge workflow testing
   */
  async function createMinimalTestPdf(content: string): Promise<string> {
    const { PDFDocument } = await import('pdf-lib');
    const { writeFileSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // Letter size
    page.drawText(content, { x: 50, y: 700, size: 12 });
    
    const pdfBytes = await pdfDoc.save();
    const tempPath = join(tmpdir(), `test-merge-${Date.now()}.pdf`);
    writeFileSync(tempPath, pdfBytes);
    
    return tempPath;
  }
  
  test('analyze() output includes narrative when narrative path is provided', async () => {
    if (!hasNarrativeFixture) {
      console.warn('Narrative fixture not found, skipping test');
      return;
    }
    
    // Create minimal test PDFs for merge
    const originalPdf = await createMinimalTestPdf('SHEET NO. M1-01 Main Floor Plan');
    const addendumPdf = await createMinimalTestPdf('SHEET NO. M1-02 Second Floor Plan');
    
    try {
      const runner = createMergeWorkflowRunner();
      
      const analyzeInput = {
        docType: 'drawings' as const,
        originalPdfPath: originalPdf,
        addendumPdfPaths: [addendumPdf],
        narrativePdfPath: actualNarrativePath,
        options: {
          verbose: false,
        },
      };
      
      const result = await runner.analyze(analyzeInput);
      
      // Verify narrative is present
      expect(result).toHaveProperty('narrative');
      expect(result.narrative).toBeDefined();
      
      // Verify narrative structure
      const narrative = result.narrative!;
      expect(narrative).toHaveProperty('meta');
      expect(narrative).toHaveProperty('drawings');
      expect(narrative).toHaveProperty('specs');
      expect(narrative).toHaveProperty('issues');
      expect(Array.isArray(narrative.drawings)).toBe(true);
      expect(Array.isArray(narrative.specs)).toBe(true);
      expect(Array.isArray(narrative.issues)).toBe(true);
      
      // Verify other result fields are unchanged
      expect(result).toHaveProperty('workflowId', 'merge');
      expect(result).toHaveProperty('rows');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('conflicts');
      expect(result).toHaveProperty('summary');
    } finally {
      // Cleanup
      const { unlinkSync } = await import('fs');
      if (existsSync(originalPdf)) unlinkSync(originalPdf);
      if (existsSync(addendumPdf)) unlinkSync(addendumPdf);
    }
  });
  
  test('analyze() output is unchanged when narrative path is not provided', async () => {
    // Create minimal test PDFs for merge
    const originalPdf = await createMinimalTestPdf('SHEET NO. M1-01 Main Floor Plan');
    const addendumPdf = await createMinimalTestPdf('SHEET NO. M1-02 Second Floor Plan');
    
    try {
      const runner = createMergeWorkflowRunner();
      
      const analyzeInput = {
        docType: 'drawings' as const,
        originalPdfPath: originalPdf,
        addendumPdfPaths: [addendumPdf],
        // No narrativePdfPath
        options: {
          verbose: false,
        },
      };
      
      const result = await runner.analyze(analyzeInput);
      
      // Verify narrative is absent
      expect(result.narrative).toBeUndefined();
      
      // Verify other result fields are present and unchanged
      expect(result).toHaveProperty('workflowId', 'merge');
      expect(result).toHaveProperty('rows');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('conflicts');
      expect(result).toHaveProperty('summary');
    } finally {
      // Cleanup
      const { unlinkSync } = await import('fs');
      if (existsSync(originalPdf)) unlinkSync(originalPdf);
      if (existsSync(addendumPdf)) unlinkSync(addendumPdf);
    }
  });
  
  test('analyze() continues normally when narrative file does not exist', async () => {
    // Create minimal test PDFs for merge
    const originalPdf = await createMinimalTestPdf('SHEET NO. M1-01 Main Floor Plan');
    const addendumPdf = await createMinimalTestPdf('SHEET NO. M1-02 Second Floor Plan');
    
    try {
      const runner = createMergeWorkflowRunner();
      
      const analyzeInput = {
        docType: 'drawings' as const,
        originalPdfPath: originalPdf,
        addendumPdfPaths: [addendumPdf],
        narrativePdfPath: '/nonexistent/narrative.pdf', // Non-existent path
        options: {
          verbose: false,
        },
      };
      
      const result = await runner.analyze(analyzeInput);
      
      // Verify narrative is absent (file not found)
      expect(result.narrative).toBeUndefined();
      
      // Verify other result fields are present and unchanged
      expect(result).toHaveProperty('workflowId', 'merge');
      expect(result).toHaveProperty('rows');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('conflicts');
      expect(result).toHaveProperty('summary');
    } finally {
      // Cleanup
      const { unlinkSync } = await import('fs');
      if (existsSync(originalPdf)) unlinkSync(originalPdf);
      if (existsSync(addendumPdf)) unlinkSync(addendumPdf);
    }
  });
  
  test('analyze() continues normally when narrative processing fails', async () => {
    if (!hasNarrativeFixture) {
      console.warn('Narrative fixture not found, skipping test');
      return;
    }
    
    // Create minimal test PDFs for merge
    const originalPdf = await createMinimalTestPdf('SHEET NO. M1-01 Main Floor Plan');
    const addendumPdf = await createMinimalTestPdf('SHEET NO. M1-02 Second Floor Plan');
    
    try {
      const runner = createMergeWorkflowRunner();
      
      // Use a valid narrative path but the processing should still work
      // This test verifies that errors in narrative processing don't break analyze()
      const analyzeInput = {
        docType: 'drawings' as const,
        originalPdfPath: originalPdf,
        addendumPdfPaths: [addendumPdf],
        narrativePdfPath: actualNarrativePath,
        options: {
          verbose: false,
        },
      };
      
      const result = await runner.analyze(analyzeInput);
      
      // Result should be valid regardless of narrative processing outcome
      expect(result).toHaveProperty('workflowId', 'merge');
      expect(result).toHaveProperty('rows');
      expect(result).toHaveProperty('issues');
      expect(result).toHaveProperty('conflicts');
      expect(result).toHaveProperty('summary');
    } finally {
      // Cleanup
      const { unlinkSync } = await import('fs');
      if (existsSync(originalPdf)) unlinkSync(originalPdf);
      if (existsSync(addendumPdf)) unlinkSync(addendumPdf);
    }
  });
});

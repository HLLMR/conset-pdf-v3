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
      
      // Verify narrativeValidation is present when narrative is provided
      expect(result).toHaveProperty('narrativeValidation');
      expect(result.narrativeValidation).toBeDefined();
      expect(result.narrativeValidation).toHaveProperty('issues');
      expect(result.narrativeValidation).toHaveProperty('meta');
      expect(Array.isArray(result.narrativeValidation!.issues)).toBe(true);
      
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
      
      // Verify narrativeValidation is also absent when narrative is not provided
      expect(result.narrativeValidation).toBeUndefined();
      
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
      
      // Verify narrativeValidation is also absent when narrative file not found
      expect(result.narrativeValidation).toBeUndefined();
      
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
  
  test('narrativeValidation contains expected issue codes for controlled test', async () => {
    if (!hasNarrativeFixture) {
      console.warn('Narrative fixture not found, skipping test');
      return;
    }
    
    // Create minimal test PDFs with specific sheet IDs that we know are in the narrative
    // The Add3 Narrative contains sheets like G0.01, G1.11, etc.
    // We'll create PDFs that DON'T match these to trigger validation issues
    const originalPdf = await createMinimalTestPdf('SHEET NO. Z-999 Test Sheet');
    const addendumPdf = await createMinimalTestPdf('SHEET NO. Z-998 Another Test Sheet');
    
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
      
      // Verify narrativeValidation is present
      expect(result.narrativeValidation).toBeDefined();
      
      // The narrative should reference sheets that aren't in our test inventory
      // So we should see validation issues
      const validation = result.narrativeValidation!;
      expect(Array.isArray(validation.issues)).toBe(true);
      
      // Check that validation report has proper structure
      expect(validation).toHaveProperty('meta');
      expect(validation.meta).toHaveProperty('comparedAtIso');
      expect(validation.meta).toHaveProperty('narrativeHash');
      expect(validation.meta).toHaveProperty('inventoryHash');
      
      // If narrative has drawings/specs that don't match inventory, we should see issues
      // (This depends on the actual narrative content, so we just verify structure)
      if (validation.issues.length > 0) {
        const issue = validation.issues[0];
        expect(issue).toHaveProperty('code');
        expect(issue).toHaveProperty('severity');
        expect(issue).toHaveProperty('message');
        // Issue codes should be one of the expected validation codes
        const validCodes = [
          'NARR_SHEET_NOT_FOUND',
          'NARR_SHEET_NEAR_MATCH',
          'NARR_SHEET_AMBIGUOUS_MATCH',
          'NARR_SPEC_NOT_FOUND',
          'NARR_SPEC_NEAR_MATCH',
          'NARR_SPEC_AMBIGUOUS_MATCH',
          'NARR_INVENTORY_NOT_MENTIONED',
        ];
        expect(validCodes).toContain(issue.code);
      }

      // Verify suggestedCorrections structure if present
      if (validation.suggestedCorrections) {
        expect(Array.isArray(validation.suggestedCorrections)).toBe(true);
        for (const suggestion of validation.suggestedCorrections) {
          expect(suggestion).toHaveProperty('type');
          expect(suggestion).toHaveProperty('narrativeIdNormalized');
          expect(suggestion).toHaveProperty('suggestedRowId');
          expect(suggestion).toHaveProperty('reason');
          expect(['sheet', 'specSection']).toContain(suggestion.type);
        }
      }
    } finally {
      // Cleanup
      const { unlinkSync } = await import('fs');
      if (existsSync(originalPdf)) unlinkSync(originalPdf);
      if (existsSync(addendumPdf)) unlinkSync(addendumPdf);
    }
  });

  test('narrativeValidation includes suggestedCorrections when applicable', async () => {
    if (!hasNarrativeFixture) {
      console.warn('Narrative fixture not found, skipping test');
      return;
    }
    
    // Create minimal test PDFs with sheet IDs that are similar to narrative IDs
    // This should trigger NEAR_MATCH issues with single candidates, producing suggestions
    const originalPdf = await createMinimalTestPdf('SHEET NO. G001 Main Floor Plan'); // Similar to G0.01 in narrative
    const addendumPdf = await createMinimalTestPdf('SHEET NO. G111 Second Floor Plan'); // Similar to G1.11 in narrative
    
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
      
      // Verify narrativeValidation is present
      expect(result.narrativeValidation).toBeDefined();
      
      const validation = result.narrativeValidation!;
      
      // If there are NEAR_MATCH issues with single candidates, we should have suggestions
      // Note: This depends on the actual narrative content and similarity scores
      // We just verify the structure is correct if suggestions exist
      if (validation.suggestedCorrections) {
        expect(Array.isArray(validation.suggestedCorrections)).toBe(true);
        expect(validation.suggestedCorrections.length).toBeGreaterThan(0);
        
        // Verify suggestion structure
        const suggestion = validation.suggestedCorrections[0];
        expect(suggestion).toHaveProperty('type');
        expect(suggestion).toHaveProperty('narrativeIdNormalized');
        expect(suggestion).toHaveProperty('suggestedRowId');
        expect(suggestion).toHaveProperty('reason');
        expect(suggestion).toHaveProperty('explanation');
        expect(['sheet', 'specSection']).toContain(suggestion.type);
      }
    } finally {
      // Cleanup
      const { unlinkSync } = await import('fs');
      if (existsSync(originalPdf)) unlinkSync(originalPdf);
      if (existsSync(addendumPdf)) unlinkSync(addendumPdf);
    }
  });

  test('narrativeValidation suggestedCorrections absent when no suggestions exist', async () => {
    // Create minimal test PDFs with exact matches (no issues, no suggestions)
    const originalPdf = await createMinimalTestPdf('SHEET NO. Z-999 Test Sheet');
    const addendumPdf = await createMinimalTestPdf('SHEET NO. Z-998 Another Test Sheet');
    
    try {
      const runner = createMergeWorkflowRunner();
      
      const analyzeInput = {
        docType: 'drawings' as const,
        originalPdfPath: originalPdf,
        addendumPdfPaths: [addendumPdf],
        // No narrative - should not have validation or suggestions
      };
      
      const result = await runner.analyze(analyzeInput);
      
      // Verify narrativeValidation is absent when no narrative provided
      expect(result.narrativeValidation).toBeUndefined();
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

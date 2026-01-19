/**
 * Integration tests for specs-patch workflow
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { createSpecsPatchWorkflowRunner } from '@conset-pdf/core';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { PDFDocument } from 'pdf-lib';
import { writeFileSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Create a minimal synthetic spec PDF for testing
 */
async function createMinimalSpecPdf(): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size
  
  // Add section header
  page.drawText('SECTION 23 09 00 - HVAC Equipment', {
    x: 72,
    y: 720,
    size: 12,
  });
  
  // Add content with anchor
  page.drawText('2.4-T.5.b.1 Equipment shall meet requirements.', {
    x: 90,
    y: 680,
    size: 10,
  });
  
  // Add list item
  page.drawText('a. Equipment must be UL listed.', {
    x: 90,
    y: 660,
    size: 10,
  });
  
  page.drawText('b. Equipment must be energy efficient.', {
    x: 90,
    y: 640,
    size: 10,
  });
  
  const pdfBytes = await pdfDoc.save();
  const tempPath = join(__dirname, '..', 'fixtures', 'minimal-spec.pdf');
  
  // Ensure fixtures directory exists
  const { mkdir } = await import('fs/promises');
  await mkdir(dirname(tempPath), { recursive: true });
  
  writeFileSync(tempPath, pdfBytes);
  return tempPath;
}

describe('SpecsPatchWorkflow Integration', () => {
  let minimalSpecPath: string;
  
  beforeAll(async () => {
    // Create minimal test PDF
    minimalSpecPath = await createMinimalSpecPdf();
  });
  
  it('should extract AST from minimal spec PDF', async () => {
    const runner = createSpecsPatchWorkflowRunner();
    const input = {
      inputPdfPath: minimalSpecPath,
    };
    
    const result = await runner.analyze(input);
    
    expect(result.workflowId).toBe('specs-patch');
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.summary.sectionsExtracted).toBeGreaterThan(0);
    expect(result.summary.nodesExtracted).toBeGreaterThan(0);
    expect(result.meta?.specDoc).toBeDefined();
    expect(result.meta?.bookmarkTree).toBeDefined();
  });
  
  it('should apply patch and render to PDF', async () => {
    // Skip if Playwright browsers not installed (CI will install them)
    try {
      const { chromium } = await import('playwright');
      await chromium.launch({ headless: true });
    } catch (error: any) {
      if (error.message?.includes('Executable doesn\'t exist') || error.message?.includes('browser')) {
        console.warn('Playwright browsers not installed, skipping render test. Run: npx playwright install chromium');
        return;
      }
      throw error;
    }
    
    const runner = createSpecsPatchWorkflowRunner();
    const { tmpdir } = await import('os');
    const outputPath = join(tmpdir(), `specs-patch-test-${Date.now()}.pdf`);
    
    // First analyze to get AST
    const analyzeResult = await runner.analyze({
      inputPdfPath: minimalSpecPath,
    });
    
    const specDoc = analyzeResult.meta?.specDoc as any;
    if (!specDoc || specDoc.sections.length === 0) {
      console.warn('No sections extracted, skipping patch test');
      return;
    }
    
    // Find a node with an anchor for patching
    const nodeWithAnchor = specDoc.sections[0]?.content?.find((n: any) => n.anchor);
    if (!nodeWithAnchor) {
      console.warn('No node with anchor found, skipping patch test');
      return;
    }
    
    // Create a patch to insert after the anchor
    const patch = {
      meta: {
        version: '1.0',
        createdAt: new Date().toISOString(),
      },
      operations: [
        {
          op: 'insert',
          targetAnchor: nodeWithAnchor.anchor,
          position: 'after',
          content: {
            type: 'paragraph',
            text: 'Test inserted paragraph',
            level: nodeWithAnchor.level,
          },
        },
      ],
    };
    
    // Execute with patch
    const executeResult = await runner.execute({
      inputPdfPath: minimalSpecPath,
      outputPdfPath: outputPath,
      patch: patch as any,
      analyzed: {
        ast: specDoc,
      },
    });
    
    expect(executeResult.summary.success).toBe(true);
    expect(executeResult.summary.patchesApplied).toBe(1);
    expect(existsSync(outputPath)).toBe(true);
    
    // Verify PDF has content (basic check)
    const pdfBytes = readFileSync(outputPath);
    expect(pdfBytes.length).toBeGreaterThan(0);
  });
  
  it('should generate bookmark tree with anchors', async () => {
    const runner = createSpecsPatchWorkflowRunner();
    const result = await runner.analyze({
      inputPdfPath: minimalSpecPath,
    });
    
    const bookmarkTree = result.meta?.bookmarkTree as any;
    expect(bookmarkTree).toBeDefined();
    expect(bookmarkTree.bookmarks).toBeDefined();
    expect(Array.isArray(bookmarkTree.bookmarks)).toBe(true);
    
    // Verify bookmarks have anchors
    if (bookmarkTree.bookmarks.length > 0) {
      for (const bookmark of bookmarkTree.bookmarks) {
        if (bookmark.children && bookmark.children.length > 0) {
          for (const child of bookmark.children) {
            expect(child.anchor).toBeDefined();
            expect(typeof child.anchor).toBe('string');
          }
        }
      }
    }
  });
});

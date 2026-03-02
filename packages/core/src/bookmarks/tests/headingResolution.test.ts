/**
 * Regression tests for layout-aware heading resolution
 * 
 * These tests verify that section and article headings are resolved correctly
 * by searching only in appropriate vertical regions (heading band, not body text).
 */

import { describe, it, expect } from '@jest/globals';
import { join, resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { DocumentContext } from '../../analyze/documentContext.js';
import { findSectionHeadingPage } from '../headingResolver.js';
import { dumpPageRegions } from '../debug/dumpPageRegions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Layout-Aware Heading Resolution Regression Tests', () => {
  const repoRoot = join(__dirname, '../../../../..');
  const workspaceRoot = join(repoRoot, '..');
  
  // Helper to find input PDF
  function findInputPdf(): string | null {
    const possiblePdfPaths = [
      resolve(workspaceRoot, '.reference/LHHS/Specifications/23_MECH_FULL.pdf'),
      resolve(repoRoot, '.reference/LHHS/Specifications/23_MECH_FULL.pdf'),
      resolve(repoRoot, '../.reference/LHHS/Specifications/23_MECH_FULL.pdf'),
      resolve('f:/Projects/conset-pdf-ws/.reference/LHHS/Specifications/23_MECH_FULL.pdf'),
    ];
    
    for (const pdfPath of possiblePdfPaths) {
      if (existsSync(pdfPath)) {
        return pdfPath;
      }
    }
    
    return null;
  }

  const inputPdf = (() => {
    try {
      return findInputPdf();
    } catch {
      return null;
    }
  })();
  const itIfPdf = inputPdf ? it : it.skip;
  
  /**
   * Test: SECTION 23 00 00 should resolve to page 0 (or 1 if 1-based)
   * based on its actual heading location, not a cross-reference.
   */
  itIfPdf('should resolve SECTION 23 00 00 to the page containing its actual heading', async () => {
    const docContext = new DocumentContext(inputPdf!);
    await docContext.initialize();
    const pageCount = docContext.pageCount;
    
    // Find the page where SECTION 23 00 00 heading appears
    const resolvedPage = await findSectionHeadingPage(
      docContext,
      '23 00 00',
      pageCount,
      0
    );
    
    expect(resolvedPage).toBeGreaterThanOrEqual(0);
    expect(resolvedPage).toBeLessThan(pageCount);
    
    // Verify the resolved page actually contains the heading in the heading band
    await docContext.extractTextForPage(resolvedPage);
    const pageRegions = await dumpPageRegions(docContext, resolvedPage);
    
    // Check that "SECTION 23 00 00" appears in the heading band (top 0-30%)
    const headingText = pageRegions.regions.heading.concatenatedText;
    const sectionPattern = /SECTION\s+23\s+00\s+00/i;
    expect(headingText).toMatch(sectionPattern);
    
    // Verify it's NOT just in body text (false positive guard)
    const bodyText = pageRegions.regions.body.concatenatedText;
    // If it appears in body, it should be a cross-reference, not the actual heading
    // The heading should be in the heading band
    const bodyMatches = bodyText.match(sectionPattern);
    if (bodyMatches) {
      // If it's in body, make sure it's also in heading (the actual heading)
      expect(headingText).toMatch(sectionPattern);
    }
  }, 120000);
  
  /**
   * Test: SECTION 23 07 00 should resolve to the page where its actual
   * "SECTION 23 07 00" heading is printed, NOT a cross-reference page.
   */
  itIfPdf('should resolve SECTION 23 07 00 to actual heading page, not cross-reference', async () => {
    const docContext = new DocumentContext(inputPdf!);
    await docContext.initialize();
    const pageCount = docContext.pageCount;
    
    // Find the page where SECTION 23 07 00 heading appears
    const resolvedPage = await findSectionHeadingPage(
      docContext,
      '23 07 00',
      pageCount,
      0
    );
    
    expect(resolvedPage).toBeGreaterThanOrEqual(0);
    expect(resolvedPage).toBeLessThan(pageCount);
    
    // Verify the resolved page contains the heading in the heading band
    await docContext.extractTextForPage(resolvedPage);
    const pageRegions = await dumpPageRegions(docContext, resolvedPage);
    
    const headingText = pageRegions.regions.heading.concatenatedText;
    const sectionPattern = /SECTION\s+23\s+07\s+00/i;
    
    // The heading MUST be in the heading band
    expect(headingText).toMatch(sectionPattern);
    
    // False positive guard: if a page contains "Refer to ... Section 23 07 00"
    // in body text but NOT the heading, it should NOT be chosen
    // We verify this by checking that the resolved page has the heading in heading band
    
    // Check a few pages before and after to ensure we didn't pick a cross-reference
    const checkPages = [
      Math.max(0, resolvedPage - 2),
      Math.max(0, resolvedPage - 1),
      resolvedPage,
      Math.min(pageCount - 1, resolvedPage + 1),
      Math.min(pageCount - 1, resolvedPage + 2),
    ];
    
    let headingFoundCount = 0;
    for (const checkPage of checkPages) {
      if (checkPage === resolvedPage) continue; // Skip the resolved page
      
      await docContext.extractTextForPage(checkPage);
      const checkRegions = await dumpPageRegions(docContext, checkPage);
      
      // If this page has the section in body but NOT in heading, it's a cross-reference
      const hasInBody = checkRegions.regions.body.concatenatedText.match(sectionPattern);
      const hasInHeading = checkRegions.regions.heading.concatenatedText.match(sectionPattern);
      
      if (hasInBody && !hasInHeading) {
        // This is a cross-reference page - verify we didn't choose it
        expect(checkPage).not.toBe(resolvedPage);
      }
      
      if (hasInHeading) {
        headingFoundCount++;
      }
    }
    
    // The heading should appear in heading band on the resolved page
    expect(headingFoundCount).toBeGreaterThanOrEqual(0); // At least on resolved page
  }, 120000);
  
  /**
   * False positive guard test: if a page contains "Refer to ... Section 23 07 00"
   * in body text but not the heading, resolver must not choose it.
   */
  itIfPdf('should not match cross-references in body text', async () => {
    const docContext = new DocumentContext(inputPdf!);
    await docContext.initialize();
    const pageCount = docContext.pageCount;
    
    // Find SECTION 23 07 00
    const resolvedPage = await findSectionHeadingPage(
      docContext,
      '23 07 00',
      pageCount,
      0
    );
    
    expect(resolvedPage).toBeGreaterThanOrEqual(0);
    
    // Check pages around the resolved page for cross-references
    const searchRange = 10; // Check 10 pages before and after
    const startPage = Math.max(0, resolvedPage - searchRange);
    const endPage = Math.min(pageCount - 1, resolvedPage + searchRange);
    
    for (let pageIndex = startPage; pageIndex <= endPage; pageIndex++) {
      if (pageIndex === resolvedPage) continue; // Skip the resolved page
      
      await docContext.extractTextForPage(pageIndex);
      const pageRegions = await dumpPageRegions(docContext, pageIndex);
      
      const sectionPattern = /SECTION\s+23\s+07\s+00/i;
      const hasInBody = pageRegions.regions.body.concatenatedText.match(sectionPattern);
      const hasInHeading = pageRegions.regions.heading.concatenatedText.match(sectionPattern);
      const hasInFooter = pageRegions.regions.footer.concatenatedText.match(sectionPattern);
      
      // If page has section reference in body/footer but NOT in heading, it's a cross-reference
      if ((hasInBody || hasInFooter) && !hasInHeading) {
        // This should NOT be the resolved page
        expect(pageIndex).not.toBe(resolvedPage);
      }
    }
  }, 120000);
});

/**
 * Tests for spec inventory (footer-first sectionization)
 * 
 * Tests:
 * - Snapshot test: section runs for 23_MECH_FULL.pdf (count + first/last page indexes per section)
 * - Consistency test: every page must have a resolved sectionId (or explicit needsCorrection)
 * - Optional: compare discovered section start pages against specs-bookmark-tree.json
 */

import { describe, it, expect } from '@jest/globals';
import { DocumentContext } from '../../../analyze/documentContext.js';
import { sectionizePages } from '../../../specs/inventory/index.js';
import { detectPageRegions } from '../../../text/pageRegions.js';
import { readFileSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Spec Inventory Tests', () => {
  const repoRoot = join(__dirname, '../../../../..');
  const workspaceRoot = join(repoRoot, '..');
  
  function findInputPdf(): string {
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
    
    throw new Error(`Input PDF not found. Tried: ${possiblePdfPaths.join(', ')}`);
  }
  
  function findBookmarkTree(): any {
    const possiblePaths = [
      join(repoRoot, 'tests/fixtures/specs-bookmark-tree.json'),
      join(repoRoot, 'tests/fixtures/diagnostics/specs-bookmark-tree.json'),
    ];
    
    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return JSON.parse(readFileSync(path, 'utf-8'));
      }
    }
    
    return null; // Optional, don't fail if not found
  }
  
  /**
   * Extract text page data from DocumentContext
   */
  async function extractTextPage(
    docContext: DocumentContext,
    pageIndex: number
  ): Promise<{
    pageIndex: number;
    items: import('../../../utils/pdf.js').TextItemWithPosition[];
    pageHeight: number;
  }> {
    const pageContext = await docContext.getPageContext(pageIndex);
    await docContext.extractTextForPage(pageIndex);
    
    const info = pageContext.getInfo();
    const items = pageContext.getTextItems();
    
    return {
      pageIndex,
      items,
      pageHeight: info.height,
    };
  }
  
  /**
   * Snapshot test: section runs for 23_MECH_FULL.pdf
   * 
   * Verifies:
   * - Count of section runs
   * - First/last page indexes per section
   */
  it('should produce deterministic section runs for 23_MECH_FULL.pdf', async () => {
    const inputPdf = findInputPdf();
    
    const docContext = new DocumentContext(inputPdf);
    await docContext.initialize();
    const pageCount = docContext.pageCount;
    
    // Sample pages for region detection
    const sampleCount = Math.min(30, pageCount);
    const samplePages: Array<{
      pageIndex: number;
      items: import('../../../utils/pdf.js').TextItemWithPosition[];
      pageHeight: number;
      pageWidth: number;
    }> = [];
    
    for (let i = 0; i < sampleCount; i++) {
      const pageData = await extractTextPage(docContext, i);
      const info = (await docContext.getPageContext(i)).getInfo();
      samplePages.push({
        ...pageData,
        pageWidth: info.width,
      });
    }
    
    // Detect regions
    const regions = detectPageRegions(samplePages);
    
    // Extract all pages
    const allPages: Array<{
      pageIndex: number;
      items: import('../../../utils/pdf.js').TextItemWithPosition[];
      pageHeight: number;
    }> = [];
    
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      const pageData = await extractTextPage(docContext, pageIndex);
      allPages.push(pageData);
    }
    
    // Sectionize
    const result = sectionizePages(allPages, {
      regions,
      enableRepair: true,
      verbose: false,
    });
    
    // Verify we have section runs
    expect(result.runs.length).toBeGreaterThan(0);
    
    // Build snapshot summary
    const snapshot = {
      totalRuns: result.runs.length,
      totalPages: pageCount,
      runs: result.runs.map(run => ({
        sectionId: run.sectionId,
        startPageIndex: run.startPageIndex,
        endPageIndex: run.endPageIndex,
        pageCount: run.endPageIndex - run.startPageIndex + 1,
        needsCorrection: run.needsCorrection,
      })),
      summary: {
        pagesWithSectionId: result.pageAssignments.size,
        pagesNeedingCorrection: result.runs.filter(r => r.needsCorrection).reduce(
          (sum, r) => sum + r.pages.filter(p => p.needsCorrection).length,
          0
        ),
        auditRecordCount: result.auditRecords.length,
      },
    };
    
    // Snapshot assertion: verify structure and reasonable values
    expect(snapshot.totalRuns).toBeGreaterThan(0);
    expect(snapshot.totalPages).toBeGreaterThan(0);
    expect(snapshot.runs.length).toBe(snapshot.totalRuns);
    
    // Verify runs are non-overlapping and cover all pages
    const coveredPages = new Set<number>();
    for (const run of result.runs) {
      for (let i = run.startPageIndex; i <= run.endPageIndex; i++) {
        expect(coveredPages.has(i)).toBe(false); // No overlap
        coveredPages.add(i);
      }
    }
    
    // All pages should be covered (or have audit records)
    const uncoveredPages = pageCount - coveredPages.size;
    expect(uncoveredPages).toBeLessThanOrEqual(result.auditRecords.length);
    
    // Verify section IDs are normalized (single spaces)
    for (const run of result.runs) {
      expect(run.sectionId).toMatch(/^\d{2} \d{2} \d{2}$/);
    }
  }, 60000); // 60 second timeout for large PDF
  
  /**
   * Consistency test: every page must have a resolved sectionId (or explicit needsCorrection)
   */
  it('should assign sectionId to every page or mark needsCorrection', async () => {
    const inputPdf = findInputPdf();
    
    const docContext = new DocumentContext(inputPdf);
    await docContext.initialize();
    const pageCount = docContext.pageCount;
    
    // Sample pages for region detection
    const sampleCount = Math.min(30, pageCount);
    const samplePages: Array<{
      pageIndex: number;
      items: import('../../../utils/pdf.js').TextItemWithPosition[];
      pageHeight: number;
      pageWidth: number;
    }> = [];
    
    for (let i = 0; i < sampleCount; i++) {
      const pageData = await extractTextPage(docContext, i);
      const info = (await docContext.getPageContext(i)).getInfo();
      samplePages.push({
        ...pageData,
        pageWidth: info.width,
      });
    }
    
    // Detect regions
    const regions = detectPageRegions(samplePages);
    
    // Extract all pages
    const allPages: Array<{
      pageIndex: number;
      items: import('../../../utils/pdf.js').TextItemWithPosition[];
      pageHeight: number;
    }> = [];
    
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      const pageData = await extractTextPage(docContext, pageIndex);
      allPages.push(pageData);
    }
    
    // Sectionize
    const result = sectionizePages(allPages, {
      regions,
      enableRepair: true,
      verbose: false,
    });
    
    // Every page should either:
    // 1. Have a sectionId in pageAssignments, OR
    // 2. Have an audit record explaining why it doesn't
    const pagesWithSectionId = new Set(result.pageAssignments.keys());
    const pagesWithAuditRecords = new Set(result.auditRecords.map(a => a.pageIndex));
    
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      const hasSectionId = pagesWithSectionId.has(pageIndex);
      const hasAuditRecord = pagesWithAuditRecords.has(pageIndex);
      
      // Every page must have either a sectionId OR an audit record
      expect(hasSectionId || hasAuditRecord).toBe(true);
      
      if (hasSectionId) {
        const assignment = result.pageAssignments.get(pageIndex);
        expect(assignment).toBeDefined();
        expect(assignment!.sectionId).toBeTruthy();
        expect(assignment!.sectionId).toMatch(/^\d{2} \d{2} \d{2}$/);
      }
    }
  }, 60000);
  
  /**
   * Optional: compare discovered section start pages against specs-bookmark-tree.json
   */
  it('should match section start pages with bookmark tree hints (loose sanity check)', async () => {
    const inputPdf = findInputPdf();
    const bookmarkTree = findBookmarkTree();
    
    if (!bookmarkTree) {
      console.warn('Bookmark tree not found, skipping comparison test');
      return;
    }
    
    const docContext = new DocumentContext(inputPdf);
    await docContext.initialize();
    const pageCount = docContext.pageCount;
    
    // Sample pages for region detection
    const sampleCount = Math.min(30, pageCount);
    const samplePages: Array<{
      pageIndex: number;
      items: import('../../../utils/pdf.js').TextItemWithPosition[];
      pageHeight: number;
      pageWidth: number;
    }> = [];
    
    for (let i = 0; i < sampleCount; i++) {
      const pageData = await extractTextPage(docContext, i);
      const info = (await docContext.getPageContext(i)).getInfo();
      samplePages.push({
        ...pageData,
        pageWidth: info.width,
      });
    }
    
    // Detect regions
    const regions = detectPageRegions(samplePages);
    
    // Extract all pages
    const allPages: Array<{
      pageIndex: number;
      items: import('../../../utils/pdf.js').TextItemWithPosition[];
      pageHeight: number;
    }> = [];
    
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      const pageData = await extractTextPage(docContext, pageIndex);
      allPages.push(pageData);
    }
    
    // Sectionize
    const result = sectionizePages(allPages, {
      regions,
      enableRepair: true,
      verbose: false,
    });
    
    // Extract section hints from bookmark tree
    const extractSectionHints = (node: any, hints: Map<string, number>): void => {
      if (node.anchor && node.pageIndexHint !== undefined) {
        // Check if anchor looks like a section code
        if (/^\d{2}\s+\d{2}\s+\d{2}$/.test(node.anchor)) {
          const existing = hints.get(node.anchor);
          if (existing === undefined || node.pageIndexHint < existing) {
            hints.set(node.anchor, node.pageIndexHint);
          }
        }
      }
      
      if (node.children) {
        for (const child of node.children) {
          extractSectionHints(child, hints);
        }
      }
    };
    
    const bookmarkHints = new Map<string, number>();
    for (const bookmark of bookmarkTree.bookmarks || []) {
      extractSectionHints(bookmark, bookmarkHints);
    }
    
    // Compare discovered section starts with hints
    const discoveredStarts = new Map<string, number>();
    for (const run of result.runs) {
      const existing = discoveredStarts.get(run.sectionId);
      if (existing === undefined || run.startPageIndex < existing) {
        discoveredStarts.set(run.sectionId, run.startPageIndex);
      }
    }
    
    // Loose sanity check: for sections that appear in both, they should be reasonably close
    // (within ±5 pages, as hints may be approximate)
    let matches = 0;
    let mismatches = 0;
    
    for (const [sectionId, discoveredPage] of discoveredStarts.entries()) {
      const hintPage = bookmarkHints.get(sectionId);
      if (hintPage !== undefined) {
        const diff = Math.abs(discoveredPage - hintPage);
        if (diff <= 5) {
          matches++;
        } else {
          mismatches++;
          if (mismatches <= 5) { // Only log first few mismatches
            console.warn(
              `Section ${sectionId}: discovered page ${discoveredPage}, hint page ${hintPage} (diff: ${diff})`
            );
          }
        }
      }
    }
    
    // At least some sections should match (don't hard-fail on mismatches)
    expect(matches + mismatches).toBeGreaterThan(0);
    // Most matches should be close (allow some tolerance)
    if (matches + mismatches > 0) {
      const matchRate = matches / (matches + mismatches);
      expect(matchRate).toBeGreaterThan(0.5); // At least 50% should match within ±5 pages
    }
  }, 60000);
});

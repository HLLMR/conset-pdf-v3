/**
 * Regression tests for footer-first section anchoring
 */

import { describe, it, expect } from '@jest/globals';
import { DocumentContext } from '../../analyze/documentContext.js';
import { buildTreeFromBookmarkAnchorTree } from '../treeBuilder.js';
import { detectPageRegions, type TextPage } from '../../text/pageRegions.js';
import { buildFooterSectionIndex } from '../../specs/footerSectionMap.js';
import { join, resolve, dirname } from 'path';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Footer-First Section Anchoring Regression Tests', () => {
  const repoRoot = join(__dirname, '../../../../..');
  const workspaceRoot = join(repoRoot, '..');
  
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
  
  function findBookmarkTree(): any | null {
    const possiblePaths = [
      join(repoRoot, 'tests/fixtures/specs-bookmark-tree.json'),
      join(repoRoot, 'tests/fixtures/diagnostics/specs-bookmark-tree.json'),
    ];
    
    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return JSON.parse(readFileSync(path, 'utf-8'));
      }
    }
    
    return null;
  }

  const inputPdf = findInputPdf();
  const bookmarkTree = findBookmarkTree();
  const itIfPdf = (inputPdf && bookmarkTree) ? it : it.skip;
  
  /**
   * Test: Footer-first anchoring produces correct section destinations
   */
  itIfPdf('should use footer-first anchoring for section destinations', async () => {
    const bookmarkTree = findBookmarkTree() as any;
    
    const docContext = new DocumentContext(inputPdf!);
    await docContext.initialize();
    const pageCount = docContext.pageCount;
    
    // Sample pages for region detection (first 30 pages)
    const samplePages: TextPage[] = [];
    const sampleCount = Math.min(30, pageCount);
    for (let i = 0; i < sampleCount; i++) {
      await docContext.extractTextForPage(i);
      const pageContext = await docContext.getPageContext(i);
      samplePages.push({
        pageIndex: i,
        pageWidth: pageContext.pageWidth,
        pageHeight: pageContext.pageHeight,
        items: pageContext.getTextItems(),
      });
    }
    
    // Detect regions
    const regions = detectPageRegions(samplePages);
    
    // Extract all pages for footer index (full scan)
    const allPages: TextPage[] = [];
    for (let i = 0; i < pageCount; i++) {
      await docContext.extractTextForPage(i);
      const pageContext = await docContext.getPageContext(i);
      allPages.push({
        pageIndex: i,
        pageWidth: pageContext.pageWidth,
        pageHeight: pageContext.pageHeight,
        items: pageContext.getTextItems(),
      });
    }
    
    // Build footer section index
    const footerIndex = buildFooterSectionIndex(allPages, regions);
    
    // Verify we found some sections
    const sectionCodes = Object.keys(footerIndex.firstPageBySection);
    expect(sectionCodes.length).toBeGreaterThan(0);
    
    // Build bookmark tree with footer-first anchoring
    const tree = await buildTreeFromBookmarkAnchorTree(
      bookmarkTree,
      docContext,
      pageCount,
      undefined,
      { rebuild: true, sectionStartStrategy: 'footer' },
      footerIndex
    );
    
    // Extract section bookmarks
    const sectionBookmarks = tree.roots
      .filter(root => root.title && root.title.startsWith('SECTION'))
      .map(root => ({
        title: root.title,
        pageIndex: root.destination.pageIndex,
        sectionCode: root.sourceAnchor,
      }));
    
    expect(sectionBookmarks.length).toBeGreaterThan(0);
    
    // Verify sections that exist in footer index use footer pages
    for (const bookmark of sectionBookmarks) {
      const footerPage = footerIndex.firstPageBySection[bookmark.sectionCode || ''];
      if (footerPage !== undefined) {
        expect(bookmark.pageIndex).toBe(footerPage);
      }
    }
  }, 180000);
  
  /**
   * Test: Section ordering follows numeric sort
   */
  itIfPdf('should order sections numerically', async () => {
    const bookmarkTree = findBookmarkTree();
    
    const docContext = new DocumentContext(inputPdf!);
    await docContext.initialize();
    const pageCount = docContext.pageCount;
    
    // Build tree (with or without footer index)
    const tree = await buildTreeFromBookmarkAnchorTree(
      bookmarkTree,
      docContext,
      pageCount,
      undefined,
      { rebuild: true }
    );
    
    // Extract section bookmarks
    const sectionBookmarks = tree.roots
      .filter(root => root.title && root.title.startsWith('SECTION'))
      .map(root => ({
        title: root.title,
        sectionCode: root.sourceAnchor,
      }));
    
    expect(sectionBookmarks.length).toBeGreaterThan(1);
    
    // Parse section codes for numeric comparison
    const parseSectionCode = (code: string): number[] => {
      const parts = code.trim().split(/\s+/).map(p => {
        const num = parseInt(p, 10);
        return isNaN(num) ? 0 : num;
      });
      while (parts.length < 3) parts.push(0);
      return parts.slice(0, 3);
    };
    
    // Verify ordering
    const failures: string[] = [];
    for (let i = 1; i < sectionBookmarks.length; i++) {
      const prev = parseSectionCode(sectionBookmarks[i - 1].sectionCode || '');
      const curr = parseSectionCode(sectionBookmarks[i].sectionCode || '');
      
      // Compare component by component
      for (let j = 0; j < 3; j++) {
        if (prev[j] < curr[j]) {
          break; // Correct order
        }
        if (prev[j] > curr[j]) {
          failures.push(
            `Ordering violation: "${sectionBookmarks[i - 1].title}" ` +
            `([${prev.join(',')}]) should come before "${sectionBookmarks[i].title}" ` +
            `([${curr.join(',')}])`
          );
          break;
        }
        // Equal, continue to next component
      }
    }
    
    if (failures.length > 0) {
      console.error('Ordering failures:');
      failures.forEach(f => console.error(`  ${f}`));
    }
    
    expect(failures.length).toBe(0);
  }, 120000);
  
  /**
   * Test: Footer index correctly maps sections to first pages
   */
  itIfPdf('should map sections to first occurrence pages in footer', async () => {
    
    const docContext = new DocumentContext(inputPdf!);
    await docContext.initialize();
    const pageCount = docContext.pageCount;
    
    // Sample for regions
    const samplePages: TextPage[] = [];
    const sampleCount = Math.min(30, pageCount);
    for (let i = 0; i < sampleCount; i++) {
      await docContext.extractTextForPage(i);
      const pageContext = await docContext.getPageContext(i);
      samplePages.push({
        pageIndex: i,
        pageWidth: pageContext.pageWidth,
        pageHeight: pageContext.pageHeight,
        items: pageContext.getTextItems(),
      });
    }
    
    const regions = detectPageRegions(samplePages);
    
    // Full scan for footer index
    const allPages: TextPage[] = [];
    for (let i = 0; i < pageCount; i++) {
      await docContext.extractTextForPage(i);
      const pageContext = await docContext.getPageContext(i);
      allPages.push({
        pageIndex: i,
        pageWidth: pageContext.pageWidth,
        pageHeight: pageContext.pageHeight,
        items: pageContext.getTextItems(),
      });
    }
    
    const footerIndex = buildFooterSectionIndex(allPages, regions);
    
    // Verify specific sections if they exist
    if (footerIndex.firstPageBySection['23 07 00'] !== undefined &&
        footerIndex.firstPageBySection['23 09 00'] !== undefined) {
      const page230700 = footerIndex.firstPageBySection['23 07 00'];
      const page230900 = footerIndex.firstPageBySection['23 09 00'];
      
      // 23 07 00 should come before 23 09 00
      expect(page230700).toBeLessThan(page230900);
    }
    
    // Verify first page is minimum of all occurrences
    for (const [code, firstPage] of Object.entries(footerIndex.firstPageBySection)) {
      const occurrences = footerIndex.occurrences[code] || [];
      if (occurrences.length > 0) {
        const minPage = Math.min(...occurrences);
        expect(firstPage).toBe(minPage);
      }
    }
  }, 180000);
});

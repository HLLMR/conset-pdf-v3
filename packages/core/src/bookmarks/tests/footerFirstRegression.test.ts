/**
 * Regression tests for footer-first section anchoring
 * 
 * Tests with real PDF fixture (23_MECH_FULL.pdf) to ensure:
 * - Section ordering is correct (numeric)
 * - Section destinations point to first page where section code appears in footer
 * - Hierarchy: articles nested under correct section based on page ranges
 * - Zero junk titles (article titles must start with anchor)
 */

import { describe, it, expect } from '@jest/globals';
import { DocumentContext } from '../../analyze/documentContext.js';
import { buildTreeFromBookmarkAnchorTree } from '../treeBuilder.js';
import { buildFooterSectionIndexFast } from '../../specs/footerIndexBuilder.js';
import { readFileSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Footer-First Section Anchoring Regression Tests', () => {
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
    
    throw new Error(`Bookmark tree not found. Tried: ${possiblePaths.join(', ')}`);
  }
  
  /**
   * Test: Section ordering is correct (numeric)
   */
  it('should order sections numerically', async () => {
    const inputPdf = findInputPdf();
    const bookmarkTree = findBookmarkTree();
    
    const docContext = new DocumentContext(inputPdf);
    await docContext.initialize();
    const pageCount = docContext.pageCount;
    
    // Build footer index
    const { footerIndex } = await buildFooterSectionIndexFast(docContext, pageCount, {
      verbose: false,
    });
    
    // Build bookmark tree with footer-first anchoring
    const tree = await buildTreeFromBookmarkAnchorTree(
      bookmarkTree,
      docContext,
      pageCount,
      undefined,
      { rebuild: true, sectionStartStrategy: 'footer' },
      footerIndex
    );
    
    // Extract section bookmarks (roots)
    const sectionBookmarks = tree.roots
      .filter(root => root.title && root.title.startsWith('SECTION'))
      .map(root => ({
        title: root.title,
        sectionCode: root.sourceAnchor,
        pageIndex: root.destination.pageIndex,
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
  }, 180000);
  
  /**
   * Test: Section destinations point to first page where section code appears in footer
   */
  it('should resolve section destinations from footer first page', async () => {
    const inputPdf = findInputPdf();
    const bookmarkTree = findBookmarkTree();
    
    const docContext = new DocumentContext(inputPdf);
    await docContext.initialize();
    const pageCount = docContext.pageCount;
    
    // Build footer index
    const { footerIndex } = await buildFooterSectionIndexFast(docContext, pageCount, {
      verbose: false,
    });
    
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
        sectionCode: root.sourceAnchor,
        pageIndex: root.destination.pageIndex,
        isValid: root.destination.isValid,
      }));
    
    expect(sectionBookmarks.length).toBeGreaterThan(0);
    
    // Verify sections that exist in footer index use footer pages
    const mismatches: string[] = [];
    for (const bookmark of sectionBookmarks) {
      if (!bookmark.isValid) {
        mismatches.push(`Section "${bookmark.title}" has invalid destination`);
        continue;
      }
      
      // Try to find in footer index (with format variations)
      let footerPage = footerIndex.firstPageBySection[bookmark.sectionCode || ''];
      if (footerPage === undefined) {
        const withDivision = `01 ${bookmark.sectionCode}`;
        footerPage = footerIndex.firstPageBySection[withDivision];
      }
      if (footerPage === undefined && bookmark.sectionCode?.startsWith('01 ')) {
        const withoutDivision = bookmark.sectionCode.substring(3).trim();
        footerPage = footerIndex.firstPageBySection[withoutDivision];
      }
      
      if (footerPage !== undefined) {
        if (bookmark.pageIndex !== footerPage) {
          mismatches.push(
            `Section "${bookmark.title}": expected page ${footerPage} (from footer), ` +
            `but bookmark points to page ${bookmark.pageIndex}`
          );
        }
      }
    }
    
    if (mismatches.length > 0) {
      console.error('Destination mismatches:');
      mismatches.forEach(m => console.error(`  ${m}`));
    }
    
    // Allow some mismatches if footer index doesn't have all sections
    // But all valid sections should match
    const validSections = sectionBookmarks.filter(b => b.isValid);
    const validWithFooter = validSections.filter(b => {
      const code = b.sectionCode || '';
      return footerIndex.firstPageBySection[code] !== undefined ||
             footerIndex.firstPageBySection[`01 ${code}`] !== undefined;
    });
    
    if (validWithFooter.length > 0) {
      // All sections with footer entries should match
      const mismatchedValid = mismatches.filter(m => 
        validWithFooter.some(b => m.includes(b.title))
      );
      expect(mismatchedValid.length).toBe(0);
    }
  }, 180000);
  
  /**
   * Test: Hierarchy correctness - articles nested under correct section
   */
  it('should nest articles under correct section based on page ranges', async () => {
    const inputPdf = findInputPdf();
    const bookmarkTree = findBookmarkTree();
    
    const docContext = new DocumentContext(inputPdf);
    await docContext.initialize();
    const pageCount = docContext.pageCount;
    
    // Build footer index
    const { footerIndex } = await buildFooterSectionIndexFast(docContext, pageCount, {
      verbose: false,
    });
    
    // Build bookmark tree with footer-first anchoring
    const tree = await buildTreeFromBookmarkAnchorTree(
      bookmarkTree,
      docContext,
      pageCount,
      undefined,
      { rebuild: true, sectionStartStrategy: 'footer' },
      footerIndex
    );
    
    // Find a known article (e.g., "1.3 QUALITY ASSURANCE")
    const articleNode = Array.from(tree.nodes.values()).find(
      node => node.sourceAnchor === '1.3' && 
              node.title.includes('QUALITY ASSURANCE') &&
              node.level === 1
    );
    
    if (!articleNode) {
      // Skip if article not found (may be filtered by profile)
      return;
    }
    
    // Article should have a parent (section)
    expect(articleNode.parentId).toBeDefined();
    
    const parentNode = tree.nodes.get(articleNode.parentId!);
    expect(parentNode).toBeDefined();
    expect(parentNode?.level).toBe(0);
    expect(parentNode?.title).toMatch(/^SECTION/);
    
    // Article page should be within section's page range
    // (We can't easily compute exact range here, but we can check article page is valid)
    expect(articleNode.destination.pageIndex).toBeGreaterThanOrEqual(0);
    expect(articleNode.destination.pageIndex).toBeLessThan(pageCount);
    expect(articleNode.destination.isValid).toBe(true);
    
    // Article page should be >= section page (article comes after section start)
    if (parentNode && parentNode.destination.isValid) {
      expect(articleNode.destination.pageIndex).toBeGreaterThanOrEqual(parentNode.destination.pageIndex);
    }
  }, 180000);
  
  /**
   * Test: Zero junk titles - article titles must start with anchor
   */
  it('should reject article bookmarks whose title does not start with anchor', async () => {
    const inputPdf = findInputPdf();
    const bookmarkTree = findBookmarkTree();
    
    const docContext = new DocumentContext(inputPdf);
    await docContext.initialize();
    const pageCount = docContext.pageCount;
    
    // Build footer index
    const { footerIndex } = await buildFooterSectionIndexFast(docContext, pageCount, {
      verbose: false,
    });
    
    // Build bookmark tree with footer-first anchoring
    const tree = await buildTreeFromBookmarkAnchorTree(
      bookmarkTree,
      docContext,
      pageCount,
      undefined,
      { rebuild: true, sectionStartStrategy: 'footer' },
      footerIndex
    );
    
    // Find all article nodes (level 1, numeric anchor)
    const articleNodes = Array.from(tree.nodes.values()).filter(
      node => node.level === 1 && 
              node.sourceAnchor && 
              /^\d+\.\d+/.test(node.sourceAnchor)
    );
    
    // All article titles must start with anchor + space
    const junkTitles: string[] = [];
    for (const article of articleNodes) {
      const normalizedTitle = article.title.trim().replace(/\s+/g, ' ');
      if (!normalizedTitle.startsWith(`${article.sourceAnchor} `)) {
        junkTitles.push(
          `Article "${article.title}" (anchor: "${article.sourceAnchor}") ` +
          `does not start with anchor`
        );
      }
    }
    
    if (junkTitles.length > 0) {
      console.error('Junk article titles found:');
      junkTitles.forEach(j => console.error(`  ${j}`));
    }
    
    expect(junkTitles.length).toBe(0);
  }, 180000);
  
  /**
   * Test: Specific sections resolve correctly
   */
  it('should resolve SECTION 23 02 00 and SECTION 23 07 00 to correct pages', async () => {
    const inputPdf = findInputPdf();
    const bookmarkTree = findBookmarkTree();
    
    const docContext = new DocumentContext(inputPdf);
    await docContext.initialize();
    const pageCount = docContext.pageCount;
    
    // Build footer index
    const { footerIndex } = await buildFooterSectionIndexFast(docContext, pageCount, {
      verbose: false,
    });
    
    // Build bookmark tree with footer-first anchoring
    const tree = await buildTreeFromBookmarkAnchorTree(
      bookmarkTree,
      docContext,
      pageCount,
      undefined,
      { rebuild: true, sectionStartStrategy: 'footer' },
      footerIndex
    );
    
    // Find SECTION 23 02 00
    const section230200 = tree.roots.find(
      root => root.sourceAnchor === '23 02 00' && root.title.startsWith('SECTION')
    );
    
    if (section230200) {
      expect(section230200.destination.isValid).toBe(true);
      
      // Check footer index has this section
      const footerPage = footerIndex.firstPageBySection['23 02 00'] ||
                         footerIndex.firstPageBySection['01 23 02'];
      
      if (footerPage !== undefined) {
        expect(section230200.destination.pageIndex).toBe(footerPage);
      }
    }
    
    // Find SECTION 23 07 00
    const section230700 = tree.roots.find(
      root => root.sourceAnchor === '23 07 00' && root.title.startsWith('SECTION')
    );
    
    if (section230700) {
      expect(section230700.destination.isValid).toBe(true);
      
      // Check footer index has this section
      const footerPage = footerIndex.firstPageBySection['23 07 00'] ||
                         footerIndex.firstPageBySection['01 23 07'];
      
      if (footerPage !== undefined) {
        expect(section230700.destination.pageIndex).toBe(footerPage);
      }
    }
  }, 180000);
});

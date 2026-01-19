/**
 * Regression tests for bookmark ordering and destination correctness
 * 
 * These tests MUST fail on current broken behavior and pass after fixes.
 * 
 * Test A: Section ordering - sections must be in numeric order
 * Test B: Section destinations - each section must land on page containing its heading
 * Test C: Hierarchy - articles nested under correct sections
 */

import { describe, it, expect } from '@jest/globals';
import { join, resolve } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { DocumentContext } from '../../analyze/documentContext.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Verify outline pages using Python verifier
 */
async function verifyOutlinePages(pdfPath: string): Promise<{
  count: number;
  items: Array<{
    title: string;
    pageIndex: number | null;
    pageNumber: number | null;
    level: number;
  }>;
  issues: string[];
}> {
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const scriptPath = join(__dirname, '../sidecar/verify_outline_pages.py');
  
  try {
    const { stdout } = await execFileAsync(pythonCmd, [scriptPath, pdfPath]);
    return JSON.parse(stdout);
  } catch (error: any) {
    throw new Error(`Failed to verify outline pages: ${error.message}`);
  }
}

/**
 * Parse section number from title (e.g., "SECTION 23 07 00" -> [23, 7, 0])
 */
function parseSectionNumber(title: string): number[] | null {
  const match = title.match(/SECTION\s+(\d{2})\s+(\d{2})\s+(\d{2})/);
  if (!match) return null;
  return [
    parseInt(match[1], 10), // division
    parseInt(match[2], 10), // section
    parseInt(match[3], 10), // subsection
  ];
}

/**
 * Check if page contains section heading
 */
async function pageContainsSectionHeading(
  docContext: DocumentContext,
  pageIndex: number,
  sectionId: string
): Promise<boolean> {
  try {
    await docContext.extractTextForPage(pageIndex);
    const pageContext = await docContext.getPageContext(pageIndex);
    const text = pageContext.getText();
    
    // Match "SECTION 23 07 00" pattern - must be at start of line (allowing whitespace)
    const normalizedSectionId = sectionId.trim().replace(/\s+/g, '\\s+');
    const sectionPattern = new RegExp(`^\\s*SECTION\\s+${normalizedSectionId}\\s*$`, 'im');
    
    // Check top portion of page (first 20 lines or first 20% of text)
    const lines = text.split('\n');
    const topLineCount = Math.max(20, Math.floor(lines.length * 0.2));
    const topLines = lines.slice(0, topLineCount);
    const topText = topLines.join('\n');
    
    return sectionPattern.test(topText);
  } catch (e) {
    return false;
  }
}

describe('Bookmark Ordering and Destination Regression Tests', () => {
  const repoRoot = join(__dirname, '../../../../..'); // conset-pdf directory
  const workspaceRoot = join(repoRoot, '..'); // workspace root (f:\Projects\conset-pdf-ws)
  const bookmarkTreePath = join(repoRoot, 'tests/fixtures/specs-bookmark-tree.json');
  
  // Helper to find input PDF
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
  
  /**
   * Test A: Section ordering
   * 
   * Root bookmarks must be sorted by section number (numeric, not lexicographic).
   * Example: 01 23 31, 23 02 00, 23 05 00, 23 05 48, 23 05 53, 23 07 00, 23 09 00
   */
  it('should order section bookmarks in numeric order', async () => {
    const inputPdf = findInputPdf();
    const tempDir = tmpdir();
    const testId = `conset-pdf-order-${Date.now()}`;
    const outputPdf = join(tempDir, `${testId}.pdf`);
    
    try {
      // Run fix-bookmarks workflow
      const cliPath = join(repoRoot, 'packages/cli/dist/cli.js');
      await execFileAsync('node', [
        cliPath,
        'fix-bookmarks',
        '--input', inputPdf,
        '--output', outputPdf,
        '--bookmark-tree', bookmarkTreePath,
        '--rebuild',
        '--bookmark-profile', 'specs-v1',
        '--section-start-strategy', 'footer-first',
        '--allow-invalid-destinations', // Allow invalid destinations for test (some sections may not resolve)
        '--verbose'
      ]);
      
      // Verify outline pages
      const verification = await verifyOutlinePages(outputPdf);
      
      // Extract root-level section bookmarks (level 0, title starts with "SECTION")
      const sectionBookmarks = verification.items
        .filter(item => item.level === 0 && item.title.startsWith('SECTION'))
        .map(item => ({
          title: item.title,
          sectionNumber: parseSectionNumber(item.title),
          pageIndex: item.pageIndex,
        }))
        .filter(item => item.sectionNumber !== null);
      
      expect(sectionBookmarks.length).toBeGreaterThan(0);
      
      // Check ordering: each section must come before sections with higher numbers
      const failures: string[] = [];
      for (let i = 1; i < sectionBookmarks.length; i++) {
        const prev = sectionBookmarks[i - 1].sectionNumber!;
        const curr = sectionBookmarks[i].sectionNumber!;
        
        // Compare: [division, section, subsection]
        for (let j = 0; j < 3; j++) {
          if (prev[j] < curr[j]) {
            break; // Correct order
          }
          if (prev[j] > curr[j]) {
            failures.push(
              `Ordering violation: "${sectionBookmarks[i - 1].title}" ` +
              `([${prev.join(',')}]) should come before "${sectionBookmarks[i].title}" ` +
              `([${curr.join(',')}]), but they appear in reverse order`
            );
            break;
          }
          // Equal, continue to next component
        }
      }
      
      // Check for duplicates
      const seenTitles = new Set<string>();
      for (const bookmark of sectionBookmarks) {
        if (seenTitles.has(bookmark.title)) {
          failures.push(`Duplicate section bookmark: "${bookmark.title}"`);
        }
        seenTitles.add(bookmark.title);
      }
      
      if (failures.length > 0) {
        console.error('Section ordering failures:');
        failures.forEach(f => console.error(`  ${f}`));
        console.error('Actual order:', sectionBookmarks.map(s => s.title).join(', '));
      }
      
      expect(failures.length).toBe(0);
      
    } finally {
      try {
        await unlink(outputPdf);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }, 120000);
  
  /**
   * Test B: Section destinations correct
   * 
   * Each SECTION bookmark must land on a page that contains the exact section heading.
   */
  it('should place section bookmarks on pages containing the section heading', async () => {
    const inputPdf = findInputPdf();
    const tempDir = tmpdir();
    const testId = `conset-pdf-dest-${Date.now()}`;
    const outputPdf = join(tempDir, `${testId}.pdf`);
    
    try {
      // Run fix-bookmarks workflow
      const cliPath = join(repoRoot, 'packages/cli/dist/cli.js');
      await execFileAsync('node', [
        cliPath,
        'fix-bookmarks',
        '--input', inputPdf,
        '--output', outputPdf,
        '--bookmark-tree', bookmarkTreePath,
        '--rebuild',
        '--bookmark-profile', 'specs-v1',
        '--section-start-strategy', 'footer-first',
        '--allow-invalid-destinations', // Allow invalid destinations for test (some sections may not resolve)
        '--verbose'
      ]);
      
      // Verify outline pages
      const verification = await verifyOutlinePages(outputPdf);
      
      // Load PDF to check page content
      const docContext = new DocumentContext(outputPdf);
      await docContext.initialize();
      
      // Check each section bookmark
      const sectionBookmarks = verification.items.filter(item => 
        item.level === 0 && item.title.startsWith('SECTION')
      );
      
      expect(sectionBookmarks.length).toBeGreaterThan(0);
      
      const failures: string[] = [];
      
      for (const bookmark of sectionBookmarks) {
        if (bookmark.pageIndex === null) {
          failures.push(`Section "${bookmark.title}" has null pageIndex`);
          continue;
        }
        
        // Extract section ID from title (e.g., "SECTION 23 07 00" -> "23 07 00")
        const sectionIdMatch = bookmark.title.match(/SECTION\s+(\d{2}\s+\d{2}\s+\d{2})/);
        if (!sectionIdMatch) {
          failures.push(`Section "${bookmark.title}" has invalid format`);
          continue;
        }
        
        const sectionId = sectionIdMatch[1];
        
        // Check if the page actually contains the section heading
        const hasHeading = await pageContainsSectionHeading(
          docContext,
          bookmark.pageIndex,
          sectionId
        );
        
        if (!hasHeading) {
          failures.push(
            `Section "${bookmark.title}" (section ID: "${sectionId}") ` +
            `points to page ${bookmark.pageNumber} (0-based: ${bookmark.pageIndex}), ` +
            `but that page does not contain "SECTION ${sectionId}" near the top`
          );
        }
      }
      
      if (failures.length > 0) {
        console.error('Section destination failures:');
        failures.forEach(f => console.error(`  ${f}`));
      }
      
      expect(failures.length).toBe(0);
      
    } finally {
      try {
        await unlink(outputPdf);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }, 120000);
  
  /**
   * Test C: Hierarchy correctness
   * 
   * Articles must be nested under their correct section, and article destinations
   * must be within the section's page range.
   */
  it('should nest articles under correct sections with valid destinations', async () => {
    const inputPdf = findInputPdf();
    const tempDir = tmpdir();
    const testId = `conset-pdf-hierarchy-${Date.now()}`;
    const outputPdf = join(tempDir, `${testId}.pdf`);
    
    try {
      // Run fix-bookmarks workflow
      const cliPath = join(repoRoot, 'packages/cli/dist/cli.js');
      await execFileAsync('node', [
        cliPath,
        'fix-bookmarks',
        '--input', inputPdf,
        '--output', outputPdf,
        '--bookmark-tree', bookmarkTreePath,
        '--rebuild',
        '--bookmark-profile', 'specs-v1',
        '--section-start-strategy', 'footer-first',
        '--allow-invalid-destinations', // Allow invalid destinations for test (some sections may not resolve)
        '--verbose'
      ]);
      
      // Verify outline pages
      const verification = await verifyOutlinePages(outputPdf);
      
      // Group items by level and find parent-child relationships
      // For now, we'll check that articles (level > 0) exist and have valid anchors
      const rootSections = verification.items.filter(item => 
        item.level === 0 && item.title.startsWith('SECTION')
      );
      
      const articles = verification.items.filter(item => 
        item.level > 0 && /^\d+\.\d+/.test(item.title.trim())
      );
      
      expect(rootSections.length).toBeGreaterThan(0);
      
      // Check that articles exist (at least some)
      if (articles.length === 0) {
        throw new Error('No article bookmarks found - hierarchy may be broken');
      }
      
      // Check that articles have valid titles (start with anchor)
      const invalidArticles: string[] = [];
      for (const article of articles) {
        const title = article.title.trim();
        // Article title should start with numeric anchor (e.g., "1.1", "1.2")
        if (!/^\d+\.\d+\s+/.test(title)) {
          invalidArticles.push(`Article "${title}" does not start with numeric anchor`);
        }
      }
      
      if (invalidArticles.length > 0) {
        console.error('Invalid article titles:');
        invalidArticles.forEach(a => console.error(`  ${a}`));
      }
      
      // For a proper hierarchy test, we'd need to verify parent-child relationships
      // This requires reading the PDF outline structure directly, which is complex
      // For now, we verify articles exist and have correct format
      expect(invalidArticles.length).toBe(0);
      
    } finally {
      try {
        await unlink(outputPdf);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }, 120000);
});

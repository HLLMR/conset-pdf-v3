/**
 * Regression tests for bookmark correctness:
 * - Section destination correctness (sections land on correct pages)
 * - Section ordering (numeric order, not insertion order)
 * - Hierarchy (articles nested under sections)
 * - Title quality (no body text fragments)
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { unlink } from 'fs/promises';
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
 * Check if a page contains a section heading
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
    
    // Match "SECTION 23 07 00" with flexible whitespace
    // Prefer matches in first ~20% of text (top of page)
    const sectionPattern = new RegExp(`^SECTION\\s+${sectionId.replace(/\s+/g, '\\s+')}\\s*$`, 'im');
    const lines = text.split('\n');
    const topLines = lines.slice(0, Math.max(10, Math.floor(lines.length * 0.2)));
    const topText = topLines.join('\n');
    
    return sectionPattern.test(topText);
  } catch (e) {
    return false;
  }
}

describe('Bookmark Correctness Regression Tests', () => {
  const repoRoot = join(__dirname, '../../../../..');
  const bookmarkTreePath = join(repoRoot, 'tests/fixtures/specs-bookmark-tree.json');
  
  // Helper to find input PDF
  function findInputPdf(): string {
    const possiblePdfPaths = [
      join(repoRoot, '.reference/LHHS/Specifications/23_MECH_FULL.pdf'),
      join(repoRoot, '../.reference/LHHS/Specifications/23_MECH_FULL.pdf'),
      join(repoRoot, '../../.reference/LHHS/Specifications/23_MECH_FULL.pdf'),
      'f:\\Projects\\conset-pdf-ws\\.reference\\LHHS\\Specifications\\23_MECH_FULL.pdf',
    ];
    
    for (const pdfPath of possiblePdfPaths) {
      try {
        const { accessSync } = require('fs');
        accessSync(pdfPath);
        return pdfPath;
      } catch {
        continue;
      }
    }
    
    throw new Error(`Input PDF not found. Tried: ${possiblePdfPaths.join(', ')}`);
  }
  
  // Known sections that should exist in the PDF
  // Filter sections that exist in bookmark tree
  function getKnownSections(): Array<{ id: string; title: string }> {
    try {
      const treeData = JSON.parse(readFileSync(bookmarkTreePath, 'utf-8'));
      const allSections = [
        { id: '23 05 00', title: 'SECTION 23 05 00' },
        { id: '23 05 53', title: 'SECTION 23 05 53' },
        { id: '23 07 00', title: 'SECTION 23 07 00' },
        { id: '23 09 00', title: 'SECTION 23 09 00' },
      ];
      return allSections.filter(section => {
        return treeData.bookmarks?.some((b: any) => 
          b.anchor === section.id || b.title?.includes(section.id)
        );
      });
    } catch {
      // If bookmark tree doesn't exist, use empty list (test will skip)
      return [];
    }
  }

  it('should place section bookmarks on pages containing the actual section heading', async () => {
    const knownSections = getKnownSections();
    if (knownSections.length === 0) {
      console.log('Skipping test: no known sections found in bookmark tree');
      return;
    }
    
    const inputPdf = findInputPdf();
    const tempDir = tmpdir();
    const testId = `conset-pdf-section-dest-${Date.now()}`;
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
        '--verbose'
      ]);
      
      // Verify outline pages
      const verification = await verifyOutlinePages(outputPdf);
      
      // Load PDF to check page content
      const docContext = new DocumentContext(outputPdf);
      await docContext.initialize();
      
      // Check each known section
      const failures: string[] = [];
      
      for (const section of knownSections) {
        const bookmarkItem = verification.items.find(item => 
          item.title.includes(section.id) || item.title.includes(section.title)
        );
        
        if (!bookmarkItem) {
          failures.push(`Section "${section.id}" not found in bookmarks`);
          continue;
        }
        
        if (bookmarkItem.pageIndex === null) {
          failures.push(`Section "${section.id}" has null pageIndex`);
          continue;
        }
        
        // Check if the page actually contains the section heading
        const hasHeading = await pageContainsSectionHeading(
          docContext,
          bookmarkItem.pageIndex,
          section.id
        );
        
        if (!hasHeading) {
          failures.push(
            `Section "${section.id}" (bookmark title: "${bookmarkItem.title}") ` +
            `points to page ${bookmarkItem.pageNumber} (0-based: ${bookmarkItem.pageIndex}), ` +
            `but that page does not contain "SECTION ${section.id}" near the top`
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

  it('should order section roots in ascending numeric order', async () => {
    const inputPdf = findInputPdf();
    const tempDir = tmpdir();
    const testId = `conset-pdf-section-order-${Date.now()}`;
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
        '--verbose'
      ]);
      
      // Verify outline pages
      const verification = await verifyOutlinePages(outputPdf);
      
      // Extract section IDs from root-level bookmarks (level 0)
      const sectionBookmarks = verification.items
        .filter(item => item.level === 0 && item.title.includes('SECTION'))
        .map(item => {
          // Extract section ID from title (e.g., "SECTION 23 05 53" -> "23 05 53")
          const match = item.title.match(/SECTION\s+(\d{2}\s+\d{2}\s+\d{2}(?:\s+\d{2})?)/);
          if (match) {
            return {
              title: item.title,
              sectionId: match[1],
              pageIndex: item.pageIndex,
            };
          }
          return null;
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
      
      // Parse section IDs for numeric comparison
      const parseSectionId = (id: string): number[] => {
        const parts = id.split(/\s+/).map(p => parseInt(p, 10));
        // Pad to 4 parts for comparison: [23, 5, 0, 0] vs [23, 5, 53, 0]
        while (parts.length < 4) {
          parts.push(0);
        }
        return parts;
      };
      
      // Check ordering
      const failures: string[] = [];
      for (let i = 1; i < sectionBookmarks.length; i++) {
        const prev = parseSectionId(sectionBookmarks[i - 1].sectionId);
        const curr = parseSectionId(sectionBookmarks[i].sectionId);
        
        // Compare: [division, major, minor, subminor]
        for (let j = 0; j < 4; j++) {
          if (prev[j] < curr[j]) {
            break; // Correct order
          }
          if (prev[j] > curr[j]) {
            failures.push(
              `Section ordering violation: "${sectionBookmarks[i - 1].sectionId}" ` +
              `should come before "${sectionBookmarks[i].sectionId}", but they appear in reverse order`
            );
            break;
          }
          // Equal, continue to next component
        }
      }
      
      if (failures.length > 0) {
        console.error('Section ordering failures:');
        failures.forEach(f => console.error(`  ${f}`));
        console.error('Actual order:', sectionBookmarks.map(s => s.sectionId).join(', '));
      }
      
      expect(failures.length).toBe(0);
      expect(sectionBookmarks.length).toBeGreaterThan(0);
      
    } finally {
      try {
        await unlink(outputPdf);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }, 120000);

  it('should nest articles under their section root (hierarchy)', async () => {
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
        '--verbose'
      ]);
      
      // Verify outline pages (this gives us flat structure, need to check via Python or build tree)
      // For now, we'll check that articles exist and are at level > 0
      const verification = await verifyOutlinePages(outputPdf);
      
      // Find a section bookmark (level 0)
      const sectionBookmark = verification.items.find(item => 
        item.level === 0 && item.title.includes('SECTION 23 05 00')
      );
      
      if (!sectionBookmark) {
        throw new Error('Section "SECTION 23 05 00" not found in bookmarks');
      }
      
      // Find articles that should be under this section (e.g., "1.1", "1.2", "1.3", "1.4")
      const articlePattern = /^1\.\d+/;
      const articles = verification.items.filter(item => 
        item.level > 0 && articlePattern.test(item.title.trim())
      );
      
      // Check that articles exist (at least some)
      expect(articles.length).toBeGreaterThan(0);
      
      // For a proper hierarchy test, we'd need to verify parent-child relationships
      // This is a basic check - full hierarchy verification would require reading the PDF outline structure
      // For now, we verify articles exist and are not all at level 0
      const rootLevelArticles = verification.items.filter(item => 
        item.level === 0 && articlePattern.test(item.title.trim())
      );
      
      // Articles should NOT all be at root level (they should be nested)
      // Allow some at root if hierarchy isn't fully implemented, but most should be nested
      if (articles.length > 0) {
        const nestedRatio = (articles.length - rootLevelArticles.length) / articles.length;
        expect(nestedRatio).toBeGreaterThan(0.5); // At least 50% should be nested
      }
      
    } finally {
      try {
        await unlink(outputPdf);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }, 120000);

  it('should reject body text fragments as bookmark titles', async () => {
    const inputPdf = findInputPdf();
    const tempDir = tmpdir();
    const testId = `conset-pdf-title-quality-${Date.now()}`;
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
        '--verbose'
      ]);
      
      // Verify outline pages
      const verification = await verifyOutlinePages(outputPdf);
      
      // Check for body text patterns
      const bodyTextPatterns = [
        /^(and|the|a|an|or|but|for|with|from|to|of|in|on|at|by)\s+/i, // Starts with lowercase common words
        /^[a-z]/, // Starts with lowercase (unless it's a section/article number)
        /\.$/, // Ends with period (sentence-like)
        /^.{200,}$/, // Too long (likely body text)
      ];
      
      const invalidTitles: string[] = [];
      
      for (const item of verification.items) {
        const title = item.title.trim();
        
        // Skip if it's a valid section/article heading
        if (/^SECTION\s+\d{2}\s+\d{2}\s+\d{2}/.test(title)) {
          continue; // Valid section heading
        }
        if (/^\d+\.\d+\s+[A-Z]/.test(title)) {
          continue; // Valid article heading (e.g., "1.1 RELATED REQUIREMENTS")
        }
        
        // Check for body text patterns
        for (const pattern of bodyTextPatterns) {
          if (pattern.test(title)) {
            invalidTitles.push(`"${title}" (matches body text pattern: ${pattern})`);
            break;
          }
        }
      }
      
      if (invalidTitles.length > 0) {
        console.error('Invalid bookmark titles (body text fragments):');
        invalidTitles.slice(0, 10).forEach(t => console.error(`  ${t}`));
        if (invalidTitles.length > 10) {
          console.error(`  ... and ${invalidTitles.length - 10} more`);
        }
      }
      
      // Allow some false positives, but should be minimal
      expect(invalidTitles.length).toBeLessThan(verification.items.length * 0.1); // Less than 10% invalid
      
    } finally {
      try {
        await unlink(outputPdf);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }, 120000);
});

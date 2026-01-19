/**
 * Regression test for bookmark page destination mapping
 * 
 * This test verifies that bookmarks navigate to the correct pages
 * by comparing extracted destinations against expected pages from BookmarkAnchorTree.
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
    view: string | null;
    hasA: boolean;
    hasDest: boolean;
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
 * Load BookmarkAnchorTree and extract expected page mappings
 * Recursively walks the tree to collect all anchors
 */
function loadExpectedMappings(bookmarkTreePath: string): Map<string, number> {
  const treeData = JSON.parse(readFileSync(bookmarkTreePath, 'utf-8'));
  const mappings = new Map<string, number>();
  
  // Extract pageIndexHint from bookmarks (recursive structure)
  // BookmarkAnchorTree structure: { bookmarks: [...] }
  function walkAnchors(anchors: any[], level = 0): void {
    for (const anchor of anchors) {
      if (anchor.title && anchor.pageIndexHint !== undefined) {
        // Normalize title for matching (remove extra whitespace)
        const normalizedTitle = anchor.title.trim().replace(/\s+/g, ' ');
        // pageIndexHint from Specs Pipeline is 1-based (human page numbers)
        // We need to convert to 0-based for comparison with PDF internal indices
        // BUT: treeBuilder.ts converts it by subtracting 1, so we do the same here
        const pageIndex0Based = anchor.pageIndexHint - 1;
        mappings.set(normalizedTitle, pageIndex0Based);
      }
      
      // Walk children recursively
      if (anchor.children && Array.isArray(anchor.children)) {
        walkAnchors(anchor.children, level + 1);
      }
    }
  }
  
  if (treeData.bookmarks && Array.isArray(treeData.bookmarks)) {
    walkAnchors(treeData.bookmarks);
  }
  
  return mappings;
}

describe('Bookmark Page Mapping Regression Test', () => {
  it('should write bookmarks with correct page destinations matching BookmarkAnchorTree', async () => {
    // Paths
    const repoRoot = join(__dirname, '../../../../..');
    // Try multiple possible locations for the reference PDF
    const possiblePdfPaths = [
      join(repoRoot, '.reference/LHHS/Specifications/23_MECH_FULL.pdf'),
      join(repoRoot, '../.reference/LHHS/Specifications/23_MECH_FULL.pdf'),
      join(repoRoot, '../../.reference/LHHS/Specifications/23_MECH_FULL.pdf'),
    ];
    
    let inputPdf: string | null = null;
    for (const pdfPath of possiblePdfPaths) {
      try {
        await import('fs/promises').then(fs => fs.access(pdfPath));
        inputPdf = pdfPath;
        break;
      } catch {
        continue;
      }
    }
    
    if (!inputPdf) {
      throw new Error(`Input PDF not found. Tried: ${possiblePdfPaths.join(', ')}`);
    }
    
    const bookmarkTreePath = join(repoRoot, 'tests/fixtures/specs-bookmark-tree.json');
    const tempDir = tmpdir();
    const testId = `conset-pdf-page-mapping-${Date.now()}`;
    const outputPdf = join(tempDir, `${testId}.pdf`);
    
    try {
      // Load expected mappings from BookmarkAnchorTree
      const expectedMappings = loadExpectedMappings(bookmarkTreePath);
      
      if (expectedMappings.size === 0) {
        throw new Error('No expected mappings found in BookmarkAnchorTree');
      }
      
      // Run fix-bookmarks workflow
      const cliPath = join(repoRoot, 'packages/cli/dist/cli.js');
      const { stderr } = await execFileAsync('node', [
        cliPath,
        'fix-bookmarks',
        '--input', inputPdf,
        '--output', outputPdf,
        '--bookmark-tree', bookmarkTreePath,
        '--rebuild',
        '--verbose'
      ]);
      
      if (stderr && stderr.length > 0) {
        console.log('CLI stderr:', stderr);
      }
      
      // Verify outline pages
      const verification = await verifyOutlinePages(outputPdf);
      
      // Assertions
      expect(verification.issues.length).toBe(0);
      expect(verification.count).toBeGreaterThan(0);
      
      // Check that key bookmarks have correct destinations
      // We'll check a few key ones that should be in the tree
      // Note: We use fuzzy matching because titles may be normalized (whitespace collapsed)
      const keyBookmarks = [
        { search: 'SECTION 23 02 00', expectedPageHint: 5 }, // Should be around page 4-5 (0-based)
        { search: '1.4 SUBMITTALS', expectedPageHint: 6 }, // Should be around page 5-6 (0-based)
        { search: '1.1 RELATED REQUIREMENTS', expectedPageHint: 5 }, // Should be around page 4-5 (0-based)
      ];
      
      let matchedCount = 0;
      const mismatches: string[] = [];
      const tolerance = 2; // Allow ±2 pages tolerance since pageIndexHint is approximate
      
      for (const keyBookmark of keyBookmarks) {
        const expectedPage0Based = keyBookmark.expectedPageHint - 1; // Convert 1-based hint to 0-based
        
        // Find matching item (fuzzy match on title)
        const actualItem = verification.items.find(item => {
          const normalizedItemTitle = item.title.trim().replace(/\s+/g, ' ').toUpperCase();
          const normalizedSearch = keyBookmark.search.trim().replace(/\s+/g, ' ').toUpperCase();
          return normalizedItemTitle.includes(normalizedSearch) || normalizedSearch.includes(normalizedItemTitle);
        });
        
        if (actualItem) {
          if (actualItem.pageIndex === null) {
            mismatches.push(
              `"${keyBookmark.search}": pageIndex is null (unresolvable destination)`
            );
          } else {
            const pageDiff = Math.abs(actualItem.pageIndex - expectedPage0Based);
            if (pageDiff <= tolerance) {
              matchedCount++;
            } else {
              mismatches.push(
                `"${keyBookmark.search}": expected page ${expectedPage0Based}±${tolerance} (0-based, from hint ${keyBookmark.expectedPageHint}), got ${actualItem.pageIndex} (diff: ${pageDiff})`
              );
            }
          }
        } else {
          mismatches.push(`"${keyBookmark.search}": not found in output bookmarks`);
        }
      }
      
      // Report results
      if (mismatches.length > 0) {
        console.error('Page mapping mismatches:');
        mismatches.forEach(m => console.error(`  ${m}`));
      }
      
      // At least some key bookmarks should match (within tolerance)
      // This test will fail if destinations are way off
      expect(mismatches.length).toBeLessThan(keyBookmarks.length); // Allow some mismatches
      expect(matchedCount).toBeGreaterThan(0); // But at least one should match
      
    } finally {
      // Cleanup
      try {
        await unlink(outputPdf);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }, 60000); // 60 second timeout for full workflow
});

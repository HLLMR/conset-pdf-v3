/**
 * Unit test for tree completeness - ensures profile filtering keeps intended nodes
 */

import { describe, it, expect } from '@jest/globals';
import type { BookmarkAnchorTree } from '../../workflows/bookmarks/types.js';
import { buildTreeFromBookmarkAnchorTree } from '../treeBuilder.js';
import { DocumentContext } from '../../analyze/documentContext.js';

describe('Tree Completeness Tests', () => {
  it('should include all sections and articles when using specs-v1 profile', async () => {
    // Create a synthetic BookmarkAnchorTree with:
    // - Multiple sections
    // - Multiple articles per section
    // - Some junk nodes (paragraphs, list items without anchors)
    
    const bookmarkTree: BookmarkAnchorTree = {
      bookmarks: [
        {
          anchor: '23 02 00',
          title: 'SECTION 23 02 00',
          level: 0,
          pageIndexHint: 5,
          children: [
            {
              anchor: '1.1',
              title: '1.1 RELATED REQUIREMENTS',
              level: 1,
              pageIndexHint: 5,
              children: []
            },
            {
              anchor: '1.2',
              title: '1.2 SYSTEM DESCRIPTION',
              level: 1,
              pageIndexHint: 5,
              children: []
            },
            {
              anchor: '1.3',
              title: '1.3 QUALITY ASSURANCE',
              level: 1,
              pageIndexHint: 6,
              children: []
            },
            {
              anchor: '1.4',
              title: '1.4 SUBMITTALS',
              level: 1,
              pageIndexHint: 6,
              children: []
            },
            // Junk node (should be filtered)
            {
              anchor: '',
              title: 'This is a paragraph without an anchor',
              level: 2,
              pageIndexHint: 7,
              children: []
            }
          ]
        },
        {
          anchor: '23 05 00',
          title: 'SECTION 23 05 00',
          level: 0,
          pageIndexHint: 10,
          children: [
            {
              anchor: '2.1',
              title: '2.1 ELECTRIC UNIT HEATERS',
              level: 1,
              pageIndexHint: 10,
              children: []
            },
            {
              anchor: '3.1',
              title: '3.1 EXAMINATION',
              level: 1,
              pageIndexHint: 11,
              children: []
            }
          ]
        }
      ]
    };
    
    // Create a minimal PDF for testing
    const { PDFDocument } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.create();
    for (let i = 0; i < 15; i++) {
      const page = pdfDoc.addPage([612, 792]);
      page.drawText(`Page ${i + 1}`, { x: 50, y: 750 });
    }
    
    const pdfBytes = await pdfDoc.save();
    const { writeFile, unlink } = await import('fs/promises');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const testPdf = join(tmpdir(), `test-tree-${Date.now()}.pdf`);
    await writeFile(testPdf, pdfBytes);
    
    try {
      const docContext = new DocumentContext(testPdf);
      await docContext.initialize();
      
      // Build tree with specs-v1 profile
      const tree = await buildTreeFromBookmarkAnchorTree(
        bookmarkTree,
        docContext,
        docContext.pageCount,
        { profile: 'specs-v1' },
        { rebuild: true }
      );
      
      // Assertions
      expect(tree.roots.length).toBe(2); // Should have 2 sections
      expect(tree.nodes.size).toBeGreaterThanOrEqual(6); // 2 sections + at least 4 articles
      
      // Check that sections are included
      const sectionTitles = tree.roots.map(r => r.title);
      expect(sectionTitles).toContain('SECTION 23 02 00');
      expect(sectionTitles).toContain('SECTION 23 05 00');
      
      // Check that articles are included
      const allTitles = Array.from(tree.nodes.values()).map(n => n.title);
      expect(allTitles).toContain('1.1 RELATED REQUIREMENTS');
      expect(allTitles).toContain('1.2 SYSTEM DESCRIPTION');
      expect(allTitles).toContain('1.3 QUALITY ASSURANCE');
      expect(allTitles).toContain('1.4 SUBMITTALS');
      expect(allTitles).toContain('2.1 ELECTRIC UNIT HEATERS');
      expect(allTitles).toContain('3.1 EXAMINATION');
      
      // Check that junk node is filtered out
      expect(allTitles).not.toContain('This is a paragraph without an anchor');
      
      // Check parent-child relationships
      const section230200 = tree.roots.find(r => r.title === 'SECTION 23 02 00');
      expect(section230200).toBeDefined();
      if (section230200 && section230200.childIds) {
        expect(section230200.childIds.length).toBeGreaterThanOrEqual(4); // Should have at least 4 articles
      }
      
    } finally {
      try {
        await unlink(testPdf);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }, 30000);
});

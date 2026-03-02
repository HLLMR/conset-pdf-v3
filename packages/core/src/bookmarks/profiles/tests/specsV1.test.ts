/**
 * Tests for Specs Bookmark Profile v1
 */

import { describe, it, expect } from '@jest/globals';
import {
  normalizeTitle,
  isEligibleBookmark,
  shapeBookmarkTree,
  specsV1Profile,
} from '../specsV1.js';
import type { BookmarkAnchor } from '../../../workflows/bookmarks/types.js';
import type { BookmarkTree } from '../../types.js';
import type { ResolvedBookmarkStyleOptions } from '../types.js';

describe('Specs Bookmark Profile v1', () => {
  describe('normalizeTitle', () => {
    const maxTitleLength = 120;

    it('should collapse whitespace', () => {
      expect(normalizeTitle('  SECTION   23  05  00  ', maxTitleLength)).toBe('SECTION 23 05 00');
      expect(normalizeTitle('PART\n1\n—\nGENERAL', maxTitleLength)).toBe('PART 1 — GENERAL');
    });

    it('should enforce single-line', () => {
      expect(normalizeTitle('SECTION 23 05 00\n\nCommon Results', maxTitleLength)).toBe('SECTION 23 05 00 Common Results');
    });

    it('should trim leading/trailing whitespace', () => {
      expect(normalizeTitle('  SECTION 23 05 00  ', maxTitleLength)).toBe('SECTION 23 05 00');
    });

    it('should truncate long titles with ellipsis', () => {
      const longTitle = 'A'.repeat(150);
      const normalized = normalizeTitle(longTitle, maxTitleLength);
      expect(normalized.length).toBeLessThanOrEqual(120);
      expect(normalized).toMatch(/…$/);
    });

    it('should preserve normal titles', () => {
      expect(normalizeTitle('SECTION 23 05 00', maxTitleLength)).toBe('SECTION 23 05 00');
      expect(normalizeTitle('PART 1 — GENERAL', maxTitleLength)).toBe('PART 1 — GENERAL');
      expect(normalizeTitle('1.1 Scope', maxTitleLength)).toBe('1.1 Scope');
    });

    it('should handle empty/whitespace-only titles', () => {
      expect(normalizeTitle('', maxTitleLength)).toBe('');
      expect(normalizeTitle('   ', maxTitleLength)).toBe('');
    });

    it('should remove trailing hyphen fragments', () => {
      expect(normalizeTitle('Title - ', maxTitleLength)).toBe('Title');
      expect(normalizeTitle('Title -', maxTitleLength)).toBe('Title');
      expect(normalizeTitle('Title — ', maxTitleLength)).toBe('Title');
    });
  });

  describe('isEligibleBookmark', () => {
    const maxDepth = 2;

    it('should allow section-level nodes', () => {
      const anchor: BookmarkAnchor = {
        anchor: '23 05 00',
        title: 'SECTION 23 05 00',
        level: 0,
      };
      expect(isEligibleBookmark(anchor, 0, maxDepth)).toBe(true);
    });

    it('should allow part-level nodes', () => {
      const anchor: BookmarkAnchor = {
        anchor: 'PART 1',
        title: 'PART 1 — GENERAL',
        level: 1,
      };
      expect(isEligibleBookmark(anchor, 1, maxDepth)).toBe(true);
    });

    it('should allow article-level nodes with numeric anchors', () => {
      const anchor: BookmarkAnchor = {
        anchor: '1.1',
        title: '1.1 Scope',
        level: 2,
      };
      expect(isEligibleBookmark(anchor, 2, maxDepth)).toBe(true);
    });

    it('should allow article-level nodes with multi-part numeric anchors', () => {
      const anchor: BookmarkAnchor = {
        anchor: '2.4.1',
        title: '2.4.1 Requirements',
        level: 2,
      };
      expect(isEligibleBookmark(anchor, 2, maxDepth)).toBe(true);
    });

    it('should reject nodes deeper than maxDepth', () => {
      const anchor: BookmarkAnchor = {
        anchor: '1.1.1.1',
        title: 'Deep node',
        level: 3,
      };
      expect(isEligibleBookmark(anchor, 3, maxDepth)).toBe(false);
    });

    it('should reject nodes with non-numeric article anchors', () => {
      const anchor: BookmarkAnchor = {
        anchor: '1.1-T.5.b.1',
        title: 'List item',
        level: 2,
      };
      expect(isEligibleBookmark(anchor, 2, maxDepth)).toBe(false);
    });

    it('should reject nodes with empty titles', () => {
      const anchor: BookmarkAnchor = {
        anchor: '1.1',
        title: '',
        level: 2,
      };
      expect(isEligibleBookmark(anchor, 2, maxDepth)).toBe(false);
    });

    it('should reject nodes with whitespace-only titles', () => {
      const anchor: BookmarkAnchor = {
        anchor: '1.1',
        title: '   ',
        level: 2,
      };
      expect(isEligibleBookmark(anchor, 2, maxDepth)).toBe(false);
    });

    it('should allow level 0 sections even if title does not start with SECTION', () => {
      const anchor: BookmarkAnchor = {
        anchor: '23 05 00',
        title: '23 05 00 Common Results',
        level: 0,
      };
      // Level 0 with section-like anchor should be allowed
      expect(isEligibleBookmark(anchor, 0, maxDepth)).toBe(true);
    });

    it('should reject article nodes where title does not start with anchor', () => {
      const anchor: BookmarkAnchor = {
        anchor: '1.1',
        title: 'Some other text',
        level: 1,
      };
      expect(isEligibleBookmark(anchor, 1, maxDepth)).toBe(false);
    });

    it('should reject article nodes with body text titles', () => {
      const anchor: BookmarkAnchor = {
        anchor: '0.10',
        title: 'and 500 FPM for intakes. Air pressure drop shall n',
        level: 1,
      };
      expect(isEligibleBookmark(anchor, 1, maxDepth)).toBe(false);
    });

    it('should reject decimal-only anchors like 0.10', () => {
      const anchor: BookmarkAnchor = {
        anchor: '0.10',
        title: '0.10 Some text',
        level: 1,
      };
      expect(isEligibleBookmark(anchor, 1, maxDepth)).toBe(false);
    });

    it('should reject article nodes starting with lowercase body text words', () => {
      const anchor: BookmarkAnchor = {
        anchor: '1.1',
        title: 'and some text here',
        level: 1,
      };
      expect(isEligibleBookmark(anchor, 1, maxDepth)).toBe(false);
    });

    it('should allow valid article nodes with title starting with anchor', () => {
      const anchor: BookmarkAnchor = {
        anchor: '1.1',
        title: '1.1 Scope',
        level: 1,
      };
      expect(isEligibleBookmark(anchor, 1, maxDepth)).toBe(true);
    });
  });

  describe('shapeBookmarkTree', () => {
    const defaultOptions: ResolvedBookmarkStyleOptions = {
      profile: 'specs-v1',
      maxDepth: 2,
      maxTitleLength: 120,
      includeSubsections: false,
      includeArticles: true,
      includeParts: false,
    };

    it('should filter out ineligible nodes and hoist children', () => {
      const tree: BookmarkTree = {
        roots: [],
        nodes: new Map([
          ['section-1', {
            id: 'section-1',
            title: 'SECTION 23 05 00',
            level: 0,
            destination: { pageIndex: 0, fitType: null, isValid: true },
            sourceAnchor: '23 05 00',
            page: 1,
            status: 'ok',
          }],
          ['part-1', {
            id: 'part-1',
            title: 'PART 1 — GENERAL',
            level: 1,
            destination: { pageIndex: 0, fitType: null, isValid: true },
            sourceAnchor: 'PART 1',
            parentId: 'section-1',
            page: 1,
            status: 'ok',
          }],
          ['article-1', {
            id: 'article-1',
            title: '1.1 Scope',
            level: 2,
            destination: { pageIndex: 0, fitType: null, isValid: true },
            sourceAnchor: '1.1',
            parentId: 'part-1',
            page: 1,
            status: 'ok',
          }],
          ['list-item-1', {
            id: 'list-item-1',
            title: 'Some list item text',
            level: 3,
            destination: { pageIndex: 0, fitType: null, isValid: true },
            parentId: 'article-1',
            page: 1,
            status: 'ok',
          }],
        ]),
        source: 'bookmarkTree',
      };

      // Set up parent-child relationships
      tree.nodes.get('section-1')!.childIds = ['part-1'];
      tree.nodes.get('part-1')!.childIds = ['article-1'];
      tree.nodes.get('article-1')!.childIds = ['list-item-1'];
      tree.roots.push(tree.nodes.get('section-1')!);

      const filtered = shapeBookmarkTree(tree, defaultOptions);

      // Should keep section and article (part is filtered because includeParts=false)
      expect(filtered.nodes.has('section-1')).toBe(true);
      expect(filtered.nodes.has('part-1')).toBe(false);
      expect(filtered.nodes.has('article-1')).toBe(true);
      // Should filter out list-item
      expect(filtered.nodes.has('list-item-1')).toBe(false);
    });

    it('should normalize titles in filtered tree', () => {
      const tree: BookmarkTree = {
        roots: [],
        nodes: new Map([
          ['section-1', {
            id: 'section-1',
            title: '  SECTION   23  05  00  ',
            level: 0,
            destination: { pageIndex: 0, fitType: null, isValid: true },
            page: 1,
            status: 'ok',
          }],
        ]),
        source: 'bookmarkTree',
      };
      tree.roots.push(tree.nodes.get('section-1')!);

      const filtered = shapeBookmarkTree(tree, defaultOptions);
      const node = filtered.nodes.get('section-1')!;
      expect(node.title).toBe('SECTION 23 05 00');
    });

    it('should preserve stable IDs', () => {
      const tree: BookmarkTree = {
        roots: [],
        nodes: new Map([
          ['bookmarkTree:23 05 00', {
            id: 'bookmarkTree:23 05 00',
            title: 'SECTION 23 05 00',
            level: 0,
            destination: { pageIndex: 0, fitType: null, isValid: true },
            sourceAnchor: '23 05 00',
            page: 1,
            status: 'ok',
          }],
        ]),
        source: 'bookmarkTree',
      };
      tree.roots.push(tree.nodes.get('bookmarkTree:23 05 00')!);

      const filtered = shapeBookmarkTree(tree, defaultOptions);
      const node = filtered.nodes.get('bookmarkTree:23 05 00')!;
      expect(node.id).toBe('bookmarkTree:23 05 00');
      expect(node.sourceAnchor).toBe('23 05 00');
    });

    it('should deduplicate duplicate roots', () => {
      const tree: BookmarkTree = {
        roots: [],
        nodes: new Map([
          ['bookmarkTree:23 05 00-1', {
            id: 'bookmarkTree:23 05 00-1',
            title: 'SECTION 23 05 00',
            level: 0,
            destination: { pageIndex: 0, fitType: null, isValid: true },
            sourceAnchor: '23 05 00',
            page: 1,
            status: 'ok',
          }],
          ['bookmarkTree:23 05 00-2', {
            id: 'bookmarkTree:23 05 00-2',
            title: 'SECTION 23 05 00',
            level: 0,
            destination: { pageIndex: 0, fitType: null, isValid: true },
            sourceAnchor: '23 05 00',
            page: 1,
            status: 'ok',
          }],
        ]),
        source: 'bookmarkTree',
      };
      tree.roots.push(tree.nodes.get('bookmarkTree:23 05 00-1')!);
      tree.roots.push(tree.nodes.get('bookmarkTree:23 05 00-2')!);

      const filtered = shapeBookmarkTree(tree, defaultOptions);

      // Should have only one root (deduplicated)
      expect(filtered.roots.length).toBe(1);
    });

    it('should filter out junk nodes like 0.10 with body text', () => {
      const tree: BookmarkTree = {
        roots: [],
        nodes: new Map([
          ['section-1', {
            id: 'section-1',
            title: 'SECTION 23 05 00',
            level: 0,
            destination: { pageIndex: 0, fitType: null, isValid: true },
            sourceAnchor: '23 05 00',
            page: 1,
            status: 'ok',
          }],
          ['junk-1', {
            id: 'junk-1',
            title: 'and 500 FPM for intakes. Air pressure drop shall n',
            level: 1,
            destination: { pageIndex: 0, fitType: null, isValid: true },
            sourceAnchor: '0.10',
            parentId: 'section-1',
            page: 1,
            status: 'ok',
          }],
          ['article-1', {
            id: 'article-1',
            title: '1.1 Scope',
            level: 1,
            destination: { pageIndex: 0, fitType: null, isValid: true },
            sourceAnchor: '1.1',
            parentId: 'section-1',
            page: 1,
            status: 'ok',
          }],
        ]),
        source: 'bookmarkTree',
      };
      tree.nodes.get('section-1')!.childIds = ['junk-1', 'article-1'];
      tree.roots.push(tree.nodes.get('section-1')!);

      const filtered = shapeBookmarkTree(tree, defaultOptions);

      // Should keep section and article, filter out junk
      expect(filtered.nodes.has('section-1')).toBe(true);
      expect(filtered.nodes.has('article-1')).toBe(true);
      expect(filtered.nodes.has('junk-1')).toBe(false);
    });

    it('should sort roots by section number', () => {
      const tree: BookmarkTree = {
        roots: [],
        nodes: new Map([
          ['section-2', {
            id: 'section-2',
            title: 'SECTION 23 05 00',
            level: 0,
            destination: { pageIndex: 0, fitType: null, isValid: true },
            sourceAnchor: '23 05 00',
            page: 1,
            status: 'ok',
          }],
          ['section-1', {
            id: 'section-1',
            title: 'SECTION 01 23 31',
            level: 0,
            destination: { pageIndex: 0, fitType: null, isValid: true },
            sourceAnchor: '01 23 31',
            page: 1,
            status: 'ok',
          }],
        ]),
        source: 'bookmarkTree',
      };
      tree.roots.push(tree.nodes.get('section-2')!);
      tree.roots.push(tree.nodes.get('section-1')!);

      const sorted = shapeBookmarkTree(tree, defaultOptions);

      // Should be sorted: 01 23 31 before 23 05 00
      expect(sorted.roots[0].sourceAnchor).toBe('01 23 31');
      expect(sorted.roots[1].sourceAnchor).toBe('23 05 00');
    });

    it('should sort article children by numeric order', () => {
      const tree: BookmarkTree = {
        roots: [],
        nodes: new Map([
          ['section-1', {
            id: 'section-1',
            title: 'SECTION 23 05 00',
            level: 0,
            destination: { pageIndex: 0, fitType: null, isValid: true },
            sourceAnchor: '23 05 00',
            page: 1,
            status: 'ok',
            childIds: ['article-2', 'article-1'],
          }],
          ['article-2', {
            id: 'article-2',
            title: '2.1 Article',
            level: 1,
            destination: { pageIndex: 0, fitType: null, isValid: true },
            sourceAnchor: '2.1',
            parentId: 'section-1',
            page: 1,
            status: 'ok',
          }],
          ['article-1', {
            id: 'article-1',
            title: '1.1 Article',
            level: 1,
            destination: { pageIndex: 0, fitType: null, isValid: true },
            sourceAnchor: '1.1',
            parentId: 'section-1',
            page: 1,
            status: 'ok',
          }],
        ]),
        source: 'bookmarkTree',
      };
      tree.roots.push(tree.nodes.get('section-1')!);

      const sorted = shapeBookmarkTree(tree, defaultOptions);
      const sectionNode = sorted.nodes.get('section-1')!;

      // Children should be sorted: 1.1 before 2.1
      expect(sectionNode.childIds![0]).toBe('article-1');
      expect(sectionNode.childIds![1]).toBe('article-2');
    });

    it('should implement BookmarkProfile interface', () => {
      expect(specsV1Profile.id).toBe('specs-v1');
      expect(specsV1Profile.description).toBeDefined();
      expect(specsV1Profile.defaultMaxDepth).toBe(2);
      expect(specsV1Profile.defaultMaxTitleLength).toBe(120);
      expect(specsV1Profile.defaultIncludeSubsections).toBe(false);
      expect(typeof specsV1Profile.shape).toBe('function');
      expect(typeof specsV1Profile.normalizeTitle).toBe('function');
    });
  });
});

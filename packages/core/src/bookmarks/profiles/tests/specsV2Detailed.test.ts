/**
 * Tests for Specs Bookmark Profile v2 (Detailed)
 */

import { describe, it, expect } from '@jest/globals';
import {
  specsV2DetailedProfile,
  shapeBookmarkTreeV2Detailed,
} from '../specsV2Detailed.js';
import type { BookmarkTree } from '../../types.js';
import type { ResolvedBookmarkStyleOptions } from '../types.js';

describe('Specs Bookmark Profile v2 (Detailed)', () => {
  const defaultOptions: ResolvedBookmarkStyleOptions = {
    profile: 'specs-v2-detailed',
    maxDepth: 4,
    maxTitleLength: 120,
    includeSubsections: false,
    includeArticles: true,
    includeParts: false,
  };

  describe('shapeBookmarkTreeV2Detailed', () => {
    it('should filter out junk nodes like "and 500 FPM"', () => {
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

      const filtered = shapeBookmarkTreeV2Detailed(tree, defaultOptions);

      // Should keep section and article, filter out junk
      expect(filtered.nodes.has('section-1')).toBe(true);
      expect(filtered.nodes.has('article-1')).toBe(true);
      expect(filtered.nodes.has('junk-1')).toBe(false);
    });

    it('should reject deep subsections when includeSubsections=false', () => {
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
          ['subsection-1', {
            id: 'subsection-1',
            title: '2.4-T.5.b.1 Requirements',
            level: 3,
            destination: { pageIndex: 0, fitType: null, isValid: true },
            sourceAnchor: '2.4-T.5.b.1',
            parentId: 'section-1',
            page: 1,
            status: 'ok',
          }],
        ]),
        source: 'bookmarkTree',
      };
      tree.nodes.get('section-1')!.childIds = ['subsection-1'];
      tree.roots.push(tree.nodes.get('section-1')!);

      const filtered = shapeBookmarkTreeV2Detailed(tree, defaultOptions);

      // Should filter out subsection when includeSubsections=false
      expect(filtered.nodes.has('section-1')).toBe(true);
      expect(filtered.nodes.has('subsection-1')).toBe(false);
    });

    it('should include structural subsections when includeSubsections=true', () => {
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
          ['article-2', {
            id: 'article-2',
            title: '1.2 Description',
            level: 2,
            destination: { pageIndex: 0, fitType: null, isValid: true },
            sourceAnchor: '1.2',
            parentId: 'article-1',
            page: 1,
            status: 'ok',
          }],
          ['subsection-1', {
            id: 'subsection-1',
            title: '2.4-T.5.b.1 Requirements',
            level: 3,
            destination: { pageIndex: 0, fitType: null, isValid: true },
            sourceAnchor: '2.4-T.5.b.1',
            parentId: 'article-2',
            page: 1,
            status: 'ok',
          }],
        ]),
        source: 'bookmarkTree',
      };
      tree.nodes.get('section-1')!.childIds = ['article-1'];
      tree.nodes.get('article-1')!.childIds = ['article-2'];
      tree.nodes.get('article-2')!.childIds = ['subsection-1'];
      tree.roots.push(tree.nodes.get('section-1')!);

      const optionsWithSubsections: ResolvedBookmarkStyleOptions = {
        ...defaultOptions,
        includeSubsections: true,
      };

      const filtered = shapeBookmarkTreeV2Detailed(tree, optionsWithSubsections);

      // Should keep subsection when includeSubsections=true
      expect(filtered.nodes.has('section-1')).toBe(true);
      expect(filtered.nodes.has('subsection-1')).toBe(true);
    });

    it('should reject list marker anchors even with includeSubsections=true', () => {
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
          ['list-item-1', {
            id: 'list-item-1',
            title: 'A. First item',
            level: 3,
            destination: { pageIndex: 0, fitType: null, isValid: true },
            sourceAnchor: 'A.',
            parentId: 'section-1',
            page: 1,
            status: 'ok',
          }],
        ]),
        source: 'bookmarkTree',
      };
      tree.nodes.get('section-1')!.childIds = ['list-item-1'];
      tree.roots.push(tree.nodes.get('section-1')!);

      const optionsWithSubsections: ResolvedBookmarkStyleOptions = {
        ...defaultOptions,
        includeSubsections: true,
      };

      const filtered = shapeBookmarkTreeV2Detailed(tree, optionsWithSubsections);

      // Should filter out list marker even with includeSubsections=true
      expect(filtered.nodes.has('section-1')).toBe(true);
      expect(filtered.nodes.has('list-item-1')).toBe(false);
    });

    it('should implement BookmarkProfile interface', () => {
      expect(specsV2DetailedProfile.id).toBe('specs-v2-detailed');
      expect(specsV2DetailedProfile.description).toBeDefined();
      expect(specsV2DetailedProfile.defaultMaxDepth).toBe(4);
      expect(specsV2DetailedProfile.defaultMaxTitleLength).toBe(120);
      expect(specsV2DetailedProfile.defaultIncludeSubsections).toBe(false);
      expect(typeof specsV2DetailedProfile.shape).toBe('function');
      expect(typeof specsV2DetailedProfile.normalizeTitle).toBe('function');
    });
  });
});

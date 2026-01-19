/**
 * Raw Bookmark Profile
 * 
 * Preserves bookmarks as-is with minimal normalization.
 * No filtering, no depth limits (unless user overrides).
 * This is the "do not mess with my bookmarks" profile.
 */

import type { BookmarkProfile, ResolvedBookmarkStyleOptions } from './types.js';
import type { BookmarkTree } from '../types.js';

/**
 * Basic title normalization (whitespace collapse, trimming only)
 */
function normalizeTitleBasic(title: string, maxTitleLength: number): string {
  if (!title) {
    return '';
  }

  // Collapse whitespace and enforce single-line
  let normalized = title
    .replace(/\s+/g, ' ') // Collapse all whitespace to single space
    .replace(/\n/g, ' ') // Replace newlines with space
    .trim(); // Trim leading/trailing

  // Truncate if too long
  if (normalized.length > maxTitleLength) {
    normalized = normalized.substring(0, maxTitleLength - 1) + '…';
  }

  return normalized;
}

/**
 * Raw bookmark profile
 */
export const rawProfile: BookmarkProfile = {
  id: 'raw',
  description: 'Raw profile: preserves bookmarks as-is with minimal normalization',
  defaultMaxDepth: 999, // No depth limit by default
  defaultMaxTitleLength: 200, // Generous limit
  defaultIncludeSubsections: true, // Include everything by default
  defaultIncludeArticles: true,
  defaultIncludeParts: true,
  normalizeTitle: normalizeTitleBasic,

  shape(tree: BookmarkTree, options: ResolvedBookmarkStyleOptions): BookmarkTree {
    // Apply depth limit if user specified one
    if (options.maxDepth < 999) {
      const filteredNodes = new Map<string, import('../types.js').BookmarkNode>();
      const filteredRoots: import('../types.js').BookmarkNode[] = [];
      const nodeDepth = new Map<string, number>();

      function calculateDepth(nodeId: string): number {
        if (nodeDepth.has(nodeId)) {
          return nodeDepth.get(nodeId)!;
        }

        const node = tree.nodes.get(nodeId);
        if (!node) {
          return -1;
        }

        if (node.parentId) {
          const parentDepth = calculateDepth(node.parentId);
          nodeDepth.set(nodeId, parentDepth + 1);
        } else {
          nodeDepth.set(nodeId, 0);
        }

        return nodeDepth.get(nodeId)!;
      }

      // Filter by depth
      for (const [nodeId, node] of tree.nodes) {
        const depth = calculateDepth(nodeId);
        if (depth <= options.maxDepth) {
          const normalizedNode = {
            ...node,
            title: this.normalizeTitle(node.title, options.maxTitleLength),
          };
          filteredNodes.set(nodeId, normalizedNode);
        }
      }

      // Rebuild roots and childIds
      for (const root of tree.roots) {
        if (filteredNodes.has(root.id)) {
          filteredRoots.push(filteredNodes.get(root.id)!);
        }
      }

      // Rebuild childIds
      for (const node of filteredNodes.values()) {
        if (node.childIds) {
          node.childIds = node.childIds.filter(childId => filteredNodes.has(childId));
        }
      }

      return {
        roots: filteredRoots,
        nodes: filteredNodes,
        source: tree.source,
      };
    }

    // No depth limit: just normalize titles
    const normalizedNodes = new Map<string, import('../types.js').BookmarkNode>();
    for (const [nodeId, node] of tree.nodes) {
      normalizedNodes.set(nodeId, {
        ...node,
        title: this.normalizeTitle(node.title, options.maxTitleLength),
      });
    }

    return {
      roots: tree.roots.map(root => normalizedNodes.get(root.id) || root),
      nodes: normalizedNodes,
      source: tree.source,
    };
  },
};

/**
 * Specs Bookmark Profile v2 (Detailed)
 * 
 * Like specs-v1 but can include deeper subsections when they are structural headings.
 * Still rejects junk (list items, paragraph fragments, body text).
 */

import type { BookmarkProfile, ResolvedBookmarkStyleOptions } from './types.js';
import type { BookmarkAnchor } from '../../workflows/bookmarks/types.js';
import type { BookmarkNode, BookmarkTree } from '../types.js';
import { normalizeTitle as specsV1NormalizeTitle, compareNodes, getCanonicalKey } from './specsV1.js';

/**
 * Check if an anchor looks like a structural subsection heading
 * 
 * Allows:
 * - Patterns like "2.4-T.5.b.1" or "2.4.T.5.b.1" (common spec patterns)
 * 
 * Rejects:
 * - Pure list markers: "A.", "B.", "1)", "(a)", etc.
 * - Decimal-only anchors like "0.10" (measurements)
 * - Simple numeric patterns that are too shallow (handled by specs-v1 rules)
 */
function isStructuralSubsectionAnchor(anchor: string): boolean {
  // Reject decimal-only anchors (measurements)
  if (/^0\.\d+$/.test(anchor) || /^\d+\.\d{2,}$/.test(anchor)) {
    return false;
  }

  // Reject pure list markers first
  const listMarkerPatterns = [
    /^[A-Z]\.$/,           // "A.", "B."
    /^\d+\)$/,             // "1)", "2)"
    /^\([a-z]\)$/,         // "(a)", "(b)"
    /^[a-z]\)$/,           // "a)", "b)"
    /^[ivx]+\.$/i,         // "i.", "ii.", "iv."
  ];
  
  for (const pattern of listMarkerPatterns) {
    if (pattern.test(anchor)) {
      return false;
    }
  }

  // Allow patterns like "2.4-T.5.b.1" or "2.4.T.5.b.1" (structural spec patterns)
  // These have numeric parts separated by dots or dashes, with letter/number combinations
  // Must have at least one letter component (like "T.5" or "b.1")
  if (!/[A-Za-z]/.test(anchor)) {
    return false; // No letters = not a structural subsection
  }

  // Must start with a digit (structural subsections are numbered)
  if (!/^\d/.test(anchor)) {
    return false;
  }

  // Pattern: starts with number, has dots/dashes, includes letters
  // Examples: "2.4-T.5.b.1", "2.4.T.5.b.1", "1.2-A.3"
  // Allow any combination of numbers, dots, dashes, and letters
  // But reject simple numeric patterns that specs-v1 handles (like "1.1", "2.4")
  if (/^\d+\.\d+$/.test(anchor)) {
    return false; // Simple numeric like "1.1" - handled by specs-v1, not a deep subsection
  }

  // If it has letters and starts with a number, it's likely a structural subsection
  // Examples that should match: "2.4-T.5.b.1", "1.2-A.3", "3.1-B.2.c.1"
  return true;

  return false;
}

/**
 * Check if a bookmark anchor is eligible for inclusion in specs-v2-detailed
 * 
 * Similar to specs-v1 but:
 * - Allows deeper subsections if includeSubsections=true AND anchor is structural
 * - Still rejects junk (body text, list items, measurements)
 */
function isEligibleBookmarkV2Detailed(
  anchor: BookmarkAnchor,
  currentDepth: number,
  maxDepth: number,
  includeSubsections: boolean
): boolean {
  // Reject if too deep (unless includeSubsections allows it)
  if (currentDepth > maxDepth) {
    return false;
  }

  // Reject empty/whitespace titles
  const trimmedTitle = anchor.title.trim();
  if (!trimmedTitle) {
    return false;
  }

  // Level 0: Section-level (same as specs-v1)
  if (currentDepth === 0) {
    return trimmedTitle.startsWith('SECTION ') || 
           /^\d{2}\s+\d{2}\s+\d{2}(\s+\d{2})?$/.test(anchor.anchor);
  }

  // Level 1: PART-level OR Article-level (same as specs-v1)
  if (currentDepth === 1) {
    // PART: title starts with "PART " or anchor is "PART 1/2/3"
    if (trimmedTitle.startsWith('PART ') || /^PART\s+[1-9]\b/i.test(anchor.anchor)) {
      return true;
    }

    // Article: must have numeric anchor and title must start with anchor
    if (/^\d+(\.\d+)?$/.test(anchor.anchor)) {
      // Reject decimal-only anchors
      if (/^0\.\d+$/.test(anchor.anchor) || /^\d+\.\d{2,}$/.test(anchor.anchor)) {
        return false;
      }

      // Title must start with the anchor
      if (!trimmedTitle.startsWith(anchor.anchor)) {
        return false;
      }

      // Title must look like a heading (reuse specs-v1 logic)
      const firstChar = trimmedTitle[0];
      if (!/[A-Z0-9]/.test(firstChar)) {
        return false;
      }

      // Reject if starts with body text words
      const bodyTextStarters = /^(and|the|a|an|or|but|for|with|from|to|of|in|on|at|by)\s+/i;
      if (bodyTextStarters.test(trimmedTitle)) {
        return false;
      }

      return true;
    }

    return false;
  }

  // Level 2: Article-level (same as specs-v1)
  if (currentDepth === 2) {
    if (/^\d+(\.\d+)*$/.test(anchor.anchor)) {
      // Reject decimal-only anchors
      if (/^0\.\d+$/.test(anchor.anchor) || /^\d+\.\d{2,}$/.test(anchor.anchor)) {
        return false;
      }

      // Title must start with the anchor
      if (!trimmedTitle.startsWith(anchor.anchor)) {
        return false;
      }

      // Title must look like a heading
      const firstChar = trimmedTitle[0];
      if (!/[A-Z0-9]/.test(firstChar)) {
        return false;
      }

      const bodyTextStarters = /^(and|the|a|an|or|but|for|with|from|to|of|in|on|at|by)\s+/i;
      if (bodyTextStarters.test(trimmedTitle)) {
        return false;
      }

      return true;
    }

    return false;
  }

  // Level 3+: Deep subsections (only if includeSubsections=true AND anchor is structural)
  if (currentDepth >= 3) {
    if (!includeSubsections) {
      return false;
    }

    // Must be a structural subsection anchor
    if (!isStructuralSubsectionAnchor(anchor.anchor)) {
      return false;
    }

    // For subsections, title should ideally start with or contain the anchor
    // But we're lenient - just ensure it's not body text
    // (The anchor pattern check already ensures it's structural)

    // Title must look like a heading
    const firstChar = trimmedTitle[0];
    if (!/[A-Z0-9]/.test(firstChar)) {
      return false;
    }

    // Reject body text starters
    const bodyTextStarters = /^(and|the|a|an|or|but|for|with|from|to|of|in|on|at|by)\s+/i;
    if (bodyTextStarters.test(trimmedTitle)) {
      return false;
    }

    // Title should not look like a sentence fragment
    // (too many lowercase words, ends mid-clause, etc.)
    const words = trimmedTitle.split(/\s+/);
    if (words.length > 0) {
      const lowercaseWords = words.filter(w => /^[a-z]/.test(w)).length;
      if (lowercaseWords > words.length / 2 && words.length > 5) {
        return false; // Too many lowercase words = likely body text
      }
    }

    return true;
  }

  return false;
}

/**
 * Shape a bookmark tree according to specs v2 detailed profile
 */
export function shapeBookmarkTreeV2Detailed(
  tree: BookmarkTree,
  options: ResolvedBookmarkStyleOptions
): BookmarkTree {
  const filteredNodes = new Map<string, BookmarkNode>();
  const filteredRoots: BookmarkNode[] = [];
  const nodeDepth = new Map<string, number>();
  const isEligible = new Map<string, boolean>();

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

  // Calculate depths and eligibility
  for (const [nodeId, node] of tree.nodes) {
    const depth = calculateDepth(nodeId);
    nodeDepth.set(nodeId, depth);

    const anchor: BookmarkAnchor = {
      anchor: node.sourceAnchor || node.logicalPath || nodeId,
      title: node.title,
      level: depth,
    };

    isEligible.set(
      nodeId,
      isEligibleBookmarkV2Detailed(anchor, depth, options.maxDepth, options.includeSubsections)
    );
  }

  // Build filtered tree
  function processNode(nodeId: string, newParentId?: string): BookmarkNode | null {
    const node = tree.nodes.get(nodeId);
    if (!node) {
      return null;
    }

    const eligible = isEligible.get(nodeId) ?? false;

    if (!eligible) {
      // Process children (they may be hoisted)
      const childIds = node.childIds || [];
      for (const childId of childIds) {
        processNode(childId, newParentId);
      }
      return null;
    }

    // Node is eligible
    const normalizedTitle = specsV1NormalizeTitle(node.title, options.maxTitleLength);
    const filteredNode: BookmarkNode = {
      ...node,
      title: normalizedTitle,
      parentId: newParentId,
      childIds: [],
    };

    // Process children
    const childIds = node.childIds || [];
    const filteredChildIds: string[] = [];

    for (const childId of childIds) {
      const filteredChild = processNode(childId, filteredNode.id);
      if (filteredChild) {
        filteredChildIds.push(filteredChild.id);
      }
    }

    filteredNode.childIds = filteredChildIds;
    filteredNodes.set(filteredNode.id, filteredNode);

    return filteredNode;
  }

  // Process roots
  for (const root of tree.roots) {
    const filteredRoot = processNode(root.id);
    if (filteredRoot) {
      filteredRoots.push(filteredRoot);
    }
  }

  // Deduplicate roots
  const rootKeys = new Set<string>();
  const deduplicatedRoots: BookmarkNode[] = [];
  for (const root of filteredRoots) {
    const key = getCanonicalKey(root);
    if (!rootKeys.has(key)) {
      rootKeys.add(key);
      deduplicatedRoots.push(root);
    }
  }

  // Sort roots
  deduplicatedRoots.sort(compareNodes);

  // Sort children
  for (const node of filteredNodes.values()) {
    if (node.childIds && node.childIds.length > 0) {
      const children = node.childIds
        .map(id => filteredNodes.get(id))
        .filter((child): child is BookmarkNode => child !== undefined)
        .sort(compareNodes);
      node.childIds = children.map(child => child.id);
    }
  }

  return {
    roots: deduplicatedRoots,
    nodes: filteredNodes,
    source: tree.source,
  };
}

/**
 * Specs v2 detailed bookmark profile
 */
export const specsV2DetailedProfile: BookmarkProfile = {
  id: 'specs-v2-detailed',
  description: 'Specs bookmark profile v2 (detailed): SECTION/PART/Article + structural subsections when enabled',
  defaultMaxDepth: 4, // Allow deeper when includeSubsections=true
  defaultMaxTitleLength: 120,
  defaultIncludeSubsections: false, // Opt-in for subsections
  defaultIncludeArticles: true,
  defaultIncludeParts: false,
  normalizeTitle: specsV1NormalizeTitle,
  shape: shapeBookmarkTreeV2Detailed,
};

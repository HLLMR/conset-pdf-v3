/**
 * Specs Bookmark Profile v1
 * 
 * Filters and normalizes bookmarks for spec PDFs to produce clean, navigable outlines.
 * Only includes SECTION/PART/Article levels, excludes low-level nodes (list items, paragraphs).
 */

import type { BookmarkProfile, ResolvedBookmarkStyleOptions } from './types.js';
import type { BookmarkAnchor } from '../../workflows/bookmarks/types.js';
import type { BookmarkNode, BookmarkTree } from '../types.js';

/**
 * Normalize bookmark title
 * 
 * - Collapses whitespace
 * - Enforces single-line
 * - Trims leading/trailing whitespace
 * - Removes trailing hyphen-only fragments (e.g., "Title - " -> "Title")
 * - Truncates to max length with ellipsis
 */
export function normalizeTitle(title: string, maxTitleLength: number): string {
  if (!title) {
    return '';
  }

  // Collapse whitespace and enforce single-line
  let normalized = title
    .replace(/\s+/g, ' ') // Collapse all whitespace to single space
    .replace(/\n/g, ' ') // Replace newlines with space
    .trim(); // Trim leading/trailing

  // Remove trailing hyphen-only fragments (e.g., "Title - " -> "Title")
  // Handle both regular dash (-) and em dash (—)
  normalized = normalized.replace(/\s*[-—]\s*$/, '').trim();

  // Truncate if too long
  if (normalized.length > maxTitleLength) {
    normalized = normalized.substring(0, maxTitleLength - 1) + '…';
  }

  return normalized;
}

/**
 * Check if a title looks like a heading (not body text)
 * 
 * Heuristics:
 * - Starts with uppercase letter or number
 * - Not a sentence fragment (doesn't start with lowercase words like "and", "the", etc.)
 * - Has reasonable length (not too short, not too long)
 */
function looksLikeHeading(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed || trimmed.length < 3) {
    return false;
  }

  // Reject if starts with lowercase words that indicate body text
  const bodyTextStarters = /^(and|the|a|an|or|but|for|with|from|to|of|in|on|at|by)\s+/i;
  if (bodyTextStarters.test(trimmed)) {
    return false;
  }

  // Should start with uppercase letter, number, or special heading chars
  const firstChar = trimmed[0];
  if (!/[A-Z0-9]/.test(firstChar)) {
    return false;
  }

  return true;
}

/**
 * Check if a bookmark anchor is eligible for inclusion
 * 
 * Allows:
 * - Section-level nodes (level 0, title starts with "SECTION " OR anchor matches section pattern)
 * - Part-level nodes (level 1, title starts with "PART " OR anchor is "PART 1/2/3")
 * - Article-level nodes (level 1-2):
 *   - Anchor matches numeric pattern: /^\d+(\.\d+)?$/
 *   - Title must start with the anchor (e.g., anchor "1.1" requires title starting with "1.1")
 *   - Title must look like a heading (not body text)
 *   - Reject decimal-only anchors like "0.10", "21.47" (these are measurements, not headings)
 * 
 * Rejects:
 * - Nodes deeper than maxDepth
 * - Nodes with non-numeric article anchors (e.g., "1.1-T.5.b.1")
 * - Nodes with empty/whitespace-only titles
 * - Article nodes where title doesn't start with anchor
 * - Article nodes where title looks like body text
 * - Decimal-only numeric anchors (measurements, not headings)
 */
export function isEligibleBookmark(
  anchor: BookmarkAnchor,
  currentDepth: number,
  maxDepth: number
): boolean {
  // Reject if too deep
  if (currentDepth > maxDepth) {
    return false;
  }

  // Reject empty/whitespace titles
  const trimmedTitle = anchor.title.trim();
  if (!trimmedTitle) {
    return false;
  }

  // Level 0: Section-level (allow if title starts with "SECTION " or anchor looks like section)
  if (currentDepth === 0) {
    return trimmedTitle.startsWith('SECTION ') || 
           /^\d{2}\s+\d{2}\s+\d{2}(\s+\d{2})?$/.test(anchor.anchor); // Section pattern like "23 05 00" or "01 23 31"
  }

  // Level 1: Can be PART-level OR Article-level
  if (currentDepth === 1) {
    // PART: title starts with "PART " or anchor is "PART 1/2/3"
    if (trimmedTitle.startsWith('PART ') || /^PART\s+[1-9]\b/i.test(anchor.anchor)) {
      return true;
    }

    // Article: must have numeric anchor and title must start with anchor
    if (/^\d+(\.\d+)?$/.test(anchor.anchor)) {
      // Reject decimal-only anchors like "0.10", "21.47" (measurements, not headings)
      // These typically have 2+ decimal places or start with 0.
      if (/^0\.\d+$/.test(anchor.anchor) || /^\d+\.\d{2,}$/.test(anchor.anchor)) {
        return false;
      }

      // Title must start with the anchor (e.g., "1.1" anchor requires "1.1" at start of title)
      if (!trimmedTitle.startsWith(anchor.anchor)) {
        return false;
      }

      // Title must look like a heading
      return looksLikeHeading(trimmedTitle);
    }

    return false;
  }

  // Level 2: Article-level (allow if anchor matches numeric pattern and title starts with anchor)
  if (currentDepth === 2) {
    // Must match pattern: digits, optionally followed by dots and more digits
    // Examples: "1.1", "2.4", "3.2", "2.4.1" (subsections allowed at level 2)
    if (/^\d+(\.\d+)*$/.test(anchor.anchor)) {
      // Reject decimal-only anchors
      if (/^0\.\d+$/.test(anchor.anchor) || /^\d+\.\d{2,}$/.test(anchor.anchor)) {
        return false;
      }

      // Title must start with the anchor (allow flexible whitespace)
      const anchorPattern = new RegExp(`^\\s*${anchor.anchor.replace('.', '\\.')}\\s+`, 'i');
      if (!anchorPattern.test(trimmedTitle)) {
        return false;
      }

      // Title must look like a heading
      return looksLikeHeading(trimmedTitle);
    }

    return false;
  }

  // Reject anything else
  return false;
}

/**
 * Get canonical key for deduplication
 * 
 * For sections: use section number (e.g., "23 05 00")
 * For parts: use "PART 1/2/3" 
 * For articles: use article number (e.g., "1.1")
 */
export function getCanonicalKey(node: BookmarkNode): string {
  if (node.sourceAnchor) {
    // Extract section number from anchor (e.g., "23 05 00" from "bookmarkTree:23 05 00")
    const sectionMatch = node.sourceAnchor.match(/^(\d{2}\s+\d{2}\s+\d{2}(?:\s+\d{2})?)$/);
    if (sectionMatch) {
      return `section:${sectionMatch[1]}`;
    }

    // Extract PART
    const partMatch = node.sourceAnchor.match(/^PART\s+([1-9])$/i);
    if (partMatch) {
      return `part:${partMatch[1]}`;
    }

    // Extract article number
    const articleMatch = node.sourceAnchor.match(/^(\d+(?:\.\d+)?)$/);
    if (articleMatch) {
      return `article:${articleMatch[1]}`;
    }
  }

  // Fallback to node ID
  return node.id;
}

/**
 * Sort nodes by their canonical order
 * 
 * Sections: by section number (e.g., "01 23 31" before "23 05 00")
 * Parts: PART 1, PART 2, PART 3
 * Articles: by numeric order (1.1, 1.2, 2.1, 2.2, etc.)
 */
export function compareNodes(a: BookmarkNode, b: BookmarkNode): number {
  // Sections (level 0) come first, sorted by section number
  if (a.level === 0 && b.level === 0) {
    const aSection = a.sourceAnchor?.match(/^(\d{2})\s+(\d{2})\s+(\d{2})(?:\s+(\d{2}))?$/);
    const bSection = b.sourceAnchor?.match(/^(\d{2})\s+(\d{2})\s+(\d{2})(?:\s+(\d{2}))?$/);
    if (aSection && bSection) {
      // Compare division, section, subsection
      for (let i = 1; i <= 4; i++) {
        const aVal = aSection[i] ? parseInt(aSection[i], 10) : 0;
        const bVal = bSection[i] ? parseInt(bSection[i], 10) : 0;
        if (aVal !== bVal) {
          return aVal - bVal;
        }
      }
    }
    return (a.sourceAnchor || a.id).localeCompare(b.sourceAnchor || b.id);
  }

  // Parts (level 1, PART X)
  if (a.level === 1 && b.level === 1) {
    const aPart = a.sourceAnchor?.match(/^PART\s+([1-9])$/i);
    const bPart = b.sourceAnchor?.match(/^PART\s+([1-9])$/i);
    if (aPart && bPart) {
      return parseInt(aPart[1], 10) - parseInt(bPart[1], 10);
    }
  }

  // Articles (level 1-2, numeric anchors)
  if ((a.level === 1 || a.level === 2) && (b.level === 1 || b.level === 2)) {
    const aArticle = a.sourceAnchor?.match(/^(\d+)(?:\.(\d+))?$/);
    const bArticle = b.sourceAnchor?.match(/^(\d+)(?:\.(\d+))?$/);
    if (aArticle && bArticle) {
      // Compare major number first
      const aMajor = parseInt(aArticle[1], 10);
      const bMajor = parseInt(bArticle[1], 10);
      if (aMajor !== bMajor) {
        return aMajor - bMajor;
      }
      // Then minor number
      const aMinor = aArticle[2] ? parseInt(aArticle[2], 10) : 0;
      const bMinor = bArticle[2] ? parseInt(bArticle[2], 10) : 0;
      return aMinor - bMinor;
    }
  }

  // Fallback: by level, then by anchor/id
  if (a.level !== b.level) {
    return a.level - b.level;
  }
  return (a.sourceAnchor || a.id).localeCompare(b.sourceAnchor || b.id);
}

/**
 * Shape a bookmark tree according to specs v1 profile
 * 
 * - Filters out ineligible nodes
 * - Normalizes titles
 * - Hoists children when parents are filtered
 * - Deduplicates roots by canonical key
 * - Sorts nodes by section/part/article order
 * - Preserves stable IDs and structure
 */
export function shapeBookmarkTree(
  tree: BookmarkTree,
  options: ResolvedBookmarkStyleOptions
): BookmarkTree {
  const filteredNodes = new Map<string, BookmarkNode>();
  const filteredRoots: BookmarkNode[] = [];
  const nodeDepth = new Map<string, number>();

  // First pass: determine depth for each node and filter eligible nodes
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

    // Apply includeArticles and includeParts filters
    // Check if node is an article (numeric anchor like "1.1", "1.2")
    if (!options.includeArticles && depth > 0 && node.sourceAnchor && /^\d+\.\d+/.test(node.sourceAnchor)) {
      // Article node and includeArticles is false
      isEligible.set(nodeId, false);
      continue;
    }
    
    // Check if node is a PART
    if (!options.includeParts && depth >= 0 && node.title && /^PART\s+/i.test(node.title)) {
      // PART node and includeParts is false
      isEligible.set(nodeId, false);
      continue;
    }

    // For eligibility check, we need to reconstruct the anchor info
    // Since we're working with BookmarkNode, we'll use title and anchor patterns
    const anchor: BookmarkAnchor = {
      anchor: node.sourceAnchor || node.logicalPath || nodeId,
      title: node.title,
      level: depth,
    };

    isEligible.set(nodeId, isEligibleBookmark(anchor, depth, options.maxDepth));
  }

  // Second pass: build filtered tree with normalized titles and hoisted children
  function processNode(nodeId: string, newParentId?: string): BookmarkNode | null {
    const node = tree.nodes.get(nodeId);
    if (!node) {
      return null;
    }

    const eligible = isEligible.get(nodeId) ?? false;

    if (!eligible) {
      // Node is filtered out, but process children (they may be hoisted)
      const childIds = node.childIds || [];
      const hoistedChildren: string[] = [];

      for (const childId of childIds) {
        const hoistedChild = processNode(childId, newParentId);
        if (hoistedChild) {
          hoistedChildren.push(hoistedChild.id);
        }
      }

      // Return null (filtered), but children are processed
      return null;
    }

    // Node is eligible, create filtered version
    const normalizedTitle = normalizeTitle(node.title, options.maxTitleLength);
    const filteredNode: BookmarkNode = {
      ...node,
      title: normalizedTitle,
      parentId: newParentId,
      childIds: [], // Will be populated below
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

  // Deduplicate roots by canonical key
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

  // Sort children within each node
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
 * Specs v1 bookmark profile
 */
export const specsV1Profile: BookmarkProfile = {
  id: 'specs-v1',
  description: 'Specs bookmark profile v1: SECTION/PART/Article hierarchy with strict filtering',
  defaultMaxDepth: 2,
  defaultMaxTitleLength: 120,
  defaultIncludeSubsections: false,
  defaultIncludeArticles: true,
  defaultIncludeParts: false,
  normalizeTitle,
  shape: shapeBookmarkTree,
};

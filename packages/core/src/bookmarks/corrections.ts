/**
 * Bookmark correction application
 */

import type { BookmarkTree } from './types.js';
import type { BookmarksCorrectionOverlay } from '../workflows/bookmarks/types.js';
import { validateBookmarkTree } from './validator.js';

/**
 * Apply corrections to bookmark tree
 */
export function applyCorrections(
  tree: BookmarkTree,
  corrections: BookmarksCorrectionOverlay,
  pageCount: number
): BookmarkTree {
  const bookmarkCorrections = corrections.bookmarkCorrections;
  if (!bookmarkCorrections) {
    return tree;
  }
  
  let updatedTree = { ...tree };
  const nodes = new Map(updatedTree.nodes);
  
  // Apply rename corrections
  if (bookmarkCorrections.rename) {
    for (const [rowId, newTitle] of Object.entries(bookmarkCorrections.rename)) {
      const node = nodes.get(rowId);
      if (node) {
        nodes.set(rowId, {
          ...node,
          title: newTitle,
        });
      }
    }
  }
  
  // Apply delete corrections
  if (bookmarkCorrections.delete) {
    for (const rowId of bookmarkCorrections.delete) {
      nodes.delete(rowId);
      // Also remove from roots if present
      updatedTree.roots = updatedTree.roots.filter(root => root.id !== rowId);
      // Remove from parent's childIds
      for (const node of nodes.values()) {
        if (node.childIds) {
          node.childIds = node.childIds.filter(childId => childId !== rowId);
        }
      }
    }
  }
  
  // Apply retarget corrections
  if (bookmarkCorrections.retarget) {
    for (const [rowId, dest] of Object.entries(bookmarkCorrections.retarget)) {
      const node = nodes.get(rowId);
      if (node) {
        nodes.set(rowId, {
          ...node,
          destination: {
            pageIndex: dest.pageIndex,
            fitType: dest.fitType ?? null,
            top: dest.top,
            left: dest.left,
            zoom: dest.zoom,
            isValid: dest.pageIndex >= 0 && dest.pageIndex < pageCount,
            validationError: dest.pageIndex >= 0 && dest.pageIndex < pageCount
              ? undefined
              : `Page index ${dest.pageIndex} out of range`,
          },
          page: dest.pageIndex + 1, // 1-based for display
        });
      }
    }
  }
  
  // Apply reorder corrections
  if (bookmarkCorrections.reorder) {
    // Reorder roots according to reorder array
    const orderMap = new Map(bookmarkCorrections.reorder.map((id, index) => [id, index]));
    updatedTree.roots.sort((a, b) => {
      const aIndex = orderMap.get(a.id) ?? Infinity;
      const bIndex = orderMap.get(b.id) ?? Infinity;
      return aIndex - bIndex;
    });
  }
  
  // Apply rebuild mode
  if (bookmarkCorrections.rebuild) {
    // Rebuild mode: replace entire tree (handled by caller providing new tree)
    // This is a no-op here since tree is already replaced
  }
  
  // Re-validate tree after corrections
  const validatedNodes = validateBookmarkTree(nodes, pageCount);
  const validatedRoots = updatedTree.roots
    .map(root => validatedNodes.get(root.id) || root)
    .filter(root => validatedNodes.has(root.id)); // Remove deleted roots
  
  return {
    roots: validatedRoots,
    nodes: validatedNodes,
    source: updatedTree.source,
  };
}

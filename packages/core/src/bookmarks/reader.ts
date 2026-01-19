/**
 * Bookmark reading and tree building
 */

import type { DocumentContext } from '../analyze/documentContext.js';
import type { BookmarkNode, BookmarkTree, BookmarkDestination } from './types.js';
import { BOOKMARK_ISSUE_CODES } from './types.js';
import { validateBookmarkTree } from './validator.js';

/**
 * Read bookmarks from PDF and build hierarchical tree
 */
export async function readBookmarks(
  docContext: DocumentContext,
  pageCount: number
): Promise<BookmarkTree> {
  const flatBookmarks = await docContext.getBookmarks();
  
  // For now, we'll build a flat tree since DocumentContext.getBookmarks()
  // already flattens the hierarchy. In the future, we may need to preserve
  // hierarchy by reading outline structure directly from PDF.js
  
  const nodes = new Map<string, BookmarkNode>();
  const roots: BookmarkNode[] = [];
  
  for (let i = 0; i < flatBookmarks.length; i++) {
    const flat = flatBookmarks[i];
    
    // Create stable ID (since we don't have anchor, use index-based)
    const id = `bookmark:${i}`;
    
    // Validate page index
    const isValid = flat.pageIndex >= 0 && flat.pageIndex < pageCount;
    const destination: BookmarkDestination = {
      pageIndex: flat.pageIndex,
      fitType: null, // Default (top of page) - we don't extract fit type from pdfjs
      isValid,
      validationError: isValid ? undefined : `Page index ${flat.pageIndex} out of range (0-${pageCount - 1})`,
    };
    
    const node: BookmarkNode = {
      id,
      title: flat.title,
      level: 0, // Flat for now - will be enhanced when we preserve hierarchy
      destination,
      page: flat.pageIndex + 1, // 1-based for display
      status: isValid ? 'ok' : 'error',
      issues: isValid ? undefined : [BOOKMARK_ISSUE_CODES.BOOKMARK_DEAD_DEST],
    };
    
    nodes.set(id, node);
    roots.push(node);
  }
  
  // Validate all nodes
  const validatedNodes = validateBookmarkTree(nodes, pageCount);
  
  // Update roots with validated nodes
  const validatedRoots = roots.map(root => validatedNodes.get(root.id) || root);
  
  return {
    roots: validatedRoots,
    nodes: validatedNodes,
    source: 'existing',
  };
}

// TODO: Extract fit type from PDF destination (if available)
// This is a placeholder - pdfjs doesn't easily expose fit types
// function extractFitType(_dest: any): 'XYZ' | 'Fit' | 'FitH' | null {
//   // TODO: Extract fit type from destination array if available
//   // For now, return null (default)
//   return null;
// }

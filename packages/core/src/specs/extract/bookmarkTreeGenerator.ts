/**
 * Bookmark tree generator for specs PDFs
 * 
 * Generates BookmarkAnchorTree from SpecDoc AST for bookmarks pipeline integration.
 */

import type { SpecDoc, BookmarkAnchorTree, BookmarkAnchor, SpecNode } from '../ast/types.js';

/**
 * Generate bookmark tree from SpecDoc AST
 */
export function generateBookmarkTree(specDoc: SpecDoc): BookmarkAnchorTree {
  const bookmarks: BookmarkAnchor[] = [];
  
  for (const section of specDoc.sections) {
    // Create section-level bookmark
    // IMPORTANT: section.startPage is 0-based (from sectionDetector), but pageIndexHint must be 1-based
    // Convert 0-based to 1-based for pageIndexHint
    const sectionBookmark: BookmarkAnchor = {
      anchor: section.sectionId, // Use section ID as anchor for section-level bookmark
      title: section.title || `SECTION ${section.sectionId}`,
      level: 0,
      pageIndexHint: section.startPage + 1, // Convert 0-based to 1-based (pageIndexHint is 1-based)
      children: [],
    };
    
    // Add node-level bookmarks (only nodes with anchors)
    const nodeBookmarks = extractNodeBookmarks(section.content, 1);
    sectionBookmark.children = nodeBookmarks;
    
    bookmarks.push(sectionBookmark);
  }
  
  return { bookmarks };
}

/**
 * Extract bookmarks from nodes recursively
 */
function extractNodeBookmarks(
  nodes: SpecNode[],
  level: number
): BookmarkAnchor[] {
  const bookmarks: BookmarkAnchor[] = [];
  
  for (const node of nodes) {
    // Only create bookmarks for nodes with anchors
    if (node.anchor) {
      // IMPORTANT: node.page is 1-based (from textExtractor), which matches pageIndexHint requirement
      // No conversion needed for node.page
      const bookmark: BookmarkAnchor = {
        anchor: node.anchor,
        title: deriveBookmarkTitle(node),
        level,
        pageIndexHint: node.page, // Already 1-based
        children: [],
      };
      
      // Add children if node has children with anchors
      if (node.children && node.children.length > 0) {
        bookmark.children = extractNodeBookmarks(node.children, level + 1);
      }
      
      bookmarks.push(bookmark);
    } else if (node.children && node.children.length > 0) {
      // Node without anchor but has children - recurse into children
      const childBookmarks = extractNodeBookmarks(node.children, level);
      bookmarks.push(...childBookmarks);
    }
  }
  
  return bookmarks;
}

/**
 * Derive bookmark title from node
 */
function deriveBookmarkTitle(node: SpecNode): string {
  // Use node text (first 50 chars) for headings
  if (node.type === 'heading' && node.text) {
    const title = node.text.trim();
    return title.length > 50 ? title.substring(0, 50) : title;
  }
  
  // Use list item text (first 50 chars)
  if (node.type === 'list-item' && node.text) {
    const title = node.text.trim();
    return title.length > 50 ? title.substring(0, 50) : title;
  }
  
  // Use paragraph text (first 50 chars)
  if (node.text) {
    const title = node.text.trim();
    return title.length > 50 ? title.substring(0, 50) : title;
  }
  
  // Fallback to anchor
  return node.anchor || 'Untitled';
}

/**
 * Bookmark data models
 */

import type { RowStatus } from '../workflows/types.js';

/**
 * Bookmark destination
 */
export interface BookmarkDestination {
  /** Page index (0-based in PDF, explicit about base) */
  pageIndex: number;
  /** Fit mode (limit to safe subset) */
  fitType: 'XYZ' | 'Fit' | 'FitH' | null; // null = default (top of page)
  /** Optional: Top coordinate (for XYZ fit) */
  top?: number;
  /** Optional: Left coordinate (for XYZ fit) */
  left?: number;
  /** Optional: Zoom level (for XYZ fit) */
  zoom?: number;
  /** Validation status */
  isValid: boolean;
  /** Validation error (if invalid) */
  validationError?: string;
}

/**
 * Bookmark node in tree
 */
export interface BookmarkNode {
  /** Stable node ID (format: `${source}:${anchor || logicalPath}`)
   *  - Prefer anchor from BookmarkAnchorTree (e.g., "2.4-T.5.b.1")
   *  - Fallback to logical path (e.g., "section-23-09-00-5" for drawings)
   *  - pageIndex is metadata, not part of ID (pages can shift during regeneration)
   */
  id: string;
  /** Bookmark title */
  title: string;
  /** Hierarchy level (0 = top-level) */
  level: number;
  /** Destination */
  destination: BookmarkDestination;
  /** Source anchor (if from BookmarkAnchorTree) - primary stable identifier */
  sourceAnchor?: string;
  /** Logical path (fallback when no anchor) - e.g., sheetId for drawings */
  logicalPath?: string;
  /** Parent node ID (for hierarchy) */
  parentId?: string;
  /** Child node IDs */
  childIds?: string[];
  /** Page number (1-based) where bookmark points - metadata only, not part of stable ID */
  page: number;
  /** Status */
  status: RowStatus; // 'ok' | 'warning' | 'error'
  /** Issues (if any) */
  issues?: string[];
}

/**
 * Bookmark tree structure
 */
export interface BookmarkTree {
  /** Root nodes (top-level bookmarks) */
  roots: BookmarkNode[];
  /** All nodes indexed by ID */
  nodes: Map<string, BookmarkNode>;
  /** Source of tree (e.g., 'existing', 'bookmarkTree', 'inventory') */
  source: string;
}

/**
 * Issue codes for bookmarks workflow
 */
export const BOOKMARK_ISSUE_CODES = {
  /** Bookmark missing required fields */
  NO_ID: 'NO_ID',
  /** Destination resolution confidence low */
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',
  /** Bookmark has no valid destination (page doesn't exist) */
  BOOKMARK_ORPHAN: 'BOOKMARK_ORPHAN',
  /** Bookmark destination points to invalid page index */
  BOOKMARK_DEAD_DEST: 'BOOKMARK_DEAD_DEST',
  /** Unsupported fit type (reported, not dropped) */
  BOOKMARK_INVALID_FIT: 'BOOKMARK_INVALID_FIT',
  /** Hierarchy level doesn't match expected structure */
  BOOKMARK_MISMATCHED_HIERARCHY: 'BOOKMARK_MISMATCHED_HIERARCHY',
  /** Multiple bookmarks with same title at same level */
  BOOKMARK_DUPLICATE_TITLE: 'BOOKMARK_DUPLICATE_TITLE',
  /** Anchor from BookmarkAnchorTree not found in PDF */
  BOOKMARK_ANCHOR_NOT_FOUND: 'BOOKMARK_ANCHOR_NOT_FOUND',
  /** pageIndexHint doesn't match resolved page */
  BOOKMARK_PAGE_HINT_MISMATCH: 'BOOKMARK_PAGE_HINT_MISMATCH',
} as const;

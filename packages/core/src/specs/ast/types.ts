/**
 * Specs AST types
 * 
 * Defines the structured representation of spec documents extracted from PDFs.
 */

import type { SpecsMasterformatMeta } from '../../standards/types.js';

/**
 * Complete spec document AST
 */
export interface SpecDoc {
  /** Document metadata */
  meta: {
    sourcePdfPath: string;
    extractedAt: string; // ISO timestamp
    pageCount: number;
    sectionCount: number;
  };
  
  /** Root sections (top-level divisions like "23 09 00") */
  sections: SpecSection[];
}

/**
 * Spec section (e.g., "23 09 00")
 */
export interface SpecSection {
  /** Stable node ID (format: `section-${sectionId}-${index}`) */
  id: string;
  
  /** Section identifier (e.g., "23 09 00") */
  sectionId: string;
  
  /** Page range (1-based, inclusive) */
  startPage: number;
  endPage: number;
  
  /** Section title (if detected) */
  title?: string;
  
  /** Hierarchical content nodes */
  content: SpecNode[];
  
  /** MasterFormat metadata (from standards module) */
  masterFormat?: SpecsMasterformatMeta;
}

/**
 * Spec content node
 */
export interface SpecNode {
  /** Stable node ID (format: `${parentId}-${nodeIndex}` or anchor-based) */
  id: string;
  
  /** Hierarchical anchor (e.g., "2.4-T.5.b.1") - primary navigation key, REQUIRED for patchability */
  anchor: string | null; // null during extraction if not found, but must be resolved before patch application
  
  /** Node type */
  type: 'heading' | 'paragraph' | 'list-item' | 'table-placeholder' | 'section-break';
  
  /** Text content (for paragraphs, headings, list items) */
  text?: string;
  
  /** List item number/letter (e.g., "a", "1", "A") */
  listMarker?: string;
  
  /** Indentation level (0 = top-level, 1 = nested, etc.) */
  level: number;
  
  /** Page number (1-based) where this node appears */
  page: number;
  
  /** Y coordinate on page (for rendering position) */
  y?: number;
  
  /** Child nodes (for hierarchical structure) */
  children?: SpecNode[];
  
  /** Parent node ID (for navigation) */
  parentId?: string;
  
  /** Confidence of extraction (0.0 to 1.0) */
  confidence: number;
  
  /** Extraction issues (if any) */
  issues?: string[];
}

/**
 * Bookmark anchor tree for bookmarks pipeline integration
 */
export interface BookmarkAnchorTree {
  /** Root bookmarks (one per section) */
  bookmarks: BookmarkAnchor[];
}

/**
 * Bookmark anchor node
 */
export interface BookmarkAnchor {
  /** Hierarchical anchor (e.g., "2.4-T.5.b.1") - primary key, REQUIRED */
  anchor: string;
  
  /** Bookmark title (derived from section heading or node heading) */
  title: string;
  
  /** Hierarchy level (0 = top-level section, 1 = subsection, etc.) */
  level: number;
  
  /** Optional: Page number hint (1-based, approximate) */
  pageIndexHint?: number;
  
  /** Child bookmarks (nested hierarchy) */
  children?: BookmarkAnchor[];
}

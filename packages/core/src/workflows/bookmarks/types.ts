/**
 * Bookmarks workflow input types
 */

import type { LayoutProfile } from '../../layout/types.js';
import type { CorrectionOverlay } from '../types.js';

/**
 * BookmarkAnchorTree contract (from Specs Pipeline)
 */
export interface BookmarkAnchorTree {
  /** Root bookmarks (one per section) */
  bookmarks: BookmarkAnchor[];
}

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

/**
 * Input for bookmarks workflow analyze operation
 */
export interface BookmarksAnalyzeInput {
  /** Input PDF path */
  inputPdfPath: string;
  /** Optional: BookmarkAnchorTree from Specs Pipeline */
  bookmarkTree?: BookmarkAnchorTree;
  /** Optional: Document type (for inventory-based fallback) */
  docType?: 'drawings' | 'specs';
  /** Optional: Layout profile (for drawings inventory detection) */
  profile?: LayoutProfile;
  /** Options */
  options?: {
    verbose?: boolean;
    jsonOutputDir?: string; // Directory for JSON outputs
    style?: import('../../bookmarks/profiles/types.js').BookmarkStyleOptions;
    /** Section start resolution strategy: 'footer' (default for specs), 'heading', or 'hint' */
    sectionStartStrategy?: 'footer' | 'heading' | 'hint';
  };
}

/**
 * Input for bookmarks workflow execute operation
 */
export interface BookmarksExecuteInput {
  /** Input PDF path */
  inputPdfPath: string;
  /** Output PDF path */
  outputPdfPath: string;
  /** Optional: BookmarkAnchorTree from Specs Pipeline */
  bookmarkTree?: BookmarkAnchorTree;
  /** Optional: Document type */
  docType?: 'drawings' | 'specs';
  /** Optional: Layout profile */
  profile?: LayoutProfile;
  /** Options */
  options?: {
    verbose?: boolean;
    reportPath?: string; // Path for audit trail JSON
    jsonOutputPath?: string; // Path for bookmark tree JSON (post-write)
    rebuild?: boolean; // Full rebuild mode (authoritative tree wins)
    style?: import('../../bookmarks/profiles/types.js').BookmarkStyleOptions;
    /** Section start resolution strategy: 'footer' (default for specs), 'heading', or 'hint' */
    sectionStartStrategy?: 'footer' | 'heading' | 'hint';
    /** Allow invalid section destinations (override validation gate) */
    allowInvalidDestinations?: boolean;
  };
  /** Optional: corrected inventory from applyCorrections */
  analyzed?: {
    bookmarkTree?: unknown; // BookmarkTree (will be defined in bookmarks/types.ts)
  };
  /** Corrections overlay */
  corrections?: BookmarksCorrectionOverlay;
}

/**
 * Extended CorrectionOverlay for bookmarks workflow
 */
export interface BookmarksCorrectionOverlay extends CorrectionOverlay {
  /** Bookmark-specific corrections */
  bookmarkCorrections?: {
    /** Rename bookmarks (keyed by stable row.id) */
    rename?: {
      [rowId: string]: string; // New title
    };
    /** Reorder bookmarks (array of row IDs in desired order) */
    reorder?: string[];
    /** Delete bookmarks (array of row IDs) */
    delete?: string[];
    /** Retarget destinations (keyed by stable row.id) */
    retarget?: {
      [rowId: string]: {
        pageIndex: number; // 0-based
        fitType?: 'XYZ' | 'Fit' | 'FitH' | null;
        top?: number;
        left?: number;
        zoom?: number;
      };
    };
    /** Full rebuild mode: authoritative tree wins (ignore existing bookmarks) */
    rebuild?: boolean;
  };
}

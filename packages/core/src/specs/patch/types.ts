/**
 * Patch operation types for specs PDFs
 * 
 * Defines the patch language for deterministic spec edits.
 */

/**
 * Patch document
 */
export interface SpecPatch {
  /** Patch metadata */
  meta: {
    version: string; // "1.0"
    createdAt: string; // ISO timestamp
    description?: string;
  };
  
  /** Operations to apply (in order) */
  operations: SpecPatchOperation[];
}

/**
 * Patch operation types
 */
export type SpecPatchOperation =
  | InsertOperation
  | MoveOperation
  | RenumberOperation
  | ReplaceOperation
  | DeleteOperation;

/**
 * Insert operation
 */
export interface InsertOperation {
  op: 'insert';
  /** Target anchor (where to insert) */
  targetAnchor: string;
  /** Insert position: 'before' | 'after' | 'child' */
  position: 'before' | 'after' | 'child';
  /** Content to insert */
  content: {
    type: 'paragraph' | 'list-item';
    text: string;
    level?: number; // Default: same as target
    listMarker?: string; // For list items
  };
  /** Optional: verify target exists with this text */
  mustMatchText?: string;
  /** Optional: section ID context for disambiguation */
  sectionId?: string;
}

/**
 * Move operation
 */
export interface MoveOperation {
  op: 'move';
  /** Source anchor(s) */
  sourceAnchors: string[];
  /** Target anchor (where to move) */
  targetAnchor: string;
  /** Move position: 'before' | 'after' | 'child' */
  position: 'before' | 'after' | 'child';
  /** Optional: section ID context for disambiguation */
  sectionId?: string;
}

/**
 * Renumber operation
 */
export interface RenumberOperation {
  op: 'renumber';
  /** Starting anchor (renumber this and all subsequent siblings) */
  startAnchor: string;
  /** New starting number/letter */
  newStart: string; // e.g., "a", "1", "A"
  /** Numbering style: 'alpha-lower' | 'alpha-upper' | 'numeric' */
  style: 'alpha-lower' | 'alpha-upper' | 'numeric';
  /** Optional: section ID context for disambiguation */
  sectionId?: string;
}

/**
 * Replace operation
 */
export interface ReplaceOperation {
  op: 'replace';
  /** Target anchor */
  targetAnchor: string;
  /** New text content */
  newText: string;
  /** Optional: verify current text matches */
  mustMatchText?: string;
  /** Optional: section ID context for disambiguation */
  sectionId?: string;
}

/**
 * Delete operation
 */
export interface DeleteOperation {
  op: 'delete';
  /** Target anchor(s) */
  targetAnchors: string[];
  /** Optional: section ID context for disambiguation */
  sectionId?: string;
}

/**
 * Types for narrative PDF processing
 * 
 * These types define the structure for extracting and parsing instructions
 * from narrative PDFs (addenda documents that describe changes).
 */

/**
 * Text document extracted from a narrative PDF
 */
export interface NarrativeTextDocument {
  /** SHA256 hash of the PDF file bytes */
  fileHash: string;
  /** Total number of pages in the PDF */
  pageCount: number;
  /** Per-page text extraction */
  pages: Array<{
    /** 1-based page number */
    pageNumber: number;
    /** Extracted text from this page */
    text: string;
  }>;
  /** Full concatenated text from all pages */
  fullText: string;
}

/**
 * Complete instruction set parsed from a narrative document
 */
export interface NarrativeInstructionSet {
  /** Metadata about the source document */
  meta: {
    fileHash: string;
    pageCount: number;
    extractedAtIso: string; // ISO 8601 timestamp
  };
  /** Drawing-related instructions (sheet changes) */
  drawings: DrawingInstruction[];
  /** Spec-related instructions (spec section changes) */
  specs: SpecInstruction[];
  /** Parser-level issues (duplicates, malformed IDs, etc.) */
  issues: NarrativeParseIssue[];
}

/**
 * Instruction for a drawing/sheet change
 */
export interface DrawingInstruction {
  kind: "sheetChange";
  /** Type of change (e.g., "revised_reissued") */
  changeType: "revised_reissued" | "unknown";
  /** Raw sheet ID as found in the narrative */
  sheetIdRaw: string;
  /** Normalized sheet ID (canonical form) */
  sheetIdNormalized: string;
  /** Raw title text if available */
  titleRaw?: string;
  /** Additional notes (e.g., "Formerly named DG1.1.") */
  notes?: string[];
  /** Evidence of where this instruction was found */
  evidence: {
    pageNumber: number;
    rawLine: string;
  };
  /** Source of extraction */
  source: "algorithmic";
}

/**
 * Instruction for a spec section change
 */
export interface SpecInstruction {
  kind: "specSectionChange";
  /** Raw section ID as found in the narrative */
  sectionIdRaw: string;
  /** Normalized section ID (format: "NN NN NN") */
  sectionIdNormalized: string;
  /** Raw title text if available */
  titleRaw?: string;
  /** Actions to perform on this section */
  actions: Array<{
    /** Action verb */
    verb: "add" | "revise" | "delete" | "replace" | "unknown";
    /** Target text if specified */
    targetRaw?: string;
    /** Raw action text */
    rawText: string;
  }>;
  /** Evidence of where this instruction was found */
  evidence: {
    pageNumber: number;
    rawBlock: string;
  };
  /** Source of extraction */
  source: "algorithmic";
}

/**
 * Parser-level issue (not an inventory comparison issue)
 */
export interface NarrativeParseIssue {
  /** Severity level */
  severity: "info" | "warn" | "error";
  /** Stable issue code (e.g., "NARR_DUP_SHEET_ID", "NARR_BAD_SECTION_ID") */
  code: string;
  /** Human-readable message */
  message: string;
  /** Optional evidence of where the issue was found */
  evidence?: {
    pageNumber: number;
    rawText: string;
  };
}

/**
 * Validation issue detected when comparing narrative instructions against inventory
 */
export interface NarrativeIssue {
  /** Severity level */
  severity: "info" | "warn" | "error";
  /** Stable issue code (e.g., "NARR_SHEET_NOT_FOUND", "NARR_SPEC_NEAR_MATCH") */
  code: string;
  /** Human-readable message */
  message: string;
  /** Optional reference to the narrative instruction that caused this issue */
  ref?: {
    /** Type of instruction */
    type: "sheet" | "specSection";
    /** Raw ID as found in narrative */
    idRaw: string;
    /** Normalized ID */
    idNormalized: string;
  };
  /** Inventory row IDs that are relevant to this issue (stable row.id values) */
  inventoryRowIds?: string[];
  /** Near matches found (for near-match issues) */
  nearMatches?: Array<{
    /** Stable row.id value */
    rowId: string;
    /** Normalized ID of the candidate match */
    normalizedId: string;
    /** Title if available */
    title?: string;
    /** Similarity score (0..1) */
    score: number;
    /** Reason for the match (e.g., "id_similarity") */
    reason: string;
  }>;
}

/**
 * Correction patch suggestion
 * 
 * Represents a deterministic suggestion to map a narrative instruction
 * to an inventory row, typically generated from NEAR_MATCH validation issues.
 */
export interface CorrectionPatch {
  /** Type of correction */
  type: "sheet" | "specSection";
  /** Target normalized ID from narrative (what the narrative says) */
  narrativeIdNormalized: string;
  /** Suggested inventory row ID to match (stable row.id value) */
  suggestedRowId: string;
  /** Human-readable reason for suggestion (e.g., "id similarity 0.92") */
  reason: string;
  /** Optional explanation with details */
  explanation?: string;
}

/**
 * Validation report comparing narrative instructions against inventory
 */
export interface NarrativeValidationReport {
  /** Issues detected during validation */
  issues: NarrativeIssue[];
  /** Optional suggested corrections (not implemented in Phase 2) */
  suggestedCorrections?: CorrectionPatch[];
  /** Metadata about the validation */
  meta: {
    /** ISO 8601 timestamp when validation was performed */
    comparedAtIso: string;
    /** Hash of the narrative instruction set (for change detection) */
    narrativeHash: string;
    /** Optional hash of the inventory (for change detection) */
    inventoryHash?: string;
  };
}

/**
 * Core workflow engine types
 * 
 * These types are designed to be reusable across different workflows (merge, split, assemble, bookmark).
 * They provide a consistent structure for inventory analysis, issues, conflicts, and execution results.
 */

import type {
  NarrativeInstructionSet,
  NarrativeValidationReport,
} from '../narrative/index.js';

/**
 * Workflow identifier
 */
export type WorkflowId = 'merge' | 'split' | 'assemble' | 'bookmark' | 'specs-patch' | 'fix-bookmarks';

/**
 * Issue severity level
 */
export type Severity = 'error' | 'warning' | 'info';

/**
 * Row status in inventory
 */
export type RowStatus = 'ok' | 'warning' | 'error' | 'conflict';

/**
 * Confidence level (0.0 to 1.0)
 * Matches existing codebase convention
 */
export type Confidence = number; // 0..1

/**
 * Base inventory row structure
 * Extended by workflow-specific implementations
 */
export interface InventoryRowBase {
  /** Unique row identifier (e.g., normalized sheet ID, page index) */
  id: string;
  /** Optional lane identifier for multi-lane workflows (future) */
  laneId?: string;
  /** Source file or origin */
  source?: string;
  /** Page number (1-based) or page index (0-based) - clarify in workflow */
  page?: number;
  /** Status of this row */
  status: RowStatus;
  /** Confidence level (0.0 to 1.0) */
  confidence: Confidence;
  /** Action to be taken (e.g., 'replace', 'insert', 'skip') */
  action?: string;
  /** Additional notes */
  notes?: string;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Issue detected during analysis
 */
export interface Issue {
  /** Unique issue identifier */
  id: string;
  /** Severity level */
  severity: Severity;
  /** Issue code (e.g., 'NO_ID', 'LOW_CONFIDENCE', 'DUPLICATE') */
  code: string;
  /** Human-readable message */
  message: string;
  /** Row IDs affected by this issue */
  rowIds: string[];
  /** Optional lane identifier */
  laneId?: string;
  /** Additional details */
  details?: Record<string, unknown>;
}

/**
 * Conflict between different sources (e.g., narrative vs detection)
 */
export interface Conflict {
  /** Unique conflict identifier */
  id: string;
  /** Conflict code */
  code: string;
  /** Human-readable message */
  message: string;
  /** Row IDs involved in conflict */
  rowIds: string[];
  /** Optional lane identifier */
  laneId?: string;
  /** Narrative instruction (if applicable) */
  narrative?: unknown;
  /** Detected value (if applicable) */
  detected?: unknown;
  /** Suggested resolutions */
  suggestions?: unknown[];
}

/**
 * Inventory analysis result
 */
export interface InventoryResult {
  /** Workflow identifier */
  workflowId: WorkflowId;
  /** Optional lane identifier (for multi-lane workflows) */
  laneId?: string;
  /** Inventory rows */
  rows: InventoryRowBase[];
  /** Issues detected */
  issues: Issue[];
  /** Conflicts detected (future: narrative vs detection) */
  conflicts: Conflict[];
  /** Summary statistics */
  summary: {
    totalRows: number;
    rowsWithIds: number;
    rowsWithoutIds: number;
    rowsOk: number;
    rowsWarning: number;
    rowsError: number;
    rowsConflict: number;
    issuesCount: number;
    conflictsCount: number;
    [key: string]: number | string | undefined; // Allow workflow-specific summary fields
  };
  /** Optional metadata */
  meta?: Record<string, unknown>;
  /** Optional narrative instruction set (advisory only, read-only) */
  narrative?: NarrativeInstructionSet;
  /** Optional narrative validation report (advisory only, read-only) */
  narrativeValidation?: NarrativeValidationReport;
}

/**
 * Correction overlay for user edits
 */
export interface CorrectionOverlay {
  /** Optional lane identifier */
  laneId?: string;
  /** Row IDs to ignore */
  ignoredRowIds?: string[];
  /** Page numbers to ignore */
  ignoredPages?: number[];
  /** Overrides per row ID */
  overrides: {
    [rowId: string]: {
      /** Action override */
      action?: string;
      /** Field overrides */
      fields?: Record<string, unknown>;
      /** Conflict resolution choice */
      resolvedConflictChoice?: 'narrative' | 'detected' | 'manual';
    };
  };
  /** Notes */
  notes?: string;
  /** Patch operations (for specs-patch workflow) */
  patches?: unknown[]; // Will be SpecPatchOperation[] once types are imported
  /** Patch file path (alternative to inline patches) */
  patchPath?: string;
}

/**
 * Execution result
 */
export interface ExecuteResult {
  /** Output file paths (key: identifier, value: file path) */
  outputs: Record<string, string>;
  /** Execution summary */
  summary: {
    success: boolean;
    [key: string]: unknown;
  };
  /** Warnings (if any) */
  warnings?: string[];
  /** Errors (if any) */
  errors?: string[];
}

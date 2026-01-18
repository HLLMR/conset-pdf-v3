/**
 * Merge workflow input types
 */

import type { ConsetDocType, MergeAddendaOptions } from '../../index.js';
import type { LayoutProfile } from '../../layout/types.js';
import type { MergePlan } from '../../core/planner.js';
import type { CorrectionOverlay } from '../types.js';

/**
 * Input for merge workflow analyze operation
 */
export interface MergeAnalyzeInput {
  /** Document type ('drawings' or 'specs') */
  docType: ConsetDocType;
  /** Path to original PDF */
  originalPdfPath: string;
  /** Paths to addendum PDFs */
  addendumPdfPaths: string[];
  /** Layout profile (pass object, no profileId lookup in core) */
  profile?: LayoutProfile;
  /** Additional options (analyze will force dryRun=true) */
  options?: Partial<MergeAddendaOptions>;
  /** Optional path to narrative PDF for advisory analysis */
  narrativePdfPath?: string;
}

/**
 * Input for merge workflow execute operation
 */
export interface MergeExecuteInput {
  /** Document type ('drawings' or 'specs') */
  docType: ConsetDocType;
  /** Path to original PDF */
  originalPdfPath: string;
  /** Paths to addendum PDFs */
  addendumPdfPaths: string[];
  /** Path to output PDF */
  outputPdfPath: string;
  /** Layout profile (pass object, no profileId lookup in core) */
  profile?: LayoutProfile;
  /** Additional options */
  options?: Partial<MergeAddendaOptions>;
  /** Optional plan from analyze() for optimization (can be ignored in Phase 1) */
  analyzed?: {
    plan?: MergePlan;
  };
  /** Corrections overlay (accepted but not applied in Phase 1) */
  corrections?: CorrectionOverlay;
}

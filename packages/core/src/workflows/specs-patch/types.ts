/**
 * Specs patch workflow input types
 */

import type { CorrectionOverlay } from '../types.js';

/**
 * Input for specs-patch workflow analyze operation
 */
export interface SpecsPatchAnalyzeInput {
  /** Input PDF path */
  inputPdfPath: string;
  /** Optional: custom section ID pattern */
  customSectionPattern?: string;
  /** Options */
  options?: {
    verbose?: boolean;
    jsonOutputDir?: string; // Directory for AST JSON output
  };
}

/**
 * Input for specs-patch workflow execute operation
 */
export interface SpecsPatchExecuteInput {
  /** Input PDF path */
  inputPdfPath: string;
  /** Output PDF path */
  outputPdfPath: string;
  /** Patch file path (JSON) */
  patchPath?: string;
  /** Inline patch (alternative to patchPath) */
  patch?: unknown; // Will be SpecPatch once types are defined
  /** Options */
  options?: {
    verbose?: boolean;
    reportPath?: string; // Path for audit trail JSON
    jsonOutputPath?: string; // Path for AST JSON output
  };
  /** Optional: corrected inventory from applyCorrections */
  analyzed?: {
    ast?: unknown; // Will be SpecDoc once types are defined
  };
  /** Corrections overlay (contains patches) */
  corrections?: CorrectionOverlay;
}

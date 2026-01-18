/**
 * Merge workflow implementation
 * 
 * Wraps existing mergeAddenda/planner logic into the workflow engine.
 */

import type {
  InventoryResult,
  ExecuteResult,
  CorrectionOverlay,
  InventoryRowBase,
} from '../types.js';
import type { WorkflowImpl } from '../engine.js';
import type { MergeAnalyzeInput, MergeExecuteInput } from './types.js';
import type { ConsetDocType, MergeAddendaOptions, MergeReport } from '../../index.js';
import { planMerge } from '../../core/planner.js';
import { mergeAddenda } from '../../core/mergeAddenda.js';
import {
  mapParseInventoryToInventoryRows,
  mapMergePlanToSummary,
  mapMergeReportWarningsToIssues,
  mapUnmatchedToIssuesOrConflicts,
} from '../mappers/merge.js';
import {
  RoiSheetLocator,
  LegacyTitleblockLocator,
  CompositeLocator,
  SpecsSectionLocator,
} from '../../index.js';
import type { SheetLocator } from '../../locators/sheetLocator.js';
import {
  extractNarrativeTextFromPdf,
  parseNarrativeAlgorithmic,
  validateNarrativeAgainstInventory,
  type NarrativeInstructionSet,
} from '../../narrative/index.js';
import { fileExists } from '../../utils/fs.js';

/**
 * Create a locator based on docType and profile
 */
function createLocator(
  docType: ConsetDocType,
  profile: MergeAnalyzeInput['profile'],
  originalPdfPath: string
): SheetLocator {
  if (docType === 'specs') {
    return new SpecsSectionLocator();
  }

  // Drawings type
  const legacyLocator = new LegacyTitleblockLocator(originalPdfPath);

  if (profile) {
    const roiLocator = new RoiSheetLocator(profile);
    return new CompositeLocator(roiLocator, legacyLocator);
  }

  return legacyLocator;
}

/**
 * Merge workflow implementation
 */
export const mergeWorkflowImpl: WorkflowImpl<
  MergeAnalyzeInput,
  MergeAnalyzeInput,
  MergeExecuteInput
> = {
  /**
   * Analyze merge input and produce inventory result
   * Must NOT write output files - this is a dry-run operation
   */
  async analyze(input: MergeAnalyzeInput): Promise<InventoryResult> {
    const {
      docType,
      originalPdfPath,
      addendumPdfPaths,
      profile,
      options = {},
      narrativePdfPath,
    } = input;

    // Create locator
    const locator = createLocator(docType, profile, originalPdfPath);

    // Build merge options for planning (force dryRun, no file writes)
    const mode = options.mode || 'replace+insert';
    const strict = options.strict || false;
    const verbose = options.verbose || false;

    // Plan the merge with inventory included
    const planWithInventory = await planMerge(
      originalPdfPath,
      addendumPdfPaths,
      docType,
      mode,
      strict,
      locator,
      verbose,
      false, // writeInventory = false (don't write files in analyze)
      options.inventoryOutputDir,
      true // includeInventory = true (needed for workflow analyze)
    );

    // Extract plan and inventory
    // TypeScript: planMerge returns MergePlan | (MergePlan & { inventory })
    const plan = planWithInventory;
    const parseInventory = 'inventory' in planWithInventory ? planWithInventory.inventory || [] : [];

    // Map to workflow types using actual detection inventory
    // Pass PDF paths to create stable UIDs
    const allPdfPaths = [originalPdfPath, ...addendumPdfPaths];
    const rows = mapParseInventoryToInventoryRows(parseInventory, allPdfPaths, docType);
    const summary = mapMergePlanToSummary(plan);

    // Map warnings to issues
    const warningIssues = mapMergeReportWarningsToIssues(plan.parseWarnings);
    const unmatchedIssues = mapUnmatchedToIssuesOrConflicts(plan.unmatched);
    const issues = [...warningIssues, ...unmatchedIssues];

    // Process narrative if provided (advisory only, read-only)
    let narrative: NarrativeInstructionSet | undefined;
    let narrativeValidation;
    if (narrativePdfPath) {
      try {
        // Verify narrative file exists
        if (await fileExists(narrativePdfPath)) {
          // Extract and parse narrative
          const narrativeDoc = await extractNarrativeTextFromPdf(narrativePdfPath);
          narrative = parseNarrativeAlgorithmic(narrativeDoc);
          
          if (verbose) {
            console.log(`[Narrative] Extracted ${narrative.drawings.length} drawing instructions and ${narrative.specs.length} spec instructions`);
          }

          // Validate narrative against inventory
          // Build inventory result for validation (temporary structure)
          const inventoryForValidation: InventoryResult = {
            workflowId: 'merge',
            rows,
            issues,
            conflicts: [],
            summary,
            meta: {
              docType,
              originalPdfPath,
              addendumPdfPaths,
              mode,
              strict,
            },
          };

          narrativeValidation = validateNarrativeAgainstInventory(
            narrative,
            inventoryForValidation
          );

          if (verbose) {
            console.log(`[Narrative] Validation found ${narrativeValidation.issues.length} issue(s)`);
          }
        } else if (verbose) {
          console.warn(`[Narrative] Narrative PDF not found: ${narrativePdfPath}`);
        }
      } catch (error: any) {
        // Narrative processing errors should not fail the analyze step
        // Log but continue without narrative
        if (verbose) {
          console.warn(`[Narrative] Failed to process narrative PDF: ${error?.message || error}`);
        }
      }
    }

    return {
      workflowId: 'merge',
      rows,
      issues,
      conflicts: [], // Empty in Phase 1 (narrative conflicts not implemented)
      summary,
      meta: {
        docType,
        originalPdfPath,
        addendumPdfPaths,
        mode,
        strict,
      },
      narrative,
      narrativeValidation,
    };
  },

  /**
   * Apply corrections overlay to inventory
   * Re-runs analyze() and applies corrections to the result
   */
  async applyCorrections(
    input: MergeAnalyzeInput,
    _inventory: InventoryResult,
    corrections: CorrectionOverlay
  ): Promise<InventoryResult> {
    // Start with fresh analysis (re-run analyze to get clean state)
    const freshInventory = await this.analyze(input);
    
    // Apply corrections
    const ignoredRowIds = corrections.ignoredRowIds || [];
    const overrides = corrections.overrides || {};
    
    // Apply corrections to rows: keep ignored rows but mark them, apply overrides
    const correctedRows = freshInventory.rows.map(row => {
      const isIgnored = ignoredRowIds.includes(row.id);
      const override = overrides[row.id];
      
      // Create a new row object (preserve stable id, update normalizedId if present)
      const correctedRow: InventoryRowBase & { normalizedId?: string } = { ...row };
      
      // Mark ignored rows: set status to 'ok' and add to tags for identification
      if (isIgnored) {
        correctedRow.status = 'ok';
        correctedRow.tags = [...(row.tags || []), 'ignored'];
      }
      
      // Apply normalizedId override: update normalizedId field (not the stable id)
      // The stable id (row.id) remains unchanged to track which row was overridden
      if (override?.fields?.normalizedId !== undefined) {
        (correctedRow as any).normalizedId = String(override.fields.normalizedId);
      } else if (override?.fields?.sheetId !== undefined) {
        (correctedRow as any).normalizedId = String(override.fields.sheetId);
      }
      
      // Ensure normalizedId exists (if not overridden, preserve original)
      if (!(correctedRow as any).normalizedId && (row as any).normalizedId) {
        (correctedRow as any).normalizedId = (row as any).normalizedId;
      }
      
      return correctedRow;
    });
    
    // Recalculate summary: exclude ignored rows from counts
    const activeRows = correctedRows.filter(r => !ignoredRowIds.includes(r.id));
    const rowsOk = activeRows.filter(r => r.status === 'ok').length;
    const rowsWarning = activeRows.filter(r => r.status === 'warning').length;
    const rowsError = activeRows.filter(r => r.status === 'error').length;
    const rowsConflict = activeRows.filter(r => r.status === 'conflict').length;
    const rowsWithIds = activeRows.filter(r => r.id && r.id !== '').length;
    const rowsWithoutIds = activeRows.length - rowsWithIds;
    
    // Filter issues to only include those affecting non-ignored rows
    const correctedIssues = freshInventory.issues.filter(issue => {
      // Keep issue if at least one affected row is not ignored
      return issue.rowIds.some(rowId => !ignoredRowIds.includes(rowId));
    });
    
    // Recalculate conflicts similarly
    const correctedConflicts = freshInventory.conflicts.filter(conflict => {
      return conflict.rowIds.some(rowId => !ignoredRowIds.includes(rowId));
    });
    
    // Build updated summary
    const correctedSummary = {
      ...freshInventory.summary,
      totalRows: correctedRows.length,
      rowsOk,
      rowsWarning,
      rowsError,
      rowsConflict,
      rowsWithIds,
      rowsWithoutIds,
      issuesCount: correctedIssues.length,
      conflictsCount: correctedConflicts.length,
    };
    
    return {
      workflowId: freshInventory.workflowId,
      laneId: freshInventory.laneId,
      rows: correctedRows,
      issues: correctedIssues,
      conflicts: correctedConflicts,
      summary: correctedSummary,
      meta: freshInventory.meta,
    };
  },

  /**
   * Execute merge operation
   */
  async execute(input: MergeExecuteInput): Promise<ExecuteResult> {
    const {
      docType,
      originalPdfPath,
      addendumPdfPaths,
      outputPdfPath,
      profile,
      options = {},
      analyzed,
      corrections,
    } = input;

    // Create locator
    const locator = createLocator(docType, profile, originalPdfPath);

    // Build merge options
    const mergeOptions: MergeAddendaOptions = {
      originalPdfPath,
      addendumPdfPaths,
      outputPdfPath,
      type: docType,
      mode: options.mode || 'replace+insert',
      strict: options.strict || false,
      dryRun: false, // Always execute
      verbose: options.verbose || false,
      reportPath: options.reportPath,
      regenerateBookmarks: options.regenerateBookmarks || false,
      inventoryOutputDir: options.inventoryOutputDir,
      locator,
      patterns: options.patterns,
    };

    // Phase 1: Ignore analyzed.plan and corrections for optimization
    // (They're accepted but not used yet)
    if (analyzed?.plan) {
      // Could optimize by reusing plan, but for Phase 1 we re-analyze for correctness
    }
    if (corrections) {
      // Corrections not applied in Phase 1
    }

    // Execute merge
    const report: MergeReport = await mergeAddenda(mergeOptions);

    // Map warnings to string array for ExecuteResult
    const warnings = report.warnings || [];

    // Build outputs object
    const outputs: Record<string, string> = {
      outputPdfPath: report.outputPath || outputPdfPath,
    };
    // Add docType-specific key
    if (docType === 'drawings') {
      outputs.drawings = report.outputPath || outputPdfPath;
    } else if (docType === 'specs') {
      outputs.specs = report.outputPath || outputPdfPath;
    }

    return {
      outputs,
      summary: {
        success: true,
        replaced: report.replaced.length,
        inserted: report.inserted.length,
        unmatched: report.appendedUnmatched.length,
        finalPages: report.stats.finalPagesPlanned,
        parseTimeMs: report.stats.parseTimeMs,
        mergeTimeMs: report.stats.mergeTimeMs,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
      errors: undefined,
    };
  },
};

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
import type { SheetLocator, SheetLocationResult } from '../../locators/sheetLocator.js';
import type { PageContext } from '../../analyze/pageContext.js';
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
 * Wrapper locator that applies corrections to detected IDs
 * Maps page indexes to corrected normalized IDs
 * 
 * Phase 2 Feature: When user accepts narrative-generated suggestions or manually
 * corrects IDs, the merge operation uses the corrected IDs instead of detected ones.
 * This allows the narrative PDF to guide the merge logic directly.
 */
class CorrectionApplyingLocator implements SheetLocator {
  private innerLocator: SheetLocator;
  private currentDocIndex: number = 0;
  private lastPageIndex: number = -1;
  private correctionMap: Map<string, string>; // key: "docIndex:pageIndex" -> correctedNormalizedId
  private verbose: boolean;

  constructor(
    innerLocator: SheetLocator,
    correctionMap: Map<string, string>,
    verbose: boolean = false
  ) {
    this.innerLocator = innerLocator;
    this.correctionMap = correctionMap;
    this.verbose = verbose;
  }

  async locate(page: PageContext): Promise<SheetLocationResult> {
    const result = await this.innerLocator.locate(page);

    // Detect transition to next document: page index resets to 0 in planner loops
    if (page.pageIndex < this.lastPageIndex) {
      this.currentDocIndex += 1;
    }
    this.lastPageIndex = page.pageIndex;

    const correctionKey = `${this.currentDocIndex}:${page.pageIndex}`;

    // Check if we have a correction for this page
    const correctedId = this.correctionMap.get(correctionKey);
    if (correctedId) {
      const original = result.normalizedId || result.id;
      if (this.verbose) {
        console.log(
          `[Corrections] ${correctionKey}: Applying correction "${original}" -> "${correctedId}"`
        );
      }
      return {
        ...result,
        id: correctedId,
        normalizedId: correctedId,
      };
    }

    return result;
  }

  getName(): string {
    return `CorrectionApplying(${this.innerLocator.getName()})`;
  }
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
   * 
   * Phase 2: Now supports narrative-driven corrections
   * If corrections are provided (from narrative validation or manual fixes),
   * the merge uses corrected IDs instead of auto-detected IDs.
   * This allows the narrative PDF to directly guide the merge logic.
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

    const verbose = options.verbose || false;

    // Create base locator
    let locator = createLocator(docType, profile, originalPdfPath);

    // Apply corrections if provided
    if (corrections && Object.keys(corrections.overrides || {}).length > 0) {
      if (verbose) {
        console.log(`[Merge Execute] Applying corrections to merge operation`);
      }

      // Get analyzed inventory (either from provided plan or re-analyze)
      let correctedInventory: InventoryResult;
      
      if (analyzed?.plan) {
        // If plan is provided, we still need the inventory for corrections
        // Re-analyze to get the inventory rows
        const analyzeInput: MergeAnalyzeInput = {
          docType,
          originalPdfPath,
          addendumPdfPaths,
          profile,
          options,
        };
        correctedInventory = await this.applyCorrections(
          analyzeInput,
          {} as any, // Placeholder, not used in applyCorrections
          corrections
        );
      } else {
        // No plan provided, re-analyze with corrections
        const analyzeInput: MergeAnalyzeInput = {
          docType,
          originalPdfPath,
          addendumPdfPaths,
          profile,
          options,
        };
        correctedInventory = await this.applyCorrections(
          analyzeInput,
          {} as any, // Placeholder, not used in applyCorrections
          corrections
        );
      }

      // Build correction map using planner-like ordering across docs.
      // Key format: "docIndex:pageIndex"
      const ignoredRowIds = new Set(corrections.ignoredRowIds || []);
      const pageIndexToCorrectedId = new Map<string, string>();

      let currentDocIndex = 0;
      let lastPageIndex = -1;

      correctedInventory.rows.forEach(row => {
        const page = (row.page ?? 1) - 1;
        if (page < 0) return;

        if (page < lastPageIndex) {
          currentDocIndex += 1;
        }
        lastPageIndex = page;

        if (ignoredRowIds.has(row.id)) {
          return;
        }

        const correctedId = String((row as any).normalizedId || '').trim();
        if (!correctedId) {
          return;
        }

        const stableIdParts = String(row.id || '').split(':');
        const originallyDetectedId = String(stableIdParts[stableIdParts.length - 1] || '').trim();

        // Only apply if user changed the ID from original detection
        if (originallyDetectedId && originallyDetectedId === correctedId) {
          return;
        }

        const key = `${currentDocIndex}:${page}`;
        pageIndexToCorrectedId.set(key, correctedId);
      });

      if (verbose) {
        console.log(
          `[Merge Execute] Built correction map with ${pageIndexToCorrectedId.size} page corrections`
        );
        pageIndexToCorrectedId.forEach((correctedId, key) => {
          console.log(`  ${key}: -> "${correctedId}"`);
        });
      }

      // Wrap locator with corrections
      locator = new CorrectionApplyingLocator(
        locator,
        pageIndexToCorrectedId,
        verbose
      );
    }

    // Build merge options
    const mergeOptions: MergeAddendaOptions = {
      originalPdfPath,
      addendumPdfPaths,
      outputPdfPath,
      type: docType,
      mode: options.mode || 'replace+insert',
      strict: options.strict || false,
      dryRun: false, // Always execute
      verbose: verbose,
      reportPath: options.reportPath,
      regenerateBookmarks: options.regenerateBookmarks || false,
      inventoryOutputDir: options.inventoryOutputDir,
      locator, // Use original or correction-wrapped locator
      patterns: options.patterns,
    };

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

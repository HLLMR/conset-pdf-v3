/**
 * Mapping functions for merge workflow
 * 
 * Maps existing merge structures (ParseResult, MergePlan, MergeReport) to workflow engine types.
 */

import type {
  InventoryRowBase,
  Issue,
  InventoryResult,
  RowStatus,
} from '../types.js';
import type { MergePlan } from '../../core/planner.js';
import type { ConsetDocType } from '../../index.js';
import {
  normalizeDrawingsDiscipline,
  normalizeSpecsMasterformat,
} from '../../standards/index.js';
import type {
  DrawingsDisciplineMeta,
  SpecsMasterformatMeta,
} from '../../standards/types.js';
// MergeReport import reserved for future use when mapping execute results

/**
 * ParseResult inventory item type (from planner.ts)
 */
type ParseInventoryItem = {
  pageIndex: number;
  sheetId?: string;
  normalizedId?: string;
  title?: string;
  confidence?: number;
  source?: string;
  context?: string;
  warning?: string;
};

/**
 * Map ParseResult inventory to InventoryRowBase[]
 * 
 * @param parseInventory - Inventory array from ParseResult
 * @param pdfPaths - Optional array of PDF paths [originalPath, ...addendumPaths] to create stable UIDs
 * @param docType - Document type ('drawings' or 'specs') - used for discipline normalization
 * @returns Array of InventoryRowBase rows
 */
export function mapParseInventoryToInventoryRows(
  parseInventory: ParseInventoryItem[],
  pdfPaths?: string[],
  docType?: ConsetDocType
): InventoryRowBase[] {
  // Helper to get a short identifier from PDF path
  const getPdfId = (index: number): string => {
    if (!pdfPaths || index < 0 || index >= pdfPaths.length) {
      return `pdf${index}`;
    }
    const path = pdfPaths[index];
    // Use basename or a hash-like identifier
    try {
      const pathParts = path.split(/[\\/]/);
      const basename = pathParts[pathParts.length - 1] || path;
      return basename.replace(/\.pdf$/i, '').substring(0, 20) || `pdf${index}`;
    } catch {
      return `pdf${index}`;
    }
  };

  // Track which PDF each inventory item came from (infer from order: original first, then addenda)
  // This is approximate but works for stable UID generation
  let currentPdfIndex = 0;
  let lastPageIndex = -1;

  return parseInventory.map((item, arrayIndex) => {
    // Determine status based on presence of ID and warnings
    let status: RowStatus = 'ok';
    if (!item.normalizedId && !item.sheetId) {
      status = 'error'; // No ID found
    } else if (item.warning) {
      status = 'warning';
    } else if (item.normalizedId || item.sheetId) {
      status = 'ok';
    }

    // Infer PDF source: if pageIndex resets to 0, we're likely in a new PDF
    // This is approximate but sufficient for UID stability
    if (item.pageIndex < lastPageIndex && arrayIndex > 0) {
      currentPdfIndex++;
    }
    lastPageIndex = item.pageIndex;
    const pdfId = getPdfId(currentPdfIndex);

    // Create stable UID: ${source}:${pageIndex}:${(sheetId||normalizedId||'')}
    // Enhance source to include PDF identifier for uniqueness: ${pdfId}-${detectionSource}
    // This ensures the ID doesn't change when normalizedId is overridden
    const detectionSource = item.source || 'unknown';
    const enhancedSource = `${pdfId}-${detectionSource}`;
    const idPart = item.sheetId || item.normalizedId || '';
    const stableId = `${enhancedSource}:${item.pageIndex}:${idPart}`;

    // Store detected normalizedId separately (extend base type)
    const normalizedId = item.normalizedId || item.sheetId || undefined;

    const row: InventoryRowBase & {
      normalizedId?: string;
      discipline?: DrawingsDisciplineMeta;
      specs?: SpecsMasterformatMeta;
    } = {
      id: stableId,
      page: item.pageIndex + 1, // Convert 0-based to 1-based for display
      status,
      confidence: item.confidence ?? 0,
      source: item.source,
      notes: item.warning || item.context,
      tags: item.source ? [item.source] : undefined,
      // Extend with normalizedId (not in base type, but used by merge workflow)
      ...(normalizedId ? { normalizedId } : {}),
    };

    // Add discipline metadata for drawings docType only
    if (docType === 'drawings') {
      row.discipline = normalizeDrawingsDiscipline({
        normalizedId: row.normalizedId ?? null,
        title: item.title ?? item.context ?? null,
      });
    }

    // Add specs metadata for specs docType only
    if (docType === 'specs') {
      row.specs = normalizeSpecsMasterformat({
        normalizedId: row.normalizedId ?? null,
      });
    }

    return row;
  });
}

/**
 * Map MergePlan to InventoryResult summary
 * 
 * @param mergePlan - Merge plan from planner
 * @returns Summary object for InventoryResult
 */
export function mapMergePlanToSummary(mergePlan: MergePlan): InventoryResult['summary'] {
  const totalRows = mergePlan.pages.length;
  const rowsWithIds = mergePlan.pages.filter((p) => p.id !== undefined).length;
  const rowsWithoutIds = totalRows - rowsWithIds;

  // Count rows by status (simplified - based on plan structure)
  // In a full implementation, we'd need to cross-reference with inventory
  const rowsOk = rowsWithIds;
  const rowsWarning = mergePlan.parseWarnings.length;
  const rowsError = mergePlan.unmatched.length;
  const rowsConflict = 0; // Conflicts not yet implemented

  return {
    totalRows,
    rowsWithIds,
    rowsWithoutIds,
    rowsOk,
    rowsWarning,
    rowsError,
    rowsConflict,
    issuesCount: mergePlan.parseWarnings.length,
    conflictsCount: 0,
    // Merge-specific summary fields
    replaced: mergePlan.replaced.length,
    inserted: mergePlan.inserted.length,
    unmatched: mergePlan.unmatched.length,
  };
}

/**
 * Map MergeReport warnings to Issue[]
 * 
 * @param warnings - Warnings array from MergeReport
 * @returns Array of Issue objects
 */
export function mapMergeReportWarningsToIssues(warnings: string[]): Issue[] {
  return warnings.map((warning, index) => {
    // Determine severity based on warning content
    let severity: Issue['severity'] = 'warning';
    if (warning.toLowerCase().includes('error') || warning.toLowerCase().includes('failed')) {
      severity = 'error';
    } else if (warning.toLowerCase().includes('notice') || warning.toLowerCase().includes('info')) {
      severity = 'info';
    }

    // Extract issue code from warning message (heuristic)
    let code = 'UNKNOWN';
    if (warning.includes('No sheet ID found') || warning.includes('No section ID found')) {
      code = 'NO_ID';
    } else if (warning.includes('confidence') || warning.includes('threshold')) {
      code = 'LOW_CONFIDENCE';
    } else if (warning.includes('duplicate')) {
      code = 'DUPLICATE';
    } else if (warning.includes('unmatched')) {
      code = 'UNMATCHED';
    } else if (warning.includes('ROI')) {
      code = 'ROI_DETECTION_FAILURE';
    } else if (warning.includes('fallback')) {
      code = 'LEGACY_FALLBACK';
    }

    return {
      id: `issue-${index}`,
      severity,
      code,
      message: warning,
      rowIds: [], // Will be populated if we can extract row IDs from warning
    };
  });
}

/**
 * Map MergePlan unmatched items to Issue[]
 * 
 * @param unmatched - Unmatched array from MergePlan
 * @returns Array of Issue objects
 */
export function mapUnmatchedToIssuesOrConflicts(
  unmatched: MergePlan['unmatched']
): Issue[] {
  return unmatched.map((item, index) => {
    const reason = item.reason;
    let severity: Issue['severity'] = 'warning';
    let code = 'UNMATCHED';

    if (reason === 'no-id') {
      code = 'NO_ID';
      severity = 'error';
    } else if (reason === 'ambiguous') {
      code = 'AMBIGUOUS';
      severity = 'warning';
    } else if (reason === 'unmatched') {
      code = 'UNMATCHED';
      severity = 'warning';
    }

    const pageList = item.pageIndexes.map((idx) => `page-${idx}`).join(', ');

    return {
      id: `unmatched-${index}`,
      severity,
      code,
      message: `Unmatched pages in ${item.addendumSource}: ${item.pageIndexes.length} page(s) (${reason}) - ${pageList}`,
      rowIds: item.pageIndexes.map((idx) => `page-${idx}`),
      details: {
        reason,
        addendumSource: item.addendumSource,
        pageIndexes: item.pageIndexes,
      },
    };
  });
}

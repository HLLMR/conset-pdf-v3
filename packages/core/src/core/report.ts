import type { MergePlan } from './planner.js';
import type { MergeReport, ConsetDocType } from '../index.js';
import type { DocumentContext } from '../analyze/documentContext.js';

/**
 * Generate a merge report from a plan and timing information
 */
export async function generateMergeReport(
  plan: MergePlan,
  originalPath: string,
  addendumPaths: string[],
  outputPath: string | undefined,
  type: ConsetDocType,
  parseTimeMs: number,
  mergeTimeMs: number,
  originalDocContext?: DocumentContext
): Promise<MergeReport> {
  // Use DocumentContext if provided (single-load), otherwise fall back to legacy
  let originalPages: number;
  if (originalDocContext) {
    originalPages = originalDocContext.pageCount;
  } else {
    // Legacy fallback - only used if DocumentContext not provided
    const { getPdfPageCount } = await import('../utils/pdf.js');
    originalPages = await getPdfPageCount(originalPath);
  }
  const finalPagesPlanned = plan.pages.length;

  const warnings: string[] = [];

  // Add parse warnings
  warnings.push(...plan.parseWarnings);

  // Analyze warnings for legacy fallback usage
  const legacyFallbackWarnings = plan.parseWarnings.filter(w => 
    w.includes('fallback') || w.includes('composite-fallback')
  );
  
  if (legacyFallbackWarnings.length > 0) {
    const fallbackCount = legacyFallbackWarnings.length;
    warnings.push(
      `Legacy fallback used on ${fallbackCount} page(s). ROI detection failed and legacy method was used as backup.`
    );
  }

  // Check for ROI-specific failures
  const roiFailureWarnings = plan.parseWarnings.filter(w =>
    w.includes('ROI_EMPTY') || w.includes('ROI_LOW_TEXT_DENSITY') || 
    w.includes('ROI_NO_PATTERN_MATCH') || w.includes('ROI_PREFIX_REJECTED')
  );
  
  if (roiFailureWarnings.length > 0) {
    const failureCount = roiFailureWarnings.length;
    warnings.push(
      `ROI detection failures on ${failureCount} page(s). Consider reviewing layout profile configuration.`
    );
  }

  // Check for unmatched pages
  if (plan.unmatched.length > 0) {
    const unmatchedCount = plan.unmatched.reduce(
      (sum, u) => sum + u.pageIndexes.length,
      0
    );
    warnings.push(
      `Found ${unmatchedCount} unmatched pages across ${plan.unmatched.length} addenda`
    );
  }

  // Check for ambiguous cases (multiple IDs on same page, etc.)
  // This would be detected during parsing, but for v1 we'll keep it simple

  return {
    kind: type,
    originalPath,
    addendumPaths,
    outputPath,
    replaced: plan.replaced,
    inserted: plan.inserted,
    appendedUnmatched: plan.unmatched,
    warnings,
    stats: {
      originalPages,
      finalPagesPlanned,
      parseTimeMs,
      mergeTimeMs,
    },
  };
}

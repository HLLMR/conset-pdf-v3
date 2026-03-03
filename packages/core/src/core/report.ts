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
  const notices: string[] = [];

  // Separate notices from warnings (page 1-2 ROI failures are expected for cover sheets)
  if (plan.parseNotices && plan.parseNotices.length > 0) {
    notices.push(...plan.parseNotices);
  }

  // Filter out cover page ROI failures from warnings and convert to notices
  const coverPageRoiWarnings: string[] = [];
  const realWarnings: string[] = [];
  
  for (const warning of plan.parseWarnings) {
    // Check if this is a page 1 or 2 ROI failure
    const pageMatch = warning.match(/^Page (\d+):/);
    const pageNum = pageMatch ? parseInt(pageMatch[1]) : null;
    const isROIFailure = warning.includes('ROI') && (
      warning.includes('ROI_EMPTY') || 
      warning.includes('ROI detection failed') ||
      warning.includes('composite-fallback')
    );
    
    if (pageNum && (pageNum === 1 || pageNum === 2) && isROIFailure) {
      // This is an expected cover page ROI failure - convert to notice
      const noticeMsg = warning.replace(
        /ROI detection failed[^.]*\./,
        'ROI detection not applicable (cover page)'
      );
      coverPageRoiWarnings.push(noticeMsg);
    } else {
      realWarnings.push(warning);
    }
  }
  
  // Add cover page ROI notices
  if (coverPageRoiWarnings.length > 0) {
    notices.push(`Cover page(s) detected (no sheet ID required): ${coverPageRoiWarnings.length} page(s) without ROI signature`);
  }
  
  // Add remaining parse warnings
  warnings.push(...realWarnings);

  // Analyze warnings for legacy fallback usage (only non-cover-page fallbacks)
  const legacyFallbackWarnings = realWarnings.filter(w => 
    w.includes('fallback') || w.includes('composite-fallback')
  );
  
  if (legacyFallbackWarnings.length > 0) {
    const fallbackCount = legacyFallbackWarnings.length;
    warnings.push(
      `Legacy fallback used on ${fallbackCount} page(s). Consider reviewing layout profile configuration.`
    );
  }

  // Check for ROI-specific failures (excluding cover pages)
  const roiFailureWarnings = realWarnings.filter(w =>
    w.includes('ROI_EMPTY') || w.includes('ROI_LOW_TEXT_DENSITY') || 
    w.includes('ROI_NO_PATTERN_MATCH') || w.includes('ROI_PREFIX_REJECTED')
  );
  
  if (roiFailureWarnings.length > 0) {
    const failureCount = roiFailureWarnings.length;
    warnings.push(
      `ROI detection issues on ${failureCount} page(s). Consider reviewing layout profile configuration.`
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
    notices: notices.length > 0 ? notices : undefined,
    stats: {
      originalPages,
      finalPagesPlanned,
      parseTimeMs,
      mergeTimeMs,
    },
    // Include diagnostic data if available
    _diagnostics: (plan as any)._diagnostics,
  } as any;
}

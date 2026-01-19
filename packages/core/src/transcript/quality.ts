/**
 * Quality scoring module
 * 
 * Provides quality metrics and validation for layout transcripts.
 * Includes per-page and aggregate quality scoring with quality gates.
 */

import type { LayoutTranscript, LayoutPage, QualityMetrics } from './types.js';

/**
 * Quality report for a transcript
 */
export interface QualityReport {
  /** Overall quality score (0.0-1.0) */
  overallScore: number;
  /** Per-page quality metrics */
  pageMetrics: Array<{
    pageIndex: number;
    metrics: QualityMetrics;
  }>;
  /** Aggregate metrics across all pages */
  aggregate: QualityMetrics;
  /** Quality gate results */
  gates: {
    /** Minimum char count per page: 50 */
    minCharCount: boolean;
    /** Maximum replacement char ratio: 0.05 */
    maxReplacementRatio: boolean;
    /** Minimum ordering sanity: 0.80 */
    minOrderingSanity: boolean;
    /** Overall confidence threshold: 0.85 */
    minConfidence: boolean;
  };
  /** Whether all quality gates pass */
  passes: boolean;
  /** Issues detected */
  issues: string[];
}

/**
 * Score transcript quality
 * 
 * @param transcript Layout transcript to score
 * @returns Quality report with per-page and aggregate metrics
 */
export function scoreTranscriptQuality(
  transcript: LayoutTranscript
): QualityReport {
  const pageMetrics: Array<{ pageIndex: number; metrics: QualityMetrics }> = [];
  let totalChars = 0;
  let totalWhitespace = 0;
  let totalReplacements = 0;
  let totalOrderingScore = 0;
  let totalConfidence = 0;
  let pagesWithText = 0;
  
  // Score each page
  for (const page of transcript.pages) {
    const metrics = scorePageQuality(page);
    pageMetrics.push({
      pageIndex: page.pageIndex,
      metrics,
    });
    
    if (metrics.extractedCharCount > 0) {
      totalChars += metrics.extractedCharCount;
      totalWhitespace += metrics.extractedCharCount * metrics.whiteSpaceRatio;
      totalReplacements += metrics.replacementCharCount;
      totalOrderingScore += metrics.orderingSanityScore;
      totalConfidence += metrics.confidenceScore;
      pagesWithText++;
    }
  }
  
  // Calculate aggregate metrics
  const aggregate: QualityMetrics = {
    extractedCharCount: totalChars,
    whiteSpaceRatio: totalChars > 0 ? totalWhitespace / totalChars : 0,
    replacementCharCount: totalReplacements,
    orderingSanityScore: pagesWithText > 0 ? totalOrderingScore / pagesWithText : 0,
    estimatedOCRNeeded: totalReplacements > (totalChars * 0.05) || totalChars < 50 * transcript.pages.length,
    confidenceScore: pagesWithText > 0 ? totalConfidence / pagesWithText : 0,
  };
  
  // Check quality gates
  const gates = {
    minCharCount: checkMinCharCount(pageMetrics),
    maxReplacementRatio: checkMaxReplacementRatio(aggregate),
    minOrderingSanity: aggregate.orderingSanityScore >= 0.80,
    minConfidence: aggregate.confidenceScore >= 0.85,
  };
  
  const passes = Object.values(gates).every(gate => gate);
  
  // Collect issues
  const issues: string[] = [];
  if (!gates.minCharCount) {
    issues.push('Some pages have fewer than 50 characters');
  }
  if (!gates.maxReplacementRatio) {
    issues.push(`Replacement character ratio (${(aggregate.replacementCharCount / aggregate.extractedCharCount).toFixed(3)}) exceeds 0.05`);
  }
  if (!gates.minOrderingSanity) {
    issues.push(`Ordering sanity score (${aggregate.orderingSanityScore.toFixed(2)}) is below 0.80`);
  }
  if (!gates.minConfidence) {
    issues.push(`Confidence score (${aggregate.confidenceScore.toFixed(2)}) is below 0.85`);
  }
  if (aggregate.estimatedOCRNeeded) {
    issues.push('OCR may be needed (high replacement character ratio or low character count)');
  }
  
  return {
    overallScore: aggregate.confidenceScore,
    pageMetrics,
    aggregate,
    gates,
    passes,
    issues,
  };
}

/**
 * Score quality for a single page
 */
function scorePageQuality(page: LayoutPage): QualityMetrics {
  const spans = page.spans;
  const totalChars = spans.reduce((sum, span) => sum + span.text.length, 0);
  
  if (totalChars === 0) {
    return {
      extractedCharCount: 0,
      whiteSpaceRatio: 0.0,
      replacementCharCount: 0,
      orderingSanityScore: 0.0,
      estimatedOCRNeeded: true,
      confidenceScore: 0.0,
    };
  }
  
  // Count whitespace and replacement characters
  let whitespaceCount = 0;
  let replacementCount = 0;
  
  for (const span of spans) {
    for (const char of span.text) {
      if (char === '\ufffd') {
        replacementCount++;
      } else if (/\s/.test(char)) {
        whitespaceCount++;
      }
    }
  }
  
  const whiteSpaceRatio = whitespaceCount / totalChars;
  const replacementRatio = replacementCount / totalChars;
  
  // Calculate ordering sanity score
  // Check if spans are roughly in reading order (top-to-bottom, left-to-right)
  const orderingScore = calculateOrderingSanity(spans);
  
  // Estimate if OCR is needed
  const estimatedOCRNeeded = replacementRatio > 0.05 || totalChars < 50;
  
  // Calculate confidence score
  let confidence = 1.0;
  
  if (estimatedOCRNeeded) {
    confidence *= 0.5;
  }
  
  if (whiteSpaceRatio > 0.5) {
    confidence *= 0.8;
  }
  
  if (replacementCount > 0) {
    confidence *= Math.max(0.5, 1.0 - replacementRatio);
  }
  
  if (orderingScore < 0.80) {
    confidence *= 0.9;
  }
  
  return {
    extractedCharCount: totalChars,
    whiteSpaceRatio,
    replacementCharCount: replacementCount,
    orderingSanityScore: orderingScore,
    estimatedOCRNeeded,
    confidenceScore: Math.max(0.0, Math.min(1.0, confidence)),
  };
}

/**
 * Calculate ordering sanity score
 * 
 * Measures how well spans are ordered in reading order (top-to-bottom, left-to-right).
 * Returns a score between 0.0 and 1.0.
 */
function calculateOrderingSanity(spans: Array<{ spanId: string; bbox: [number, number, number, number] }>): number {
  if (spans.length <= 1) {
    return 1.0;
  }
  
  // Sort spans by position (top-to-bottom, left-to-right)
  const sorted = [...spans].sort((a, b) => {
    const [ax0, ay0] = a.bbox;
    const [bx0, by0] = b.bbox;
    
    // Primary: Y coordinate (top to bottom)
    const yDiff = ay0 - by0;
    if (Math.abs(yDiff) > 5) {
      return yDiff;
    }
    
    // Secondary: X coordinate (left to right)
    return ax0 - bx0;
  });
  
  // Count how many spans are already in correct order
  let correctOrder = 0;
  for (let i = 0; i < spans.length; i++) {
    const original = spans[i];
    const sortedIndex = sorted.findIndex(s => s.spanId === original.spanId);
    
    // Allow some tolerance (spans can be slightly out of order)
    if (Math.abs(i - sortedIndex) <= 2) {
      correctOrder++;
    }
  }
  
  return correctOrder / spans.length;
}

/**
 * Check minimum character count gate (50 chars per page)
 */
function checkMinCharCount(
  pageMetrics: Array<{ pageIndex: number; metrics: QualityMetrics }>
): boolean {
  return pageMetrics.every(pm => pm.metrics.extractedCharCount >= 50);
}

/**
 * Check maximum replacement character ratio gate (0.05)
 */
function checkMaxReplacementRatio(aggregate: QualityMetrics): boolean {
  if (aggregate.extractedCharCount === 0) {
    return false;
  }
  const ratio = aggregate.replacementCharCount / aggregate.extractedCharCount;
  return ratio <= 0.05;
}

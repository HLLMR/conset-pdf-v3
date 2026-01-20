/**
 * Footer validation and debugging utilities
 * 
 * Provides validation counters and debug output for footer section ID parsing.
 */

import type { LayoutTranscript, LayoutSpan } from '../transcript/types.js';
import { parseFooterSectionId } from './footerSectionIdParser.js';
import { normalizeFooterText } from './footerSectionMap.js';
import { ensureCanonicalBbox } from '../utils/bbox.js';

/**
 * Validation counters for footer parsing
 */
export interface FooterValidationCounters {
  /** Total number of footer lines built from spans */
  linesBuiltCount: number;
  /** Number of lines that matched section ID pattern */
  parseMatchCount: number;
  /** Number of tags emitted (one per page) */
  tagsEmittedCount: number;
  /** Number of tags kept after filtering (confidence >= 0.5) */
  tagsKeptAfterFilteringCount: number;
  /** Total pages in document */
  pagesTotal: number;
}

/**
 * Debug output for specific pages
 */
export interface FooterDebugOutput {
  /** Page index */
  pageIndex: number;
  /** Reconstructed footer lines (normalized text) */
  footerLines: string[];
  /** Parsed section ID from each line (or null) */
  parsedSectionIds: Array<string | null>;
  /** Final section ID used for this page (or null) */
  finalSectionId: string | null;
}

/**
 * Footer validation result
 */
export interface FooterValidationResult {
  /** Validation counters */
  counters: FooterValidationCounters;
  /** Debug output for pages 0, 50, 100 (if they exist) */
  debugPages: FooterDebugOutput[];
}

/**
 * Reconstruct footer lines from spans
 * 
 * Groups spans in footer band into lines by Y coordinate, sorts by X,
 * and normalizes text.
 */
function reconstructFooterLines(
  spans: LayoutSpan[],
  _pageIndex: number,
  pageHeight: number,
  footerBand: { yMin: number; yMax: number }
): string[] {
  // Filter spans in footer band (using canonical bbox)
  const bandYMin = footerBand.yMin * pageHeight;
  const bandYMax = footerBand.yMax * pageHeight;
  
  const footerSpans = spans.filter(span => {
    const canonicalBbox = ensureCanonicalBbox(span.bbox, pageHeight);
    const [, y0, , y1] = canonicalBbox;
    const spanCenterY = (y0 + y1) / 2;
    return spanCenterY >= bandYMin && spanCenterY <= bandYMax;
  });
  
  if (footerSpans.length === 0) {
    return [];
  }
  
  // Group spans into lines by Y coordinate
  const lineThreshold = 4; // Points - spans within this Y distance are on same line
  const lines: LayoutSpan[][] = [];
  
  // Sort spans by Y (top to bottom), then X (left to right)
  const sortedSpans = [...footerSpans].sort((a, b) => {
    const bboxA = ensureCanonicalBbox(a.bbox, pageHeight);
    const bboxB = ensureCanonicalBbox(b.bbox, pageHeight);
    const [, y0a] = bboxA;
    const [, y0b] = bboxB;
    const yDiff = y0a - y0b;
    if (Math.abs(yDiff) > lineThreshold) {
      return yDiff;
    }
    return bboxA[0] - bboxB[0];
  });
  
  for (const span of sortedSpans) {
    let foundLine = false;
    const spanBbox = ensureCanonicalBbox(span.bbox, pageHeight);
    for (const line of lines) {
      if (line.length > 0) {
        const lineBbox = ensureCanonicalBbox(line[0].bbox, pageHeight);
        const [, y0] = lineBbox;
        const [, spanY0] = spanBbox;
        if (Math.abs(y0 - spanY0) <= lineThreshold) {
          line.push(span);
          foundLine = true;
          break;
        }
      }
    }
    if (!foundLine) {
      lines.push([span]);
    }
  }
  
  // Sort lines by Y (top to bottom)
  lines.sort((a, b) => {
    const bboxA = ensureCanonicalBbox(a[0].bbox, pageHeight);
    const bboxB = ensureCanonicalBbox(b[0].bbox, pageHeight);
    const [, y0a] = bboxA;
    const [, y0b] = bboxB;
    return y0a - y0b;
  });
  
  // Convert to normalized text lines
  const footerLines: string[] = [];
  for (const lineSpans of lines) {
    // Sort spans in line by X (left to right)
    lineSpans.sort((a, b) => {
      const bboxA = ensureCanonicalBbox(a.bbox, pageHeight);
      const bboxB = ensureCanonicalBbox(b.bbox, pageHeight);
      return bboxA[0] - bboxB[0];
    });
    
    // Join text and normalize
    const text = lineSpans.map(s => s.text).join(' ');
    const normalized = normalizeFooterText(text);
    if (normalized.trim()) {
      footerLines.push(normalized);
    }
  }
  
  return footerLines;
}

/**
 * Validate footer parsing with counters and debug output
 * 
 * @param transcript - Layout transcript with spans
 * @param footerBand - Footer band definition (normalized 0-1)
 * @param debugPageIndices - Page indices to include in debug output (default: [0, 50, 100])
 * @returns Validation result with counters and debug output
 */
export function validateFooterParsing(
  transcript: LayoutTranscript,
  footerBand: { yMin: number; yMax: number } = { yMin: 0.92, yMax: 0.98 },
  debugPageIndices: number[] = [0, 50, 100]
): FooterValidationResult {
  const counters: FooterValidationCounters = {
    linesBuiltCount: 0,
    parseMatchCount: 0,
    tagsEmittedCount: 0,
    tagsKeptAfterFilteringCount: 0,
    pagesTotal: transcript.pages.length,
  };
  
  const debugPages: FooterDebugOutput[] = [];
  const debugPageSet = new Set(debugPageIndices);
  
  // Process each page
  for (const page of transcript.pages) {
    // Reconstruct footer lines
    const footerLines = reconstructFooterLines(
      page.spans,
      page.pageIndex,
      page.height,
      footerBand
    );
    
    counters.linesBuiltCount += footerLines.length;
    
    // Parse section ID from each line
    const parsedSectionIds: Array<string | null> = [];
    let finalSectionId: string | null = null;
    
    for (const line of footerLines) {
      const sectionId = parseFooterSectionId(line);
      parsedSectionIds.push(sectionId);
      
      if (sectionId) {
        counters.parseMatchCount++;
        // Use first match as final section ID
        if (!finalSectionId) {
          finalSectionId = sectionId;
        }
      }
    }
    
    // Emit tag (one per page)
    counters.tagsEmittedCount++;
    
    // Keep tag if we found a section ID (confidence >= 0.5 equivalent)
    if (finalSectionId) {
      counters.tagsKeptAfterFilteringCount++;
    }
    
    // Collect debug output for specific pages
    if (debugPageSet.has(page.pageIndex)) {
      debugPages.push({
        pageIndex: page.pageIndex,
        footerLines,
        parsedSectionIds,
        finalSectionId,
      });
    }
  }
  
  // Sort debug pages by page index
  debugPages.sort((a, b) => a.pageIndex - b.pageIndex);
  
  return {
    counters,
    debugPages,
  };
}

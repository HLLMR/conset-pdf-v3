/**
 * Candidate generation for deterministic pre-analysis
 * 
 * Detects structural elements in transcripts:
 * - Header/footer bands (Y clustering + repetition)
 * - Font-size clusters
 * - Heading candidates (regex scan)
 * - Column hints (X clustering)
 * - Schedule/table candidates (line density + grid patterns)
 */

import type { LayoutTranscript, LayoutSpan } from './types.js';
import { ensureCanonicalBbox } from '../utils/bbox.js';

/**
 * Candidate report with detected structural elements
 */
export interface CandidateReport {
  /** Header bands detected (Y coordinates with repetition) */
  headerBands: Array<{
    y: number;
    confidence: number;
    pageIndices: number[];
  }>;
  /** Footer bands detected (Y coordinates with repetition) */
  footerBands: Array<{
    y: number;
    confidence: number;
    pageIndices: number[];
  }>;
  /** Font-size clusters */
  fontSizeClusters: Array<{
    fontSize: number;
    count: number;
    spans: LayoutSpan[];
  }>;
  /** Heading candidates (regex-based) */
  headingCandidates: Array<{
    span: LayoutSpan;
    pageIndex: number;
    level: number; // Estimated heading level (1-6)
    confidence: number;
  }>;
  /** Column hints (X coordinate clusters) */
  columnHints: Array<{
    x: number;
    confidence: number;
    pageIndices: number[];
  }>;
  /** Schedule/table candidates */
  tableCandidates: Array<{
    pageIndex: number;
    bbox: [x0: number, y0: number, x1: number, y1: number];
    confidence: number;
    reason: string;
  }>;
}

/**
 * Options for candidate generation
 */
export interface CandidateGenerationOptions {
  /** Threshold for excluding spans that overlap header/footer bands (0.0-1.0, default 0.8) */
  chromeBandThreshold?: number;
}

/**
 * Generate candidates from transcript
 * 
 * @param transcript Layout transcript to analyze
 * @param options Optional generation options
 * @returns Candidate report with detected structural elements
 */
export function generateCandidates(
  transcript: LayoutTranscript,
  options?: CandidateGenerationOptions
): CandidateReport {
  const headerBands = detectHeaderFooterBands(transcript, 'header');
  const footerBands = detectHeaderFooterBands(transcript, 'footer');
  const fontSizeClusters = detectFontSizeClusters(transcript);
  const chromeBandThreshold = options?.chromeBandThreshold ?? 0.8;
  const headingCandidates = detectHeadingCandidates(transcript, headerBands, footerBands, chromeBandThreshold);
  const columnHints = detectColumnHints(transcript);
  const tableCandidates = detectTableCandidates(transcript);
  
  return {
    headerBands,
    footerBands,
    fontSizeClusters,
    headingCandidates,
    columnHints,
    tableCandidates,
  };
}

/**
 * Detect header/footer bands using Y clustering and repetition
 */
function detectHeaderFooterBands(
  transcript: LayoutTranscript,
  type: 'header' | 'footer'
): Array<{ y: number; confidence: number; pageIndices: number[] }> {
  const bands: Map<number, number[]> = new Map(); // y -> page indices
  
  // Collect Y coordinates from spans near top (header) or bottom (footer)
  // Ensure canonical bbox (top-left origin, y-down)
  for (const page of transcript.pages) {
    const threshold = type === 'header' ? page.height * 0.15 : page.height * 0.85;
    
    for (const span of page.spans) {
      // Ensure bbox is in canonical format (top-left origin, y-down)
      const canonicalBbox = ensureCanonicalBbox(span.bbox, page.height);
      const [, y0, , y1] = canonicalBbox;
      // For header: use top (y0), for footer: use bottom (y1)
      // In top-left origin: smaller Y = top, larger Y = bottom
      const spanY = type === 'header' ? y0 : y1;
      
      if (type === 'header' && spanY < threshold) {
        // Cluster Y coordinates (within 10 points)
        const clusterY = Math.round(spanY / 10) * 10;
        if (!bands.has(clusterY)) {
          bands.set(clusterY, []);
        }
        if (!bands.get(clusterY)!.includes(page.pageIndex)) {
          bands.get(clusterY)!.push(page.pageIndex);
        }
      } else if (type === 'footer' && spanY > threshold) {
        const clusterY = Math.round(spanY / 10) * 10;
        if (!bands.has(clusterY)) {
          bands.set(clusterY, []);
        }
        if (!bands.get(clusterY)!.includes(page.pageIndex)) {
          bands.get(clusterY)!.push(page.pageIndex);
        }
      }
    }
  }
  
  // Filter bands that appear on multiple pages (repetition)
  const result: Array<{ y: number; confidence: number; pageIndices: number[] }> = [];
  for (const [y, pageIndices] of bands.entries()) {
    if (pageIndices.length >= 2) {
      // Confidence based on repetition frequency
      const confidence = Math.min(1.0, pageIndices.length / transcript.pages.length);
      result.push({
        y,
        confidence,
        pageIndices: [...pageIndices],
      });
    }
  }
  
  // Sort by confidence (descending)
  result.sort((a, b) => b.confidence - a.confidence);
  
  return result;
}

/**
 * Detect font-size clusters
 */
function detectFontSizeClusters(
  transcript: LayoutTranscript
): Array<{ fontSize: number; count: number; spans: LayoutSpan[] }> {
  const clusters = new Map<number, LayoutSpan[]>();
  
  // Collect spans by font size (rounded to nearest 0.5)
  for (const page of transcript.pages) {
    for (const span of page.spans) {
      const roundedSize = Math.round(span.fontSize * 2) / 2;
      if (!clusters.has(roundedSize)) {
        clusters.set(roundedSize, []);
      }
      clusters.get(roundedSize)!.push(span);
    }
  }
  
  // Convert to array and sort by count (descending)
  const result = Array.from(clusters.entries())
    .map(([fontSize, spans]) => ({
      fontSize,
      count: spans.length,
      spans,
    }))
    .sort((a, b) => b.count - a.count);
  
  return result;
}

/**
 * Check if a span overlaps with header/footer bands
 */
function isInChromeBand(
  span: LayoutSpan,
  pageIndex: number,
  pageHeight: number,
  headerBands: Array<{ y: number; confidence: number; pageIndices: number[] }>,
  footerBands: Array<{ y: number; confidence: number; pageIndices: number[] }>,
  threshold: number
): boolean {
  const [, y0, , y1] = span.bbox;
  const spanCenterY = (y0 + y1) / 2;
  
  // Check header bands
  for (const band of headerBands) {
    if (band.confidence >= threshold && band.pageIndices.includes(pageIndex)) {
      // Consider header band as top 15% of page, with some tolerance
      const headerThreshold = pageHeight * 0.15;
      if (spanCenterY < headerThreshold + 20) { // 20pt tolerance
        return true;
      }
    }
  }
  
  // Check footer bands
  for (const band of footerBands) {
    if (band.confidence >= threshold && band.pageIndices.includes(pageIndex)) {
      // Consider footer band as bottom 15% of page, with some tolerance
      const footerThreshold = pageHeight * 0.85;
      if (spanCenterY > footerThreshold - 20) { // 20pt tolerance
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Detect heading candidates using regex patterns
 * Excludes spans that overlap header/footer bands and rejects SECTION matches in bottom 25% of page
 */
function detectHeadingCandidates(
  transcript: LayoutTranscript,
  headerBands: Array<{ y: number; confidence: number; pageIndices: number[] }>,
  footerBands: Array<{ y: number; confidence: number; pageIndices: number[] }>,
  chromeBandThreshold: number
): Array<{ span: LayoutSpan; pageIndex: number; level: number; confidence: number }> {
  const candidates: Array<{ span: LayoutSpan; pageIndex: number; level: number; confidence: number }> = [];
  
  // Heading patterns (common spec/drawing heading formats)
  // Updated SECTION pattern to require literal SECTION at start with strict format: ^SECTION\s+\d{2}\s+\d{2}\s+\d{2}\b
  const headingPatterns = [
    { pattern: /^SECTION\s+\d{2}\s+\d{2}\s+\d{2}\b/i, level: 1, confidence: 0.9, isSection: true },
    { pattern: /^PART\s+\d+/i, level: 1, confidence: 0.9, isSection: false },
    { pattern: /^\d+\.\d+\s+[A-Z]/, level: 2, confidence: 0.8, isSection: false }, // "2.4 TITLE"
    { pattern: /^\d+\.\d+\.\d+\s+[A-Z]/, level: 3, confidence: 0.7, isSection: false }, // "2.4.1 TITLE"
    { pattern: /^[A-Z][A-Z0-9\s]{2,}$/, level: 2, confidence: 0.6, isSection: false }, // ALL CAPS
  ];
  
  for (const page of transcript.pages) {
    // Calculate usable page height (excluding chrome bands)
    const headerThreshold = page.height * 0.15;
    const footerThreshold = page.height * 0.85;
    const usableHeight = footerThreshold - headerThreshold;
    const bottom25Threshold = headerThreshold + (usableHeight * 0.75); // Bottom 25% of usable area
    
    for (const span of page.spans) {
      const text = span.text.trim();
      
      // Check if span looks like a heading (larger font, bold, etc.)
      const isLargeFont = span.fontSize >= 12;
      const isBold = span.flags.isBold === true;
      
      if (!isLargeFont && !isBold) {
        continue;
      }
      
      // Exclude spans that overlap header/footer bands
      if (isInChromeBand(span, page.pageIndex, page.height, headerBands, footerBands, chromeBandThreshold)) {
        continue;
      }
      
      // Match against heading patterns
      for (const { pattern, level, confidence: baseConfidence, isSection } of headingPatterns) {
        if (pattern.test(text)) {
          // For SECTION patterns, apply additional validation
          if (isSection) {
            const [, y0, , y1] = span.bbox;
            const spanCenterY = (y0 + y1) / 2;
            
            // Reject if in chrome band (already checked above, but double-check)
            if (isInChromeBand(span, page.pageIndex, page.height, headerBands, footerBands, chromeBandThreshold)) {
              continue;
            }
            
            // Reject if y is in bottom 25% of page usable height
            if (spanCenterY > bottom25Threshold) {
              continue;
            }
            
            // Negative match: reject Division 01 references
            // Check if text contains "01" as a division reference (not a section)
            const division01Pattern = /\b(?:DIVISION|DIV)\s+01\b/i;
            if (division01Pattern.test(text)) {
              continue;
            }
          }
          
          // Boost confidence if bold or large font
          let confidence = baseConfidence;
          if (isBold) confidence += 0.1;
          if (span.fontSize >= 14) confidence += 0.1;
          
          candidates.push({
            span,
            pageIndex: page.pageIndex,
            level,
            confidence: Math.min(1.0, confidence),
          });
          break; // Only match first pattern
        }
      }
    }
  }
  
  return candidates;
}

/**
 * Detect column hints using X coordinate clustering
 */
function detectColumnHints(
  transcript: LayoutTranscript
): Array<{ x: number; confidence: number; pageIndices: number[] }> {
  const columns: Map<number, number[]> = new Map(); // x -> page indices
  
  // Collect X coordinates from spans (cluster within 20 points)
  for (const page of transcript.pages) {
    const xPositions = new Set<number>();
    
    for (const span of page.spans) {
      const [x0] = span.bbox;
      const clusterX = Math.round(x0 / 20) * 20;
      xPositions.add(clusterX);
    }
    
    for (const x of xPositions) {
      if (!columns.has(x)) {
        columns.set(x, []);
      }
      if (!columns.get(x)!.includes(page.pageIndex)) {
        columns.get(x)!.push(page.pageIndex);
      }
    }
  }
  
  // Filter columns that appear on multiple pages
  const result: Array<{ x: number; confidence: number; pageIndices: number[] }> = [];
  for (const [x, pageIndices] of columns.entries()) {
    if (pageIndices.length >= 2) {
      const confidence = Math.min(1.0, pageIndices.length / transcript.pages.length);
      result.push({
        x,
        confidence,
        pageIndices: [...pageIndices],
      });
    }
  }
  
  // Sort by X coordinate (left to right)
  result.sort((a, b) => a.x - b.x);
  
  return result;
}

/**
 * Detect table/schedule candidates using line density and grid patterns
 */
function detectTableCandidates(
  transcript: LayoutTranscript
): Array<{ pageIndex: number; bbox: [x0: number, y0: number, x1: number, y1: number]; confidence: number; reason: string }> {
  const candidates: Array<{ pageIndex: number; bbox: [x0: number, y0: number, x1: number, y1: number]; confidence: number; reason: string }> = [];
  
  for (const page of transcript.pages) {
    // Check for vector lines (if available)
    if (page.lines && page.lines.length > 10) {
      // High line density suggests a table
      const lineDensity = page.lines.length / (page.width * page.height / 10000);
      if (lineDensity > 0.5) {
        // Calculate bounding box of lines
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const line of page.lines) {
          minX = Math.min(minX, line.start[0], line.end[0]);
          minY = Math.min(minY, line.start[1], line.end[1]);
          maxX = Math.max(maxX, line.start[0], line.end[0]);
          maxY = Math.max(maxY, line.start[1], line.end[1]);
        }
        
        candidates.push({
          pageIndex: page.pageIndex,
          bbox: [minX, minY, maxX, maxY],
          confidence: Math.min(1.0, lineDensity),
          reason: `High line density: ${lineDensity.toFixed(2)}`,
        });
      }
    }
    
    // Check for grid-like span patterns (aligned columns/rows)
    const columnHints = detectColumnHints({ pages: [page], filePath: '', extractionEngine: '', extractionDate: '', metadata: { totalPages: 1, hasTrueTextLayer: true } });
    if (columnHints.length >= 3) {
      // Multiple columns suggest a table
      const spans = page.spans;
      if (spans.length > 20) {
        // Calculate bounding box of spans
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const span of spans) {
          const [x0, y0, x1, y1] = span.bbox;
          minX = Math.min(minX, x0);
          minY = Math.min(minY, y0);
          maxX = Math.max(maxX, x1);
          maxY = Math.max(maxY, y1);
        }
        
        candidates.push({
          pageIndex: page.pageIndex,
          bbox: [minX, minY, maxX, maxY],
          confidence: 0.7,
          reason: `Grid pattern detected: ${columnHints.length} columns, ${spans.length} spans`,
        });
      }
    }
  }
  
  return candidates;
}

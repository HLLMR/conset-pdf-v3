/**
 * Transcript canonicalization
 * 
 * Normalizes transcripts to ensure deterministic output:
 * - Normalize rotation to 0
 * - Normalize coordinate origin/direction
 * - Stable-sort spans
 * - Compute deterministic hashes (excluding extractionDate)
 */

import type { LayoutTranscript, LayoutPage, LayoutSpan } from './types.js';
import { createHash } from 'crypto';

/**
 * Canonicalize a transcript to ensure deterministic output
 * 
 * @param transcript Raw transcript from extractor
 * @returns Canonicalized transcript with normalized rotation, coordinates, and deterministic hashes
 */
export function canonicalizeTranscript(
  transcript: LayoutTranscript
): LayoutTranscript {
  // Canonicalize each page
  const canonicalizedPages = transcript.pages.map(canonicalizePage);
  
  // Compute deterministic hashes (excluding extractionDate)
  const contentHash = computeContentHash(canonicalizedPages);
  const spanHash = computeSpanHash(canonicalizedPages);
  
  return {
    ...transcript,
    pages: canonicalizedPages,
    metadata: {
      ...transcript.metadata,
      contentHash,
      spanHash,
    },
  };
}

/**
 * Canonicalize a single page
 */
function canonicalizePage(page: LayoutPage): LayoutPage {
  // Normalize rotation to 0 and transform coordinates
  const normalized = normalizeRotation(page);
  
  // Normalize coordinate origin/direction (ensure consistent top-left origin)
  const coordinateNormalized = normalizeCoordinates(normalized);
  
  // Stable-sort spans within page
  const sortedSpans = stableSortSpans(coordinateNormalized.spans);
  
  return {
    ...coordinateNormalized,
    rotation: 0, // Always 0 after normalization
    spans: sortedSpans,
  };
}

/**
 * Normalize rotation to 0 by transforming bboxes
 */
function normalizeRotation(page: LayoutPage): LayoutPage {
  if (page.rotation === 0) {
    return page;
  }
  
  const { width, height, rotation } = page;
  
  // Transform spans based on rotation
  const transformedSpans = page.spans.map(span => {
    const [x0, y0, x1, y1] = span.bbox;
    
    let newBbox: [number, number, number, number];
    
    switch (rotation) {
      case 90:
        // Rotate 90° clockwise: (x, y) -> (height - y, x)
        newBbox = [
          height - y1, // new x0
          x0,          // new y0
          height - y0, // new x1
          x1,          // new y1
        ];
        break;
      case 180:
        // Rotate 180°: (x, y) -> (width - x, height - y)
        newBbox = [
          width - x1,  // new x0
          height - y1, // new y0
          width - x0,  // new x1
          height - y0, // new y1
        ];
        break;
      case 270:
        // Rotate 270° clockwise (90° counter-clockwise): (x, y) -> (y, width - x)
        newBbox = [
          y0,          // new x0
          width - x1, // new y0
          y1,         // new x1
          width - x0, // new y1
        ];
        break;
      default:
        newBbox = span.bbox;
    }
    
    return {
      ...span,
      bbox: newBbox,
    };
  });
  
  // Swap width/height for 90° and 270° rotations
  const newWidth = (rotation === 90 || rotation === 270) ? height : width;
  const newHeight = (rotation === 90 || rotation === 270) ? width : height;
  
  return {
    ...page,
    width: newWidth,
    height: newHeight,
    spans: transformedSpans,
  };
}

/**
 * Normalize coordinates to ensure consistent top-left origin
 * 
 * Ensures:
 * - y=0 at top, y increases downward
 * - x=0 at left, x increases rightward
 */
function normalizeCoordinates(page: LayoutPage): LayoutPage {
  // Spans should already be in top-left origin format from extractor,
  // but we ensure consistency here
  const normalizedSpans = page.spans.map(span => {
    const [x0, y0, x1, y1] = span.bbox;
    
    // Ensure x0 < x1 and y0 < y1 (normalize bbox order)
    const normalizedBbox: [number, number, number, number] = [
      Math.min(x0, x1),
      Math.min(y0, y1),
      Math.max(x0, x1),
      Math.max(y0, y1),
    ];
    
    return {
      ...span,
      bbox: normalizedBbox,
    };
  });
  
  return {
    ...page,
    spans: normalizedSpans,
  };
}

/**
 * Stable-sort spans within a page
 * 
 * Sort order:
 * 1. Primary: y coordinate (top to bottom)
 * 2. Secondary: x coordinate (left to right)
 * 
 * Uses floating-point tolerance for comparison to handle rounding differences.
 */
function stableSortSpans(spans: LayoutSpan[]): LayoutSpan[] {
  const tolerance = 0.1; // Points
  
  return [...spans].sort((a, b) => {
    const [ax0, ay0] = a.bbox;
    const [bx0, by0] = b.bbox;
    
    // Compare Y coordinates with tolerance
    const yDiff = ay0 - by0;
    if (Math.abs(yDiff) > tolerance) {
      return yDiff; // Different lines: top to bottom
    }
    
    // Same line (within tolerance): compare X coordinates
    const xDiff = ax0 - bx0;
    if (Math.abs(xDiff) > tolerance) {
      return xDiff; // Same line: left to right
    }
    
    // Very close positions: maintain original order (stable sort)
    return 0;
  });
}

/**
 * Compute deterministic content hash (excludes extractionDate)
 * 
 * Hash includes:
 * - All span text
 * - All span bboxes
 * - Page dimensions
 * - Span counts
 */
function computeContentHash(pages: LayoutPage[]): string {
  const hash = createHash('sha256');
  
  for (const page of pages) {
    // Page dimensions
    hash.update(`${page.width},${page.height},${page.spans.length}`);
    
    // Span content and positions
    for (const span of page.spans) {
      hash.update(span.text);
      hash.update(`${span.bbox[0]},${span.bbox[1]},${span.bbox[2]},${span.bbox[3]}`);
      hash.update(`${span.fontName},${span.fontSize}`);
    }
  }
  
  return hash.digest('hex');
}

/**
 * Compute deterministic span structure hash (excludes extractionDate and text content)
 * 
 * Hash includes:
 * - Span counts per page
 * - Span IDs
 * - Bbox positions (structure only, not text)
 * - Font metrics
 */
function computeSpanHash(pages: LayoutPage[]): string {
  const hash = createHash('sha256');
  
  for (const page of pages) {
    // Page span count
    hash.update(`${page.pageIndex},${page.spans.length}`);
    
    // Span structure (IDs, positions, fonts)
    for (const span of page.spans) {
      hash.update(span.spanId);
      hash.update(`${span.bbox[0]},${span.bbox[1]},${span.bbox[2]},${span.bbox[3]}`);
      hash.update(`${span.fontName},${span.fontSize}`);
      hash.update(`${span.flags.isBold ? '1' : '0'},${span.flags.isItalic ? '1' : '0'},${span.flags.isFixedPitch ? '1' : '0'}`);
    }
  }
  
  return hash.digest('hex');
}

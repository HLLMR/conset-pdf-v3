/**
 * Line grouping for abstract transcripts
 * 
 * Groups spans into lines based on Y coordinate clustering.
 */

import type { AbstractSpan, AbstractLine } from './abstractTranscript.js';

const LINE_Y_THRESHOLD = 5; // Points - spans within this Y distance are on the same line

/**
 * Group spans into lines for a page
 */
export function groupSpansIntoLines(
  spans: AbstractSpan[],
  pageIndex: number,
  pageWidth: number,
  pageHeight: number
): AbstractLine[] {
  const lines: Array<{ y: number; spans: AbstractSpan[] }> = [];
  
  // Sort spans by Y (top to bottom), then X (left to right)
  const sortedSpans = [...spans].sort((a, b) => {
    const [, ay0] = a.bbox;
    const [, by0] = b.bbox;
    const yDiff = ay0 - by0;
    if (Math.abs(yDiff) > LINE_Y_THRESHOLD) {
      return yDiff;
    }
    const [ax0] = a.bbox;
    const [bx0] = b.bbox;
    return ax0 - bx0;
  });
  
  // Group spans by Y coordinate
  for (const span of sortedSpans) {
    const [, y0] = span.bbox;
    const roundedY = Math.round(y0 / LINE_Y_THRESHOLD) * LINE_Y_THRESHOLD;
    
    let foundLine = false;
    for (const line of lines) {
      if (Math.abs(line.y - roundedY) <= LINE_Y_THRESHOLD) {
        line.spans.push(span);
        foundLine = true;
        break;
      }
    }
    
    if (!foundLine) {
      lines.push({
        y: roundedY,
        spans: [span],
      });
    }
  }
  
  // Sort spans within each line by X
  for (const line of lines) {
    line.spans.sort((a, b) => {
      const [ax0] = a.bbox;
      const [bx0] = b.bbox;
      return ax0 - bx0;
    });
  }
  
  // Convert to AbstractLine format
  const abstractLines: AbstractLine[] = lines.map((line, lineIndex) => {
    // Calculate line bbox from spans
    let minX = pageWidth;
    let minY = pageHeight;
    let maxX = 0;
    let maxY = 0;
    
    for (const span of line.spans) {
      const [x0, y0, x1, y1] = span.bbox;
      minX = Math.min(minX, x0);
      minY = Math.min(minY, y0);
      maxX = Math.max(maxX, x1);
      maxY = Math.max(maxY, y1);
    }
    
    const lineId = `page${pageIndex}_line${lineIndex}`;
    
    // Assign lineId to spans
    for (const span of line.spans) {
      span.lineId = lineId;
    }
    
    return {
      lineId,
      pageIndex,
      lineBbox: [minX, minY, maxX, maxY],
      lineIndexWithinPage: lineIndex,
      readingOrderIndex: lineIndex, // Simple sequential for now
      placeholders: line.spans,
    };
  });
  
  return abstractLines;
}

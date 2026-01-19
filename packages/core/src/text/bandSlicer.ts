/**
 * ROI band slicer for text items
 * 
 * Provides deterministic slicing of text items into layout bands:
 * - header: 0.00-0.12 (top 12%)
 * - heading: 0.00-0.30 (top 30%)
 * - body: 0.12-0.88 (middle 76%)
 * - footer: 0.88-1.00 (bottom 12%)
 */

import type { TextItemWithPosition } from '../utils/pdf.js';

/**
 * Standard layout bands (normalized Y coordinates, 0 = top, 1 = bottom)
 */
export const STANDARD_BANDS = {
  header: { yMin: 0.00, yMax: 0.12 },
  heading: { yMin: 0.00, yMax: 0.30 },
  body: { yMin: 0.12, yMax: 0.88 },
  footer: { yMin: 0.88, yMax: 1.00 },
} as const;

/**
 * Slice text items into a specific band
 * 
 * @param items - Text items to filter
 * @param pageHeight - Page height in points
 * @param band - Band definition with yMin/yMax (normalized 0-1)
 * @returns Filtered items whose center Y falls within the band
 */
export function sliceBand(
  items: TextItemWithPosition[],
  pageHeight: number,
  band: { yMin: number; yMax: number }
): TextItemWithPosition[] {
  const bandYMin = band.yMin * pageHeight;
  const bandYMax = band.yMax * pageHeight;
  
  return items.filter(item => {
    const itemCenterY = item.y + item.height / 2;
    return itemCenterY >= bandYMin && itemCenterY <= bandYMax;
  });
}

/**
 * Extract footer text from a page
 * 
 * Groups items by Y proximity into lines, then joins with minimal normalization.
 * 
 * @param items - Text items (should be filtered to footer band)
 * @returns Concatenated footer text with normalized whitespace
 */
export function extractFooterText(
  items: TextItemWithPosition[]
): string {
  // Sort by reading order: top to bottom (y), then left to right (x)
  const sorted = [...items].sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) > 5) {
      return yDiff; // Different lines
    }
    return a.x - b.x; // Same line: left to right
  });
  
  // Group into lines (items with similar Y coordinates)
  const lines: string[] = [];
  let currentLine: string[] = [];
  let lastY = -1;
  const lineBreakThreshold = 5; // Points
  
  for (const item of sorted) {
    if (lastY >= 0 && Math.abs(item.y - lastY) > lineBreakThreshold) {
      // New line
      if (currentLine.length > 0) {
        lines.push(currentLine.join(' '));
        currentLine = [];
      }
    }
    currentLine.push(item.str);
    lastY = item.y;
  }
  
  // Add last line
  if (currentLine.length > 0) {
    lines.push(currentLine.join(' '));
  }
  
  // Join lines and normalize whitespace
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Get all bands for a page
 * 
 * @param items - All text items for the page
 * @param pageHeight - Page height in points
 * @returns Object with items for each band
 */
export function getAllBands(
  items: TextItemWithPosition[],
  pageHeight: number
): {
  header: TextItemWithPosition[];
  heading: TextItemWithPosition[];
  body: TextItemWithPosition[];
  footer: TextItemWithPosition[];
} {
  return {
    header: sliceBand(items, pageHeight, STANDARD_BANDS.header),
    heading: sliceBand(items, pageHeight, STANDARD_BANDS.heading),
    body: sliceBand(items, pageHeight, STANDARD_BANDS.body),
    footer: sliceBand(items, pageHeight, STANDARD_BANDS.footer),
  };
}

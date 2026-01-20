/**
 * Bounding box utilities for coordinate system normalization
 * 
 * Enforces canonical bbox convention: top-left origin, y-down
 * - x=0 at left, x increases rightward
 * - y=0 at top, y increases downward
 * - bbox format: [x0, y0, x1, y1] where y0 < y1 (top < bottom)
 */

/**
 * Normalize bbox from bottom-left origin (PDF standard) to top-left origin (visual)
 * 
 * @param bbox - Bounding box in bottom-left origin: [x0, y0_bottom, x1, y1_bottom]
 * @param pageHeight - Page height in points
 * @returns Normalized bbox in top-left origin: [x0, y0_top, x1, y1_top]
 * 
 * NOTE: PyMuPDF bbox format is [x0, y0_bottom, x1, y1_top] where:
 * - y0_bottom is the bottom Y coordinate (smaller value, closer to bottom)
 * - y1_top is the top Y coordinate (larger value, closer to top)
 * In PDF coordinates (bottom-left origin), y increases upward, so y1 > y0.
 * 
 * Conversion to top-left origin (y increases downward):
 * - y0_top = pageHeight - y1_bottom (top of span in visual space)
 * - y1_top = pageHeight - y0_bottom (bottom of span in visual space)
 */
export function normalizeBbox(
  bbox: [number, number, number, number],
  pageHeight: number
): [number, number, number, number] {
  const [x0, y0_raw, x1, y1_raw] = bbox;
  
  // Check if already in top-left origin (y0 < y1 and reasonable values)
  // If y0 is very small (< 100) and y1 is very large (> pageHeight - 100),
  // it's likely already in top-left origin
  const likelyTopLeft = y0_raw < y1_raw && y0_raw < pageHeight * 0.5 && y1_raw > pageHeight * 0.5;
  
  if (likelyTopLeft) {
    // Already in top-left origin, just ensure ordering
    return [
      Math.min(x0, x1),
      Math.min(y0_raw, y1_raw),
      Math.max(x0, x1),
      Math.max(y0_raw, y1_raw),
    ];
  }
  
  // Convert from bottom-left origin to top-left origin
  // In bottom-left: y0 is bottom (smaller), y1 is top (larger), y increases upward
  // In top-left: y0' is top (smaller), y1' is bottom (larger), y increases downward
  // Conversion: y' = H - y (flip vertically)
  const y0_top = pageHeight - y1_raw;
  const y1_top = pageHeight - y0_raw;
  
  // Ensure x0 < x1 and y0 < y1
  return [
    Math.min(x0, x1),
    Math.min(y0_top, y1_top),
    Math.max(x0, x1),
    Math.max(y0_top, y1_top),
  ];
}

/**
 * Check if bbox is in top-left origin format
 * 
 * @param bbox - Bounding box to check
 * @param pageHeight - Page height in points
 * @returns true if bbox appears to be in top-left origin (y0 < y1 and reasonable values)
 * 
 * Heuristic: If y0 is very small (< 20% of page height) and y1 is very large (> 80% of page height),
 * it's likely in bottom-left origin (inverted). In top-left origin, y0 should be smaller than y1,
 * and both should be reasonable (0 <= y0 < y1 <= pageHeight).
 */
export function isTopLeftOrigin(
  bbox: [number, number, number, number],
  pageHeight: number
): boolean {
  const [, y0, , y1] = bbox;
  
  // In top-left origin: y0 should be smaller than y1 (top < bottom)
  // And y0 should be >= 0, y1 should be <= pageHeight
  // Also check: if y0 is very large (> 80% of page) and y1 is very small (< 20% of page),
  // it's likely inverted (bottom-left origin)
  const likelyInverted = y0 > pageHeight * 0.8 && y1 < pageHeight * 0.2;
  
  return !likelyInverted && y0 < y1 && y0 >= 0 && y1 <= pageHeight * 1.1; // Allow 10% tolerance for rounding
}

/**
 * Ensure bbox is in canonical format (top-left origin, y-down)
 * 
 * @param bbox - Bounding box (may be in either coordinate system)
 * @param pageHeight - Page height in points
 * @returns Normalized bbox in top-left origin
 */
export function ensureCanonicalBbox(
  bbox: [number, number, number, number],
  pageHeight: number
): [number, number, number, number] {
  // Check if already in top-left origin
  if (isTopLeftOrigin(bbox, pageHeight)) {
    // Just ensure x0 < x1 and y0 < y1
    const [x0, y0, x1, y1] = bbox;
    return [
      Math.min(x0, x1),
      Math.min(y0, y1),
      Math.max(x0, x1),
      Math.max(y0, y1),
    ];
  }
  
  // Convert from bottom-left to top-left
  return normalizeBbox(bbox, pageHeight);
}

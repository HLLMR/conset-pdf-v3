/**
 * Visual reading-order assembly helpers
 * 
 * Provides deterministic visual ordering for text items to handle:
 * - Text runs out of visual order from PDF.js getTextContent()
 * - Wrapped titles that need to be reconstructed correctly
 */

export type VisualTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
};

export interface ReadingOrderOptions {
  /**
   * Tolerance for grouping items into the same line (in points)
   * Default: 0.6 * median item height, or 10 if no heights available
   */
  lineTol?: number;
  
  /**
   * Gap tolerance for deciding whether to insert a space between items (in points)
   * Default: 0.15 * median item height, or 3 if no heights available
   */
  gapTol?: number;
  
  /**
   * How to join lines: "space" for titles (wrapped but should read as one line),
   * "newline" for multi-line text blocks
   * Default: "space"
   */
  joinLines?: 'space' | 'newline';
}

/**
 * Sort text items into visual reading order
 * 
 * Groups items into lines using y proximity, then sorts:
 * - Lines: top to bottom
 * - Items within line: left to right
 * 
 * @param items Text items to sort
 * @param opts Options for line tolerance and gap tolerance
 * @returns Items sorted in visual reading order
 */
export function sortItemsVisual(
  items: VisualTextItem[],
  opts?: ReadingOrderOptions
): VisualTextItem[] {
  if (items.length === 0) return [];
  
  // Calculate median height for tolerance defaults
  const heights = items.map(item => item.height).filter(h => h > 0).sort((a, b) => a - b);
  const medianHeight = heights.length > 0 
    ? heights[Math.floor(heights.length / 2)]
    : 10; // Fallback
  
  const lineTol = opts?.lineTol ?? (0.6 * medianHeight);
  
  // Group items into lines based on y proximity
  const lines: VisualTextItem[][] = [];
  
  for (const item of items) {
    // Find existing line with similar y coordinate
    let foundLine = false;
    for (const line of lines) {
      if (line.length > 0) {
        const lineY = line[0].y;
        if (Math.abs(item.y - lineY) <= lineTol) {
          line.push(item);
          foundLine = true;
          break;
        }
      }
    }
    
    // Create new line if no matching line found
    if (!foundLine) {
      lines.push([item]);
    }
  }
  
  // Sort lines by y (top to bottom)
  lines.sort((a, b) => {
    const aY = a.length > 0 ? a[0].y : 0;
    const bY = b.length > 0 ? b[0].y : 0;
    return aY - bY;
  });
  
  // Sort items within each line by x (left to right)
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
  }
  
  // Flatten lines into single array
  return lines.flat();
}

/**
 * Assemble text items into a string using visual reading order
 * 
 * Groups items into lines, sorts them visually, then joins with appropriate spacing.
 * 
 * @param items Text items to assemble
 * @param opts Options for line tolerance, gap tolerance, and join mode
 * @returns Assembled text string in visual reading order
 */
export function assembleTextVisual(
  items: VisualTextItem[],
  opts?: ReadingOrderOptions
): string {
  if (items.length === 0) return '';
  
  const sortedItems = sortItemsVisual(items, opts);
  
  // Calculate gap tolerance for spacing decisions
  const heights = items.map(item => item.height).filter(h => h > 0).sort((a, b) => a - b);
  const medianHeight = heights.length > 0 
    ? heights[Math.floor(heights.length / 2)]
    : 10; // Fallback
  const gapTol = opts?.gapTol ?? (0.15 * medianHeight);
  
  const joinLines = opts?.joinLines ?? 'space';
  const parts: string[] = [];
  
  let currentLine: VisualTextItem[] = [];
  let lastItem: VisualTextItem | null = null;
  
  for (const item of sortedItems) {
    if (lastItem === null) {
      // First item - always include
      currentLine.push(item);
      lastItem = item;
      continue;
    }
    
    // Check if item is on a new line (y difference exceeds tolerance)
    const lineTol = opts?.lineTol ?? (0.6 * medianHeight);
    const isNewLine = Math.abs(item.y - lastItem.y) > lineTol;
    
    if (isNewLine) {
      // Join current line and start new line
      if (currentLine.length > 0) {
        parts.push(joinLineItems(currentLine, gapTol));
        currentLine = [];
      }
      // Always include the item - never filter based on length
      currentLine.push(item);
    } else {
      // Same line: always include the item
      // Spacing will be handled by joinLineItems()
      currentLine.push(item);
    }
    
    lastItem = item;
  }
  
  // Join remaining line
  if (currentLine.length > 0) {
    parts.push(joinLineItems(currentLine, gapTol));
  }
  
  // Join lines with space or newline
  return parts.join(joinLines === 'newline' ? '\n' : ' ');
}

/**
 * Join items within a line with appropriate spacing
 * 
 * Rules:
 * - Never discard items based on length alone
 * - Always include all items in left-to-right order
 * - Special handling for hyphenated phrases
 * - Deterministic spacing based on gaps
 */
function joinLineItems(items: VisualTextItem[], gapTol: number): string {
  if (items.length === 0) return '';
  if (items.length === 1) {
    // Always include the item, even if it's short like "A", "B", "L6"
    return items[0].str.trim();
  }
  
  const parts: string[] = [];
  let lastItem: VisualTextItem | null = null;
  
  for (const item of items) {
    // Never filter based on length - include all items
    // Only skip truly empty items (whitespace-only)
    const text = item.str.trim();
    if (text.length === 0) {
      // Skip only if completely empty after trim
      continue;
    }
    
    if (lastItem === null) {
      // First item - always include
      parts.push(text);
      lastItem = item;
      continue;
    }
    
    // Check gap between items
    const gap = item.x - (lastItem.x + lastItem.width);
    const lastText = lastItem.str.trim();
    
    // Special handling for hyphenated phrases
    // Case 1: Previous item ends with "-" (e.g., "ONE-" followed by "LINE")
    const lastEndsWithHyphen = lastText.endsWith('-');
    
    // Case 2: Current item starts with "-" and is immediately after previous item
    // (e.g., "ONE" followed by "-LINE" with small gap)
    const currentStartsWithHyphen = text.startsWith('-');
    const isImmediatelyAfter = gap >= 0 && gap <= gapTol * 2; // Allow small gap for hyphen
    
    // Case 3: Current item is a standalone "-" (e.g., "ONE" + "-" + "LINE")
    const isStandaloneHyphen = text === '-';
    
    // Determine if this is a hyphenated phrase
    const isHyphenated = lastEndsWithHyphen || 
                         (currentStartsWithHyphen && isImmediatelyAfter) ||
                         isStandaloneHyphen;
    
    if (isHyphenated) {
      // Join hyphenated phrases without space: "ONE" + "-" + "LINE" → "ONE-LINE"
      // or "ONE-" + "LINE" → "ONE-LINE"
      // or "ONE" + "-LINE" → "ONE-LINE"
      parts.push(text);
    } else if (gap > gapTol) {
      // Large gap: insert space
      parts.push(' ', text);
    } else {
      // Small gap: no space (items are adjacent, might be part of same word)
      parts.push(text);
    }
    
    lastItem = item;
  }
  
  return parts.join('').trim();
}

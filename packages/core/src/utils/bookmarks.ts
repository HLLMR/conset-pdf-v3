import type { TextItemWithPosition } from './pdf.js';

/**
 * Extract sheet title from title block (text near sheet number)
 */
export function extractSheetTitle(
  sheetIdItem: TextItemWithPosition,
  titleBlockItems: TextItemWithPosition[]
): string | null {
  // Look for text items near the sheet number that might be the title
  // Typically the title is above or to the left of the sheet number
  const searchRadius = 200; // points
  
  // Find text items near the sheet number
  const nearbyItems = titleBlockItems.filter(item => {
    const dx = Math.abs(item.x - sheetIdItem.x);
    const dy = Math.abs(item.y - sheetIdItem.y);
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < searchRadius && item !== sheetIdItem;
  });
  
  // Filter out items that look like sheet numbers, dates, or other metadata
  const titleCandidates = nearbyItems.filter(item => {
    const text = item.str.trim();
    // Skip if it looks like a sheet number pattern
    if (/^[A-Z]{1,3}\s*\d+/.test(text)) {
      return false;
    }
    // Skip if it's a date
    if (/\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}/.test(text)) {
      return false;
    }
    // Skip if it's very short (likely metadata)
    if (text.length < 3) {
      return false;
    }
    // Skip common metadata words and approval/author info
    const metadataWords = ['SHEET', 'NO', 'DWG', 'DRAWING', 'REV', 'DATE', 'SCALE', 'SIZE', 
                           'APPROVED', 'CHECKED', 'DRAWN', 'BY', 'AUTHOR', 'CHECKER', 'APPROVER'];
    if (metadataWords.some(word => text.toUpperCase().includes(word))) {
      return false;
    }
    // Skip initials/names (typically 2-3 uppercase letters, possibly with period)
    // But don't filter out common words like "ONE", "TWO", "ALL", etc.
    // Only filter if it looks like initials (2-3 letters, often followed by period or very short)
    const commonWords = new Set(['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN',
                                 'ALL', 'NEW', 'OLD', 'TOP', 'BOT', 'END', 'AND', 'THE', 'FOR', 'ARE']);
    if (/^[A-Z]{2,3}$/.test(text) && !commonWords.has(text.toUpperCase())) {
      // Also check if it's likely initials (very short, and might be near other initials)
      return false;
    }
    return true;
  });
  
  if (titleCandidates.length === 0) {
    return null;
  }
  
  // Prefer items above the sheet number (titles are typically above)
  const aboveItems = titleCandidates.filter(item => item.y < sheetIdItem.y);
  const candidates = aboveItems.length > 0 ? aboveItems : titleCandidates;
  
  // Sort by proximity to sheet number
  candidates.sort((a, b) => {
    const distA = Math.sqrt(
      Math.pow(a.x - sheetIdItem.x, 2) + Math.pow(a.y - sheetIdItem.y, 2)
    );
    const distB = Math.sqrt(
      Math.pow(b.x - sheetIdItem.x, 2) + Math.pow(b.y - sheetIdItem.y, 2)
    );
    return distA - distB;
  });
  
  // Combine nearby text items into a title
  const titleParts: string[] = [];
  const usedItems = new Set<TextItemWithPosition>();
  
  for (const candidate of candidates.slice(0, 5)) { // Limit to 5 candidates
    if (usedItems.has(candidate)) continue;
    
    // Find items on the same line (similar Y coordinate)
    const lineItems = candidates.filter(item => {
      if (usedItems.has(item)) return false;
      const yDiff = Math.abs(item.y - candidate.y);
      return yDiff < 10; // Same line
    });
    
    // Sort by X coordinate (left to right)
    lineItems.sort((a, b) => a.x - b.x);
    
    // Combine into title, handling hyphens properly
    // If an item ends with a hyphen, join it with the next item without a space
    // Also check horizontal proximity - items very close together might be hyphenated words
    const lineTextParts: string[] = [];
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i].str.trim();
      if (item.length === 0) continue;
      
      const prevItem = i > 0 ? lineItems[i - 1] : null;
      const horizontalGap = prevItem ? (lineItems[i].x - (prevItem.x + prevItem.width)) : Infinity;
      
      // If previous part ends with hyphen, join without space
      if (lineTextParts.length > 0 && lineTextParts[lineTextParts.length - 1].endsWith('-')) {
        lineTextParts[lineTextParts.length - 1] += item;
      } 
      // If items are very close together (within ~5 points, typical for hyphenated words)
      // and the previous item doesn't end with punctuation, they might be a hyphenated word
      // But be conservative - only do this if the gap is very small (< 3 points)
      else if (prevItem && horizontalGap >= 0 && horizontalGap < 3 && 
               !lineTextParts[lineTextParts.length - 1].match(/[.!?;:,\-]$/)) {
        // Check if this looks like a hyphenated compound word pattern
        // Common patterns: ALL-CAPS words, or words that form common compounds
        const prevText = lineTextParts[lineTextParts.length - 1].toUpperCase();
        const currText = item.toUpperCase();
        // If both are short words (likely parts of a compound) and gap is tiny, join with hyphen
        if (prevText.length <= 6 && currText.length <= 6 && horizontalGap < 2) {
          lineTextParts[lineTextParts.length - 1] += '-' + item;
        } else {
          lineTextParts.push(item);
        }
      } else {
        lineTextParts.push(item);
      }
    }
    const lineText = lineTextParts.join(' ').trim();
    if (lineText.length > 0) {
      titleParts.push(lineText);
      lineItems.forEach(item => usedItems.add(item));
    }
  }
  
  if (titleParts.length === 0) {
    return null;
  }
  
  // Combine title parts with single space (not ' - ') to preserve hyphenated words
  // Only use ' - ' if there's a clear semantic break (e.g., "#6 - EXISTING")
  const title = titleParts.join(' ').trim();
  const maxLength = 100; // Reasonable limit for bookmark titles
  return title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
}

/**
 * DELETION CANDIDATE: generateBookmarks()
 * 
 * Status: Orphaned - never called
 * Evidence: 
 *   - grep shows no calls to generateBookmarks() in codebase
 *   - Bookmark generation now handled by PdfLibBookmarkWriter in core/applyPlan.ts
 *   - This function uses legacy pdfPath-based detection (bypasses DocumentContext)
 * 
 * Migration: If bookmark generation needed, use workflow engine (createBookmarksWorkflowRunner)
 * or PdfLibBookmarkWriter directly.
 * 
 * TODO: Remove after confirming no external usage
 * Tracking: Cleanup pass 2026-01-17
 */
// export async function generateBookmarks(...) { ... } // DELETED - orphaned function

/**
 * Pure function to parse CSI section ID from footer line text
 * 
 * Handles patterns like:
 * - "23 00 00" (spaces)
 * - "23-00-00" (dashes)
 * - "23.00.00" (dots)
 * - "2025-10-01 23 00 00 - Title" (with date prefix)
 * 
 * Returns normalized section ID "23 00 00" or null if not found.
 * Explicitly ignores date prefixes (YYYY-MM-DD patterns).
 */

/**
 * Parse section ID from footer line text
 * 
 * Uses explicit regex patterns for "23 XX XX" format.
 * Ignores date prefixes (YYYY-MM-DD patterns before the section ID).
 * 
 * @param line - Footer line text (may contain date, section ID, title, page number)
 * @returns Normalized section ID (e.g., "23 00 00") or null if not found
 */
export function parseFooterSectionId(line: string): string | null {
  if (!line || typeof line !== 'string') {
    return null;
  }
  
  // Normalize: collapse whitespace, normalize dashes
  const normalized = line
    .replace(/\s+/g, ' ')
    .replace(/[–—−]/g, '-')
    .trim();
  
  // Explicit patterns for Division 23 section IDs
  // Pattern 1: "23 00 00" (spaces)
  // Pattern 2: "23-00-00" (dashes)
  // Pattern 3: "23.00.00" (dots)
  // Pattern 4: "23 - 00 - 00" (spaces around dashes)
  
  const patterns = [
    /\b23\s+(\d{2})\s+(\d{2})\b/,           // "23 00 00"
    /\b23-(\d{2})-(\d{2})\b/,               // "23-00-00"
    /\b23\.(\d{2})\.(\d{2})\b/,             // "23.00.00"
    /\b23\s*-\s*(\d{2})\s*-\s*(\d{2})\b/,   // "23 - 00 - 00"
  ];
  
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match && match[1] && match[2]) {
      // Validate: sub and section should be 00-99
      const sub = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      
      if (!isNaN(sub) && !isNaN(sec) && 
          sub >= 0 && sub <= 99 && sec >= 0 && sec <= 99) {
        // Return normalized format: "23 XX XX"
        return `23 ${match[1]} ${match[2]}`;
      }
    }
  }
  
  return null;
}

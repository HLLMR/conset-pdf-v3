/**
 * Normalization helpers for narrative parsing
 * 
 * These functions normalize IDs extracted from narrative text
 * to canonical forms for comparison and deduplication.
 */

/**
 * Normalize a sheet ID from narrative text
 * 
 * Rules:
 * - Uppercase letters
 * - Preserve dots (e.g., G0.01 stays G0.01)
 * - Collapse whitespace
 * - Normalize separators
 */
export function normalizeSheetId(raw: string): string {
  // Uppercase
  let normalized = raw.toUpperCase();
  
  // Preserve dots and dashes but normalize spacing around them
  // Example: "G 0.01" -> "G0.01", "M6-03" -> "M6-03"
  // First, remove spaces around dots and dashes
  normalized = normalized.replace(/\s*([.\-])\s*/g, '$1');
  
  // Then collapse remaining whitespace to single space
  normalized = normalized.replace(/\s+/g, ' ');
  
  // Trim
  normalized = normalized.trim();
  
  // Remove any remaining spaces (shouldn't be any after above, but just in case)
  normalized = normalized.replace(/\s/g, '');
  
  return normalized;
}

/**
 * Normalize a spec section ID to "NN NN NN" format
 * 
 * @param raw - Raw section ID (e.g., "230200", "23 02 00", "23-02-00")
 * @returns Normalized format "NN NN NN" or empty string if invalid
 */
export function normalizeSpecSectionId(raw: string): string {
  // Extract digits only
  const digits = raw.replace(/\D/g, '');
  
  // Must have exactly 6 digits
  if (digits.length !== 6) {
    return '';
  }
  
  // Format as "NN NN NN"
  return `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)}`;
}

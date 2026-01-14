/**
 * Normalization utilities for construction document IDs
 */

/**
 * Normalize a drawings sheet ID to canonical form
 * Rules:
 * 1. Uppercase letters
 * 2. Collapse whitespace
 * 3. Convert separators (., _, multiple -) into canonical - between major numeric groups
 * 4. Preserve suffix letters (e.g., A in M1-01A)
 */
export function normalizeDrawingsSheetId(id: string): string {
  // Uppercase
  let normalized = id.toUpperCase();
  
  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ');
  
  // Replace various separators with single dash
  // Pattern: letter(s) optional-number dash/dot/space number(s) optional-suffix
  // We want: LETTERS-NUMBERS-SUFFIX or LETTERS-NUMBERS
  normalized = normalized.replace(/[-._\s]+/g, '-');
  
  // Remove multiple consecutive dashes
  normalized = normalized.replace(/-+/g, '-');
  
  // Trim dashes from start/end
  normalized = normalized.replace(/^-+|-+$/g, '');
  
  return normalized;
}

/**
 * Normalize a specs section ID to canonical form
 * Rules:
 * - Canonical form: "DD SS SS" with single spaces
 * - Ensure each group is two digits
 */
export function normalizeSpecsSectionId(id: string): string {
  // Extract digits only
  const digits = id.replace(/\D/g, '');
  
  // Ensure we have 6 digits (DD SS SS)
  if (digits.length < 6) {
    // Pad with zeros if needed
    const padded = digits.padEnd(6, '0');
    return `${padded.slice(0, 2)} ${padded.slice(2, 4)} ${padded.slice(4, 6)}`;
  }
  
  // Take first 6 digits and format as "DD SS SS"
  const formatted = `${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)}`;
  return formatted;
}

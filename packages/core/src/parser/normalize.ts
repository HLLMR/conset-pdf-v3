/**
 * Normalization utilities for construction document IDs
 */

/**
 * Normalize a drawings sheet ID to canonical form
 * Rules:
 * 1. Uppercase letters
 * 2. Collapse whitespace
 * 3. Preserve original delimiter (dot, dash, etc.)
 * 4. Remove spaces around delimiters
 * 5. Preserve suffix letters (e.g., A in M1-01A)
 */
export function normalizeDrawingsSheetId(id: string): string {
  // Uppercase
  let normalized = id.toUpperCase();
  
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

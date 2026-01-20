import { normalizeSpecsSectionId } from './normalize.js';

export interface ParsedId {
  id: string;
  normalized: string;
  confidence: number;
  pageIndex: number;
}

/**
 * Default regex for detecting specs section IDs
 * Pattern: \b(?<id>\d{2}\s+\d{2}\s+\d{2})\b
 * Also accepts "SECTION 23 09 00" format
 * Updated: Require literal SECTION at start with strict format: ^SECTION\s+\d{2}\s+\d{2}\s+\d{2}\b
 */
const DEFAULT_SPECS_PATTERN = /\b(?:SECTION\s+)?(\d{2}\s+\d{2}\s+\d{2})\b/g;

/**
 * Strict SECTION pattern: requires literal SECTION at start
 * Pattern: ^SECTION\s+\d{2}\s+\d{2}\s+\d{2}\b
 */
const STRICT_SECTION_PATTERN = /^SECTION\s+(\d{2}\s+\d{2}\s+\d{2})\b/i;

/**
 * Keywords that increase confidence when found near an ID
 */
const CONFIDENCE_KEYWORDS = ['SECTION', 'DIVISION', 'PART', 'ARTICLE', 'SECTION NO'];

/**
 * Calculate confidence score for a parsed ID
 */
function calculateConfidence(
  id: string,
  pageText: string,
  allMatches: string[]
): number {
  let confidence = 0.5; // Base confidence when regex match is found
  
  const upperText = pageText.toUpperCase();
  const upperId = id.toUpperCase();
  
  // Check if ID appears near keywords (+0.2)
  const idIndex = upperText.indexOf(upperId);
  if (idIndex !== -1) {
    const context = upperText.substring(
      Math.max(0, idIndex - 50),
      Math.min(upperText.length, idIndex + id.length + 50)
    );
    
    const hasKeyword = CONFIDENCE_KEYWORDS.some(keyword => 
      context.includes(keyword)
    );
    
    if (hasKeyword) {
      confidence += 0.2;
    }
  }
  
  // Check if match appears multiple times consistently (+0.2)
  const normalizedId = normalizeSpecsSectionId(id);
  const normalizedMatches = allMatches.map(m => normalizeSpecsSectionId(m));
  const sameNormalizedCount = normalizedMatches.filter(m => m === normalizedId).length;
  
  if (sameNormalizedCount >= 2) {
    confidence += 0.2;
  }
  
  // Check for multiple distinct candidates (-0.3)
  const uniqueNormalized = new Set(normalizedMatches);
  if (uniqueNormalized.size > 1) {
    confidence -= 0.3;
  }
  
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Parse specs section IDs from page text
 * 
 * @param pageText Page text to search
 * @param pageIndex Page index (0-based)
 * @param customPattern Optional custom regex pattern
 * @param options Optional parsing options
 */
export function parseSpecsSectionIds(
  pageText: string,
  pageIndex: number,
  customPattern?: string,
  options?: {
    /** Reject Division 01 references */
    rejectDivision01?: boolean;
    /** Require strict SECTION format */
    strictSection?: boolean;
  }
): ParsedId[] {
  const rejectDivision01 = options?.rejectDivision01 ?? true;
  const strictSection = options?.strictSection ?? true;
  
  // If strict section mode, first try to find SECTION matches
  const strictMatches: string[] = [];
  if (strictSection) {
    const lines = pageText.split('\n');
    for (const line of lines) {
      const match = line.match(STRICT_SECTION_PATTERN);
      if (match) {
        const id = match[1];
        // Negative match: reject Division 01 references
        if (rejectDivision01) {
          const division01Pattern = /\b(?:DIVISION|DIV)\s+01\b/i;
          if (division01Pattern.test(line)) {
            continue;
          }
        }
        strictMatches.push(id);
      }
    }
  }
  
  // Also use default pattern for non-SECTION matches
  const pattern = customPattern 
    ? new RegExp(customPattern, 'gi')
    : DEFAULT_SPECS_PATTERN;
  
  const matches: string[] = [];
  const matchMap = new Map<string, number>(); // id -> count
  
  // Find all matches
  let match;
  while ((match = pattern.exec(pageText)) !== null) {
    const id = match[1] || match[0];
    // Skip if this is a SECTION match and we're in strict mode (already handled above)
    if (strictSection && STRICT_SECTION_PATTERN.test(match[0])) {
      continue;
    }
    matches.push(id);
    matchMap.set(id, (matchMap.get(id) || 0) + 1);
  }
  
  // Combine strict matches with regular matches
  const allMatches = [...strictMatches, ...matches];
  
  if (allMatches.length === 0) {
    return [];
  }
  
  // Calculate confidence for each unique match
  const parsed: ParsedId[] = [];
  const seen = new Set<string>();
  
  for (const id of allMatches) {
    const normalized = normalizeSpecsSectionId(id);
    
    // Skip if we've already processed this normalized ID
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    
    // Negative match: reject Division 01 references
    // Reject any section ID starting with "01" as it's a Division 01 reference, not a real section
    if (rejectDivision01 && normalized.startsWith('01 ')) {
      continue;
    }
    
    const confidence = calculateConfidence(id, pageText, allMatches);
    
    parsed.push({
      id,
      normalized,
      confidence,
      pageIndex,
    });
  }
  
  // Sort by confidence (highest first)
  parsed.sort((a, b) => b.confidence - a.confidence);
  
  return parsed;
}

/**
 * Get the best (highest confidence) ID from a page
 */
export function getBestSpecsSectionId(
  pageText: string,
  pageIndex: number,
  customPattern?: string,
  options?: {
    /** Reject Division 01 references */
    rejectDivision01?: boolean;
    /** Require strict SECTION format */
    strictSection?: boolean;
  }
): ParsedId | null {
  const parsed = parseSpecsSectionIds(pageText, pageIndex, customPattern, options);
  return parsed.length > 0 && parsed[0].confidence >= 0.5 ? parsed[0] : null;
}

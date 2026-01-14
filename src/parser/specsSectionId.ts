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
 */
const DEFAULT_SPECS_PATTERN = /\b(?:SECTION\s+)?(\d{2}\s+\d{2}\s+\d{2})\b/g;

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
 */
export function parseSpecsSectionIds(
  pageText: string,
  pageIndex: number,
  customPattern?: string
): ParsedId[] {
  const pattern = customPattern 
    ? new RegExp(customPattern, 'gi')
    : DEFAULT_SPECS_PATTERN;
  
  const matches: string[] = [];
  const matchMap = new Map<string, number>(); // id -> count
  
  // Find all matches
  let match;
  while ((match = pattern.exec(pageText)) !== null) {
    const id = match[1] || match[0];
    matches.push(id);
    matchMap.set(id, (matchMap.get(id) || 0) + 1);
  }
  
  if (matches.length === 0) {
    return [];
  }
  
  // Calculate confidence for each unique match
  const parsed: ParsedId[] = [];
  const seen = new Set<string>();
  
  for (const id of matches) {
    const normalized = normalizeSpecsSectionId(id);
    
    // Skip if we've already processed this normalized ID
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    
    const confidence = calculateConfidence(id, pageText, matches);
    
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
  customPattern?: string
): ParsedId | null {
  const parsed = parseSpecsSectionIds(pageText, pageIndex, customPattern);
  return parsed.length > 0 && parsed[0].confidence >= 0.5 ? parsed[0] : null;
}

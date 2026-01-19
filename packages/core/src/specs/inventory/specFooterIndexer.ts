/**
 * SpecFooterIndexer: Parse footer text to extract section information
 * 
 * Given PdfPageTextItems (or TextItemWithPosition[]), computes a FooterParse:
 * - sectionId: normalized like "23 00 00"
 * - sectionTitle: best-effort (optional)
 * - pageInSection: integer (from "Page N")
 * - confidence + evidence (the raw matched string)
 * 
 * Uses ONLY bottom-band items (configurable band like ROI band utilities).
 * 
 * Token-based parsing:
 * - Builds token stream from footer ROI items sorted by x
 * - extractSectionIdFromTokens: collects first 6 digits from adjacent numeric tokens
 * - extractPageNumberFromTokens: finds "Page" then reads next numeric token(s)
 */

import type { TextItemWithPosition } from '../../utils/pdf.js';
import { sliceBand, STANDARD_BANDS } from '../../text/bandSlicer.js';
import type { DetectedPageRegions } from '../../text/pageRegions.js';

/**
 * Footer parse result for a single page
 */
export interface FooterParse {
  /** Normalized section ID like "23 00 00" */
  sectionId: string | null;
  /** Best-effort section title (optional) */
  sectionTitle: string | null;
  /** Page number within section (from "Page N") */
  pageInSection: number | null;
  /** Confidence level: 'high' | 'medium' | 'low' */
  confidence: 'high' | 'medium' | 'low';
  /** Raw matched string(s) used as evidence */
  evidence: string;
  /** Token spans used for evidence (for debugging) */
  tokenSpans?: {
    sectionId?: Array<{ token: string; x: number }>;
    pageNumber?: Array<{ token: string; x: number }>;
  };
}

/**
 * Options for footer parsing
 */
export interface FooterIndexerOptions {
  /** Footer band definition (normalized 0-1, default: 0.88-1.00) */
  footerBand?: { yMin: number; yMax: number };
  /** Use detected regions if available */
  regions?: DetectedPageRegions;
}

/**
 * Token with position information
 */
interface Token {
  str: string;
  x: number;
}

/**
 * Parse footer text to extract section information
 * 
 * @param items - Text items for the page
 * @param pageHeight - Page height in points
 * @param options - Parsing options
 * @returns FooterParse with sectionId, pageInSection, confidence, evidence
 */
export function parseFooter(
  items: TextItemWithPosition[],
  pageHeight: number,
  options: FooterIndexerOptions = {}
): FooterParse {
  const { footerBand = STANDARD_BANDS.footer, regions } = options;
  
  // Use detected footer band if available, otherwise use provided/default
  const band = regions?.footer || footerBand;
  
  // Extract footer items only
  const footerItems = sliceBand(items, pageHeight, band);
  
  if (footerItems.length === 0) {
    return {
      sectionId: null,
      sectionTitle: null,
      pageInSection: null,
      confidence: 'low',
      evidence: '',
    };
  }
  
  // Build token stream sorted by x (left to right)
  const tokens = buildTokenStream(footerItems);
  
  // Extract section ID from tokens
  const sectionIdResult = extractSectionIdFromTokens(tokens);
  
  // Extract page number from tokens
  const pageNumberResult = extractPageNumberFromTokens(tokens);
  
  // Extract section title (best-effort, after section ID)
  const sectionTitle = extractSectionTitleFromTokens(tokens, sectionIdResult.sectionId);
  
  // Determine confidence
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (sectionIdResult.sectionId && pageNumberResult.pageInSection !== null) {
    confidence = 'high';
  } else if (sectionIdResult.sectionId || pageNumberResult.pageInSection !== null) {
    confidence = 'medium';
  }
  
  // Build evidence string from token spans
  const evidenceParts: string[] = [];
  if (sectionIdResult.tokenSpans && sectionIdResult.tokenSpans.length > 0) {
    evidenceParts.push(`sectionId: ${sectionIdResult.tokenSpans.map(t => t.token).join(' ')}`);
  }
  if (pageNumberResult.tokenSpans && pageNumberResult.tokenSpans.length > 0) {
    evidenceParts.push(`page: ${pageNumberResult.tokenSpans.map(t => t.token).join(' ')}`);
  }
  const evidence = evidenceParts.length > 0 ? evidenceParts.join('; ') : '';
  
  return {
    sectionId: sectionIdResult.sectionId,
    sectionTitle,
    pageInSection: pageNumberResult.pageInSection,
    confidence,
    evidence,
    tokenSpans: {
      sectionId: sectionIdResult.tokenSpans,
      pageNumber: pageNumberResult.tokenSpans,
    },
  };
}

/**
 * Build token stream from footer items sorted by x (left to right)
 * 
 * Filters out empty/whitespace-only tokens, normalizes whitespace.
 */
function buildTokenStream(items: TextItemWithPosition[]): Token[] {
  // Sort by x coordinate (left to right)
  const sorted = [...items].sort((a, b) => a.x - b.x);
  
  const tokens: Token[] = [];
  for (const item of sorted) {
    const str = item.str.trim();
    // Skip empty tokens and pure whitespace
    if (str.length > 0) {
      tokens.push({
        str,
        x: item.x,
      });
    }
  }
  
  return tokens;
}

/**
 * Extract section ID from tokens
 * 
 * Collects the first 6 digits from adjacent numeric tokens.
 * Supports "00" and "0" tokens (e.g., "23", "00", "0", "0" -> "23 00 00").
 * 
 * Returns normalized form: "DD DD DD" (two digits, space, two digits, space, two digits).
 */
export function extractSectionIdFromTokens(tokens: Token[]): {
  sectionId: string | null;
  tokenSpans?: Array<{ token: string; x: number }>;
} {
  const digits: string[] = [];
  const tokenSpans: Array<{ token: string; x: number }> = [];
  let lastNumericX = -1;
  const maxGap = 20; // Maximum x-distance between numeric tokens to consider them adjacent
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    // Check if token is numeric (all digits)
    if (/^\d+$/.test(token.str)) {
      // Skip 4-digit tokens (likely years like "2025")
      if (token.str.length === 4) {
        // Reset if we hit a year
        if (digits.length > 0) {
          digits.length = 0;
          tokenSpans.length = 0;
          lastNumericX = -1;
        }
        continue;
      }
      
      // Check if this token is adjacent to the last numeric token
      if (lastNumericX >= 0 && token.x - lastNumericX > maxGap) {
        // Too far apart - reset and start new sequence
        digits.length = 0;
        tokenSpans.length = 0;
      }
      
      // Add digits from the token (up to 2 digits per token for section ID format)
      const digitsToAdd = Math.min(2, token.str.length);
      for (let j = 0; j < digitsToAdd; j++) {
        digits.push(token.str[j]);
        if (digits.length === 6) {
          break;
        }
      }
      tokenSpans.push({ token: token.str, x: token.x });
      lastNumericX = token.x;
      
      if (digits.length === 6) {
        break;
      }
    } else {
      // Non-numeric token
      if (digits.length > 0 && digits.length < 6) {
        // If token is short punctuation/separator, continue collecting
        if (token.str.length <= 2 && /^[-\s.,;:]+$/.test(token.str)) {
          // Check if we're in a date-like pattern (e.g., "2025-10-01")
          // If we have 4 digits followed by dash, it's likely a date - reset
          if (digits.length === 4 && /^[-–—−]$/.test(token.str)) {
            digits.length = 0;
            tokenSpans.length = 0;
            lastNumericX = -1;
            continue;
          }
          // Otherwise, small gap is OK for section ID (e.g., "23 00 00")
          if (lastNumericX >= 0 && token.x - lastNumericX <= maxGap) {
            continue;
          }
        }
        // Large gap or text - reset
        digits.length = 0;
        tokenSpans.length = 0;
        lastNumericX = -1;
      }
    }
  }
  
  if (digits.length === 6) {
    // Format as "DD DD DD"
    const sectionId = `${digits[0]}${digits[1]} ${digits[2]}${digits[3]} ${digits[4]}${digits[5]}`;
    return {
      sectionId,
      tokenSpans: tokenSpans.length > 0 ? tokenSpans : undefined,
    };
  }
  
  return {
    sectionId: null,
    tokenSpans: undefined,
  };
}

/**
 * Extract page number from tokens
 * 
 * Finds "Page" (case-insensitive) then reads the next numeric token(s).
 * Handles variations: "Page 1", "Page: 1", "P. 1", etc.
 * 
 * Returns page number (integer) or null if not found.
 */
export function extractPageNumberFromTokens(tokens: Token[]): {
  pageInSection: number | null;
  tokenSpans?: Array<{ token: string; x: number }>;
} {
  let foundPage = false;
  const tokenSpans: Array<{ token: string; x: number }> = [];
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    // Look for "Page" (case-insensitive) or "P." or "P "
    if (!foundPage) {
      const normalized = token.str.toLowerCase();
      if (normalized === 'page' || normalized.startsWith('p.') || (normalized === 'p' && i + 1 < tokens.length)) {
        foundPage = true;
        tokenSpans.push({ token: token.str, x: token.x });
        continue;
      }
    } else {
      // After "Page", look for numeric token
      if (/^\d+$/.test(token.str)) {
        const pageNum = parseInt(token.str, 10);
        if (!isNaN(pageNum) && pageNum > 0) {
          tokenSpans.push({ token: token.str, x: token.x });
          return {
            pageInSection: pageNum,
            tokenSpans: tokenSpans.length > 0 ? tokenSpans : undefined,
          };
        }
      } else if (token.str.length <= 2 && /^[:\s.,;]+$/.test(token.str)) {
        // Skip small punctuation/separators after "Page"
        continue;
      } else {
        // Non-numeric text after "Page" - give up
        break;
      }
    }
  }
  
  return {
    pageInSection: null,
    tokenSpans: undefined,
  };
}

/**
 * Extract section title from tokens
 * 
 * Best-effort: extracts title that appears after section ID and dash.
 * Example: "23 05 53 - VIBRATION ISOLATION" -> "VIBRATION ISOLATION"
 * 
 * Returns title string or null if not found.
 */
function extractSectionTitleFromTokens(tokens: Token[], sectionId: string | null): string | null {
  if (!sectionId) {
    return null;
  }
  
  // Find where section ID ends (after 6 digits collected)
  let sectionIdEndIndex = -1;
  let digitsCollected = 0;
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (/^\d+$/.test(token.str)) {
      for (const _digit of token.str) {
        digitsCollected++;
        if (digitsCollected === 6) {
          sectionIdEndIndex = i;
          break;
        }
      }
      if (digitsCollected === 6) {
        break;
      }
    } else if (digitsCollected > 0 && digitsCollected < 6) {
      // Small punctuation - continue
      if (token.str.length <= 2 && /^[-\s.,;:]+$/.test(token.str)) {
        continue;
      }
      // Reset
      digitsCollected = 0;
    }
  }
  
  if (sectionIdEndIndex < 0) {
    return null;
  }
  
  // Look for dash after section ID
  let dashIndex = -1;
  for (let i = sectionIdEndIndex + 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (/^[-–—−]$/.test(token.str)) {
      dashIndex = i;
      break;
    }
    // Stop if we hit "Page" (title comes before page number)
    if (token.str.toLowerCase() === 'page' || token.str.toLowerCase().startsWith('p.')) {
      break;
    }
  }
  
  if (dashIndex < 0) {
    return null;
  }
  
  // Collect title tokens after dash, until we hit "Page" or end
  const titleTokens: string[] = [];
  for (let i = dashIndex + 1; i < tokens.length; i++) {
    const token = tokens[i];
    
    // Stop at "Page"
    if (token.str.toLowerCase() === 'page' || token.str.toLowerCase().startsWith('p.')) {
      break;
    }
    
    // Skip small punctuation
    if (token.str.length <= 2 && /^[-\s.,;:]+$/.test(token.str)) {
      continue;
    }
    
    // Filter out common noise tokens
    const noisePatterns = [
      /^Project\s+No\.?\s*\d+/i,
      /^\d{2}\/\d{2}\/\d{4}/, // Dates
    ];
    
    let isNoise = false;
    for (const noisePattern of noisePatterns) {
      if (noisePattern.test(token.str)) {
        isNoise = true;
        break;
      }
    }
    
    if (!isNoise) {
      titleTokens.push(token.str);
    }
  }
  
  if (titleTokens.length > 0) {
    return titleTokens.join(' ').trim();
  }
  
  return null;
}

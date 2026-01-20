/**
 * Footer section code extraction and mapping
 * 
 * Extracts section codes from footer text and maps them to first occurrence pages.
 */

import type { TextPage } from '../text/pageRegions.js';
import type { DetectedPageRegions } from '../text/pageRegions.js';
import type { TextItemWithPosition } from '../utils/pdf.js';
import { sliceBand, STANDARD_BANDS, extractFooterText } from '../text/bandSlicer.js';
import type { LayoutTranscript } from '../transcript/types.js';
import type { CandidateReport } from '../transcript/candidates.js';
import type { DocumentContext } from '../analyze/documentContext.js';

/**
 * FooterSectionMap type (stub for compilation)
 * TODO: Implement full FooterSectionMap when ready to rewire footer tagging
 */
export interface FooterSectionMap {
  footerBand: { yMin: number; yMax: number; confidence: number; pageCoverage: number };
  tagsByPage: Array<{ pageIndex: number; sectionId?: string; pageInSection?: number; confidence: number; reasonCodes: string[]; footerLines: any[] }>;
  ranges: Array<{ sectionId: string; startPage: number; endPage: number; pages: number[]; confidence: number; anomalies: string[] }>;
  stats: { pagesTotal: number; pagesTagged: number; uniqueSections: number; pagesMissingFooter: number; pagesAmbiguous: number };
}

/**
 * Build footer section map (stub for compilation)
 * TODO: Implement using new parseFooterSectionId when ready
 */
export async function buildFooterSectionMap(
  _transcript: LayoutTranscript,
  _candidates?: CandidateReport,
  _options?: any,
  _docContext?: DocumentContext
): Promise<FooterSectionMap> {
  // Stub implementation - will be replaced when ready to rewire
  return {
    footerBand: { yMin: 0.92, yMax: 0.98, confidence: 0.5, pageCoverage: 0 },
    tagsByPage: [],
    ranges: [],
    stats: { pagesTotal: 0, pagesTagged: 0, uniqueSections: 0, pagesMissingFooter: 0, pagesAmbiguous: 0 },
  };
}

/**
 * Normalize footer text for parsing
 * 
 * Collapses whitespace, normalizes dashes, removes extra punctuation.
 */
export function normalizeFooterText(text: string): string {
  return text
    .replace(/\s+/g, ' ') // Collapse whitespace
    .replace(/[–—−]/g, '-') // Normalize dashes (en-dash, em-dash, minus) to hyphen
    .replace(/\s*-\s*/g, ' - ') // Normalize dash spacing
    .trim();
}

/**
 * Parse section codes from text
 * 
 * Accepts variants:
 * - "23 05 53"
 * - "23 05 53 – ..."
 * - "23 05 53-..."
 * - "23 05 53—..."
 * - Weird double spaces: "23  05  53"
 * 
 * Returns unique section codes in canonical form "23 05 53" (single spaces).
 */
export function parseSectionCodes(text: string): string[] {
  const normalized = normalizeFooterText(text);
  
  // Pattern: two-digit number, space(s), two-digit number, space(s), two-digit number
  // Also handle cases with dashes after: "23 05 53 - Title" or "23 05 53-Title"
  const sectionPattern = /\b(\d{2})\s+(\d{2})\s+(\d{2})\b/g;
  
  const codes = new Set<string>();
  let match;
  
  while ((match = sectionPattern.exec(normalized)) !== null) {
    // Canonical form: single spaces between numbers
    const code = `${match[1]} ${match[2]} ${match[3]}`;
    codes.add(code);
  }
  
  return Array.from(codes);
}

/**
 * Extract footer text items from a page
 * 
 * Returns text items whose y-range intersects the footer band, sorted by reading order.
 * Uses standard footer band (0.88-1.0) or detected regions if provided.
 */
export function extractFooterTextItems(
  page: TextPage,
  regions?: DetectedPageRegions
): TextItemWithPosition[] {
  const footerBand = regions?.footer || STANDARD_BANDS.footer;
  return sliceBand(page.items, page.pageHeight, footerBand);
}

/**
 * Build footer section index from pages
 * 
 * Returns:
 * - firstPageBySection: Record mapping section code to first page index (0-based)
 * - occurrences: Record mapping section code to array of all page indices where it appears
 */
export function buildFooterSectionIndex(
  pages: TextPage[],
  regions: DetectedPageRegions
): {
  firstPageBySection: Record<string, number>;
  occurrences: Record<string, number[]>;
} {
  const occurrences: Record<string, number[]> = {};
  
  // Scan all pages for footer section codes
  for (const page of pages) {
    const footerItems = extractFooterTextItems(page, regions);
    
    // Extract footer text using bandSlicer utility (groups into lines, normalizes)
    const footerText = extractFooterText(footerItems);
    
    // Parse section codes from footer
    const codes = parseSectionCodes(footerText);
    
    // Record occurrences
    for (const code of codes) {
      if (!occurrences[code]) {
        occurrences[code] = [];
      }
      occurrences[code].push(page.pageIndex);
    }
  }
  
  // Build first-page mapping (minimum page index for each code)
  const firstPageBySection: Record<string, number> = {};
  for (const [code, pageIndices] of Object.entries(occurrences)) {
    if (pageIndices.length > 0) {
      firstPageBySection[code] = Math.min(...pageIndices);
    }
  }
  
  return {
    firstPageBySection,
    occurrences,
  };
}

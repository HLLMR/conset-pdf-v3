/**
 * Section detection for specs PDFs
 * 
 * Three-phase grammar:
 * 
 * Phase 1: Section root discovery
 * - Detect ONLY literal SECTION NN NN NN starts
 * - Allow multi-line heading blocks
 * - Ignore PART / ARTICLE / END OF SECTION entirely
 * - Produce an ordered list of SectionStart anchors
 * - Hard-fail if section count ≠ expected range
 * 
 * Phase 2: Section scoping
 * - A section spans from its start anchor to the next section start (or EOF)
 * - END OF SECTION is NOT a delimiter
 * 
 * Phase 3: Internal parsing (handled by textExtractor)
 * - Parse PART / ARTICLES only within section scope
 * - END OF SECTION is lint-only
 */

import { DocumentContext } from '../../analyze/documentContext.js';
import type { SpecSection } from '../ast/types.js';
import type { TextItemWithPosition } from '../../utils/pdf.js';
import { normalizeSpecsSectionId } from '../../parser/normalize.js';
import type { FooterSectionMap } from '../footerSectionMap.js';

/**
 * Section start anchor (Phase 1 output)
 */
interface SectionStart {
  /** Section ID (e.g., "23 05 00") */
  sectionId: string;
  /** Normalized section ID */
  normalizedId: string;
  /** 0-based page index where section starts */
  startPage: number;
  /** Y coordinate of section start on page */
  startY: number;
  /** Section title (if found) */
  title?: string;
  /** Confidence score */
  confidence: number;
}

/**
 * Detected section information (Phase 2 output)
 */
interface DetectedSection {
  sectionId: string;
  normalizedId: string;
  startPage: number;
  endPage: number;
  title?: string;
  confidence: number;
}

/**
 * Options for section detection
 */
export interface SectionDetectionOptions {
  /** Expected minimum section count (for hard-fail validation) */
  minSectionCount?: number;
  /** Expected maximum section count (for hard-fail validation) */
  maxSectionCount?: number;
  /** Custom section pattern (overrides default) */
  customPattern?: string;
  /** Footer section map to use as primary boundary source */
  footerSectionMap?: FooterSectionMap;
  /** Boundary source: 'footer' | 'heading' | 'auto' (default: 'auto') */
  boundarySource?: 'footer' | 'heading' | 'auto';
  /** Minimum page coverage for footer to be used (default: 0.8) */
  footerMinCoverage?: number;
  /** Minimum unique sections for footer to be used (default: 15) */
  footerMinSections?: number;
}

/**
 * Detect sections in a spec PDF using three-phase grammar
 */
export async function detectSections(
  docContext: DocumentContext,
  customPattern?: string,
  options?: SectionDetectionOptions
): Promise<DetectedSection[]> {
  const opts = options || {};
  const minCount = opts.minSectionCount;
  const maxCount = opts.maxSectionCount;
  const boundarySource = opts.boundarySource || 'auto';
  const footerMinCoverage = opts.footerMinCoverage ?? 0.8;
  const footerMinSections = opts.footerMinSections ?? 15;
  
  // Check if we should use footer-first segmentation
  let useFooter = false;
  if (boundarySource === 'footer') {
    useFooter = true;
  } else if (boundarySource === 'auto' && opts.footerSectionMap) {
    const map = opts.footerSectionMap;
    const pageCoverage = map.stats.pagesTagged / map.stats.pagesTotal;
    useFooter = map.stats.uniqueSections >= footerMinSections && pageCoverage >= footerMinCoverage;
  }
  
  let sections: DetectedSection[];
  
  if (useFooter && opts.footerSectionMap) {
    // Use footer-first segmentation
    sections = phase2SectionScopingFromFooter(opts.footerSectionMap, docContext.pageCount);
  } else {
    // Use heading-based discovery (existing behavior)
    const sectionStarts = await phase1SectionRootDiscovery(docContext, customPattern);
    
    // Hard-fail validation: section count must be in expected range
    if (minCount !== undefined && sectionStarts.length < minCount) {
      throw new Error(
        `Section count validation failed: found ${sectionStarts.length} sections, expected at least ${minCount}`
      );
    }
    if (maxCount !== undefined && sectionStarts.length > maxCount) {
      throw new Error(
        `Section count validation failed: found ${sectionStarts.length} sections, expected at most ${maxCount}`
      );
    }
    
    // Phase 2: Section scoping
    sections = phase2SectionScoping(sectionStarts, docContext.pageCount);
  }
  
  return sections;
}

/**
 * Phase 1: Section root discovery
 * 
 * Detects ONLY literal SECTION NN NN NN starts.
 * Allows multi-line heading blocks.
 * Ignores PART / ARTICLE / END OF SECTION entirely.
 */
async function phase1SectionRootDiscovery(
  docContext: DocumentContext,
  _customPattern?: string
): Promise<SectionStart[]> {
  const pageCount = docContext.pageCount;
  const sectionStarts: SectionStart[] = [];
  
  // Strict SECTION pattern: ^SECTION\s+\d{2}\s+\d{2}\s+\d{2}\b
  const strictSectionPattern = /^SECTION\s+(\d{2}\s+\d{2}\s+\d{2})\b/i;
  
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const pageContext = await docContext.getPageContext(pageIndex);
    await docContext.extractTextForPage(pageIndex);
    
    const textItems = pageContext.getTextItems();
    const pageHeight = pageContext.pageHeight;
    
    // Reconstruct lines from text items based on Y coordinates
    // This is necessary because getText() joins items with spaces, not newlines
    const lines = reconstructLinesFromTextItems(textItems);
    
    // Also get plain text (joined with spaces) as a fallback
    // This handles cases where SECTION and ID might be in different text items
    const pageText = pageContext.getText();
    
    // Search for SECTION starts on this page
    // Allow multi-line heading blocks
    // First try: search in reconstructed lines
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex].text.trim();
      const match = line.match(strictSectionPattern);
      
      if (match) {
        // Process match (code continues below)
      } else {
        // Also check if line contains "SECTION" and next line contains the ID pattern
        if (line.match(/^SECTION\s*$/i) && lineIndex + 1 < lines.length) {
          const nextLine = lines[lineIndex + 1].text.trim();
          const idMatch = nextLine.match(/^(\d{2}\s+\d{2}\s+\d{2})\b/);
          if (idMatch) {
            // Treat as SECTION match with ID on next line
            const sectionId = idMatch[1];
            const normalizedId = normalizeSpecsSectionId(sectionId);
            
            // Reject Division 01 references
            if (normalizedId.startsWith('01 ')) {
              continue;
            }
            
            // Use the Y coordinate of the SECTION line
            const sectionY = lines[lineIndex].y;
            
            // Validate position (same validation as below)
            if (validateSectionPosition(sectionY, pageHeight)) {
              // Extract title from subsequent lines
              const title = extractTitleFromLines(lines, lineIndex + 2, 2);
              
              // Add section start
              addSectionStart(sectionStarts, {
                sectionId,
                normalizedId,
                startPage: pageIndex,
                startY: sectionY,
                title,
                confidence: 0.9,
              });
            }
          }
        }
        continue;
      }
      
      if (match) {
        const sectionId = match[1];
        const normalizedId = normalizeSpecsSectionId(sectionId);
        
        // Reject Division 01 references
        if (normalizedId.startsWith('01 ')) {
          continue;
        }
        
        // Find the Y coordinate of this SECTION text
        let sectionY: number | null = null;
        const sectionText = `SECTION ${sectionId}`;
        
        // Search in text items for exact match
        for (const item of textItems) {
          if (item.str.includes(sectionText) || item.str.includes(`SECTION ${normalizedId}`)) {
            sectionY = item.y;
            break;
          }
        }
        
        // If not found, estimate from line position
        if (sectionY === null) {
          // Estimate: assume lines are roughly evenly spaced
          const headerThreshold = pageHeight * 0.15;
          const estimatedY = headerThreshold + (lineIndex * 20); // Rough estimate
          sectionY = estimatedY;
        }
        
        // Validate position: reject if in chrome band or bottom 25% of page
        if (!validateSectionPosition(sectionY, pageHeight)) {
          continue;
        }
        
        // Extract section title (allow multi-line heading blocks)
        const title = extractTitleFromLines(lines, lineIndex, 2);
        
        // Calculate confidence
        let confidence = 0.9; // Base confidence for strict SECTION match
        if (sectionY !== null) {
          // Boost confidence if in good position (top 30% of usable area)
          const headerThreshold = pageHeight * 0.15;
          const top30Threshold = headerThreshold + (pageHeight * 0.15);
          if (sectionY < top30Threshold) {
            confidence = 1.0;
          }
        }
        
        // Add section start
        addSectionStart(sectionStarts, {
          sectionId,
          normalizedId,
          startPage: pageIndex,
          startY: sectionY || 0,
          title,
          confidence,
        });
      }
    }
    
    // Fallback: also search in plain text (handles cases where SECTION spans multiple items)
    // Use a more flexible pattern that allows SECTION and ID to be separated
    const flexiblePattern = /\bSECTION\s+(\d{2}\s+\d{2}\s+\d{2})\b/gi;
    let textMatch;
    while ((textMatch = flexiblePattern.exec(pageText)) !== null) {
      const sectionId = textMatch[1];
      const normalizedId = normalizeSpecsSectionId(sectionId);
      
      // Reject Division 01 references
      if (normalizedId.startsWith('01 ')) {
        continue;
      }
      
      // Check if we already found this section in line-based search
      const alreadyFound = sectionStarts.some(s => 
        s.normalizedId === normalizedId && s.startPage === pageIndex
      );
      if (alreadyFound) {
        continue;
      }
      
      // Find approximate Y position by searching text items
      let sectionY: number | null = null;
      for (const item of textItems) {
        if (item.str.includes('SECTION') || item.str.includes(sectionId)) {
          sectionY = item.y;
          break;
        }
      }
      
      // If still not found, use first item's Y as estimate
      if (sectionY === null && textItems.length > 0) {
        sectionY = textItems[0].y;
      }
      
      // Validate position
      if (sectionY !== null && validateSectionPosition(sectionY, pageHeight)) {
        // Extract title from text after the match
        const afterMatch = pageText.substring(textMatch.index! + textMatch[0].length);
        const titleMatch = afterMatch.match(/^\s*[-–—:]\s*(.+?)(?:\n|$)/);
        const title = titleMatch ? titleMatch[1].trim().substring(0, 200) : undefined;
        
        addSectionStart(sectionStarts, {
          sectionId,
          normalizedId,
          startPage: pageIndex,
          startY: sectionY,
          title,
          confidence: 0.85, // Slightly lower confidence for fallback match
        });
      }
    }
  }
  
  // Sort section starts by page index (document order)
  sectionStarts.sort((a, b) => a.startPage - b.startPage);
  
  return sectionStarts;
}

/**
 * Validate section position (not in chrome band, not in bottom 25%)
 */
function validateSectionPosition(sectionY: number, pageHeight: number): boolean {
  const headerThreshold = pageHeight * 0.15;
  const footerThreshold = pageHeight * 0.85;
  const usableHeight = footerThreshold - headerThreshold;
  const bottom25Threshold = headerThreshold + (usableHeight * 0.75);
  
  // Reject if in chrome band (top 15% or bottom 15%)
  if (sectionY < headerThreshold + 20 || sectionY > footerThreshold - 20) {
    return false;
  }
  
  // Reject if in bottom 25% of usable height
  if (sectionY > bottom25Threshold) {
    return false;
  }
  
  return true;
}

/**
 * Extract title from lines starting at given index
 */
function extractTitleFromLines(
  lines: ReconstructedLine[],
  startIndex: number,
  maxLines: number
): string | undefined {
  const titleLines: string[] = [];
  
  for (let i = 0; i < maxLines && startIndex + i < lines.length; i++) {
    const line = lines[startIndex + i].text.trim();
    // Stop if we hit another SECTION, PART, ARTICLE, or empty line
    if (
      line.match(/^SECTION\s+\d/i) ||
      line.match(/^PART\s+\d/i) ||
      line.match(/^ARTICLE\s+\d/i) ||
      line.length === 0
    ) {
      break;
    }
    titleLines.push(line);
  }
  
  if (titleLines.length > 0) {
    const title = titleLines.join(' ').trim();
    // Limit to 200 chars
    return title.length > 200 ? title.substring(0, 200) : title;
  }
  
  return undefined;
}

/**
 * Add section start, handling duplicates
 */
function addSectionStart(
  sectionStarts: SectionStart[],
  newStart: SectionStart
): void {
  const existingIndex = sectionStarts.findIndex(s => s.normalizedId === newStart.normalizedId);
  if (existingIndex >= 0) {
    // Duplicate section ID - keep the one with higher confidence or earlier page
    const existing = sectionStarts[existingIndex];
    if (newStart.confidence > existing.confidence || 
        (newStart.confidence === existing.confidence && newStart.startPage < existing.startPage)) {
      sectionStarts[existingIndex] = newStart;
    }
  } else {
    // New section start
    sectionStarts.push(newStart);
  }
}

/**
 * Reconstruct lines from text items based on Y coordinates
 */
interface ReconstructedLine {
  y: number;
  text: string;
  items: TextItemWithPosition[];
}

function reconstructLinesFromTextItems(
  textItems: TextItemWithPosition[]
): ReconstructedLine[] {
  const lineThreshold = 5; // Points - items within this Y distance are on the same line
  const lines: ReconstructedLine[] = [];
  
  // Sort items by Y (top to bottom), then X (left to right)
  const sortedItems = [...textItems]
    .filter(item => item.str.trim().length > 0)
    .sort((a, b) => {
      const yDiff = a.y - b.y; // Lower Y = higher on page
      if (Math.abs(yDiff) > lineThreshold) {
        return yDiff;
      }
      return a.x - b.x; // Same line: left to right
    });
  
  for (const item of sortedItems) {
    // Find existing line with similar Y coordinate
    let foundLine = false;
    for (const line of lines) {
      if (Math.abs(line.y - item.y) <= lineThreshold) {
        line.items.push(item);
        line.text += (line.text.length > 0 ? ' ' : '') + item.str;
        foundLine = true;
        break;
      }
    }
    
    // Create new line if no matching line found
    if (!foundLine) {
      lines.push({
        y: item.y,
        text: item.str,
        items: [item],
      });
    }
  }
  
  // Sort lines by Y (top to bottom)
  lines.sort((a, b) => a.y - b.y);
  
  return lines;
}

/**
 * Phase 2: Section scoping (from heading-based discovery)
 * 
 * A section spans from its start anchor to the next section start (or EOF).
 * END OF SECTION is NOT a delimiter.
 */
function phase2SectionScoping(
  sectionStarts: SectionStart[],
  pageCount: number
): DetectedSection[] {
  const sections: DetectedSection[] = [];
  
  if (sectionStarts.length === 0) {
    return sections;
  }
  
  // Each section spans from its start to the next section start (or EOF)
  for (let i = 0; i < sectionStarts.length; i++) {
    const start = sectionStarts[i];
    const nextStart = sectionStarts[i + 1];
    
    // End page is: next section start - 1, or pageCount - 1 for last section
    const endPage = nextStart ? nextStart.startPage - 1 : pageCount - 1;
    
    // Ensure endPage >= startPage
    const finalEndPage = Math.max(start.startPage, endPage);
    
    sections.push({
      sectionId: start.sectionId,
      normalizedId: start.normalizedId,
      startPage: start.startPage,
      endPage: finalEndPage,
      title: start.title,
      confidence: start.confidence,
    });
  }
  
  return sections;
}

/**
 * Phase 2: Section scoping (from footer section map)
 * 
 * Uses footer ranges as authoritative boundaries.
 * Optionally refines with heading detection for anchor positions.
 */
function phase2SectionScopingFromFooter(
  footerMap: FooterSectionMap,
  _pageCount: number
): DetectedSection[] {
  const sections: DetectedSection[] = [];
  
  for (const range of footerMap.ranges) {
    // Reject Division 01 references
    if (range.sectionId.startsWith('01 ')) {
      continue;
    }
    
    sections.push({
      sectionId: range.sectionId,
      normalizedId: range.sectionId,
      startPage: range.startPage,
      endPage: range.endPage,
      title: undefined, // Will be refined by heading detection if needed
      confidence: range.confidence,
    });
  }
  
  return sections;
}

/**
 * Convert detected sections to SpecSection format
 */
export function convertToSpecSections(
  detected: DetectedSection[]
): SpecSection[] {
  return detected.map((detectedSection) => ({
    id: `section-${detectedSection.normalizedId.replace(/\s+/g, '-')}-${detectedSection.startPage}`,
    sectionId: detectedSection.normalizedId,
    startPage: detectedSection.startPage,
    endPage: detectedSection.endPage,
    title: detectedSection.title,
    content: [], // Will be populated later by textExtractor (Phase 3)
  }));
}

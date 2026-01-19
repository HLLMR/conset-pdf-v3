/**
 * Layout-aware heading-based page resolution
 * 
 * Finds actual section and article headings in PDF text by searching only in
 * appropriate vertical regions (heading band, not body/footer/header).
 * This prevents matching cross-references in body text.
 */

import type { DocumentContext } from '../analyze/documentContext.js';
import type { TextItemWithPosition } from '../utils/pdf.js';

/**
 * Find page index for a SECTION heading
 * 
 * Requirements:
 * - MUST match "SECTION <code>" as a standalone heading-like line
 * - Search ONLY in heading band (top 0–30%)
 * - Prefer centered-ish headings (x within 10–90% of page width, line width not tiny)
 * - DO NOT match occurrences found only in body band or footer/header band
 * - If multiple matches exist, prefer the earliest page AFTER the previous section start (if known), else earliest overall.
 */
export async function findSectionHeadingPage(
  docContext: DocumentContext,
  sectionId: string,
  pageCount: number,
  startFromPage: number = 0,
  previousSectionStartPage?: number
): Promise<number> {
  // Normalize section ID (e.g., "23 07 00")
  const normalizedSectionId = sectionId.trim().replace(/\s+/g, '\\s+');
  const sectionPattern = new RegExp(`^\\s*SECTION\\s+${normalizedSectionId}\\s*$`, 'im');
  
  let bestMatch = -1;
  let bestScore = 0;
  
  // Search from startFromPage to end
  for (let pageIndex = startFromPage; pageIndex < pageCount; pageIndex++) {
    try {
      await docContext.extractTextForPage(pageIndex);
      const pageContext = await docContext.getPageContext(pageIndex);
      const textItems = pageContext.getTextItems();
      const pageWidth = pageContext.pageWidth;
      const pageHeight = pageContext.pageHeight;
      
      // Define heading band: top 0-30% of page height
      const headingBandTop = 0;
      const headingBandBottom = pageHeight * 0.30;
      
      // Group items into lines (items with similar y coordinates)
      const lineGroups = new Map<number, TextItemWithPosition[]>();
      const yTolerance = 5; // pixels
      
      for (const item of textItems) {
        const itemCenterY = item.y + item.height / 2;
        
        // Only consider items in heading band
        if (itemCenterY < headingBandTop || itemCenterY >= headingBandBottom) {
          continue;
        }
        
        // Group by y coordinate (rounded to nearest tolerance)
        const yKey = Math.round(item.y / yTolerance) * yTolerance;
        if (!lineGroups.has(yKey)) {
          lineGroups.set(yKey, []);
        }
        lineGroups.get(yKey)!.push(item);
      }
      
      // Process each line group
      for (const [, items] of lineGroups.entries()) {
        // Sort items in line by x coordinate
        items.sort((a, b) => a.x - b.x);
        
        // Concatenate text in the line
        const lineText = items.map(item => item.str).join(' ').trim();
        
        // Check if line matches section pattern
        if (sectionPattern.test(lineText)) {
          // Calculate line properties for scoring
          const lineX = Math.min(...items.map(item => item.x));
          const lineWidth = Math.max(...items.map(item => item.x + item.width)) - lineX;
          const lineCenterX = lineX + lineWidth / 2;
          
          // Score based on:
          // 1. Position in heading band (higher = better, closer to top)
          // 2. Horizontal centering (prefer 10-90% of page width)
          // 3. Line width (prefer not tiny)
          // 4. Page order (prefer after previous section if known)
          
          const normalizedY = (items[0].y) / pageHeight; // 0 = top, 1 = bottom
          const positionScore = (1.0 - normalizedY) * 1000; // Higher for items near top
          
          const normalizedX = lineCenterX / pageWidth;
          const centeringScore = (normalizedX >= 0.10 && normalizedX <= 0.90) ? 500 : 0;
          
          const widthScore = lineWidth > pageWidth * 0.1 ? 200 : 0; // Prefer lines that aren't tiny
          
          const pageOrderScore = (previousSectionStartPage !== undefined && pageIndex > previousSectionStartPage) ? 100 : 0;
          
          const totalScore = positionScore + centeringScore + widthScore + pageOrderScore;
          
          if (totalScore > bestScore) {
            bestScore = totalScore;
            bestMatch = pageIndex;
          }
        }
      }
    } catch (e) {
      continue;
    }
  }
  
  return bestMatch;
}

/**
 * Find page index for an Article heading
 * 
 * Requirements:
 * - Search ONLY in heading band or upper body (top 0–40%)
 * - Require anchor to start the line (or near-start after whitespace)
 * - Avoid matches where the anchor appears mid-sentence
 */
export async function findArticleHeadingPage(
  docContext: DocumentContext,
  articleAnchor: string,
  pageCount: number,
  sectionStartPage: number = 0,
  sectionEndPage?: number
): Promise<number> {
  // Extract numeric part from anchor (e.g., "1.3" from "1.3")
  const numericMatch = articleAnchor.match(/^(\d+\.\d+)/);
  if (!numericMatch) {
    return -1; // Not a numeric article anchor
  }
  
  const numericPart = numericMatch[1];
  const anchorPattern = new RegExp(`^\\s*${numericPart.replace('.', '\\.')}\\s+[A-Z][A-Z\\s]{3,}`, 'im');
  
  let bestMatch = -1;
  let bestScore = 0;
  
  // Search within section range if provided, otherwise search from sectionStartPage
  const searchStart = sectionStartPage;
  const searchEnd = sectionEndPage !== undefined ? Math.min(sectionEndPage, pageCount) : pageCount;
  
  for (let pageIndex = searchStart; pageIndex < searchEnd; pageIndex++) {
    try {
      await docContext.extractTextForPage(pageIndex);
      const pageContext = await docContext.getPageContext(pageIndex);
      const textItems = pageContext.getTextItems();
      const pageHeight = pageContext.pageHeight;
      
      // Define search band: top 0-40% of page height
      const searchBandTop = 0;
      const searchBandBottom = pageHeight * 0.40;
      
      // Group items into lines
      const lineGroups = new Map<number, TextItemWithPosition[]>();
      const yTolerance = 5;
      
      for (const item of textItems) {
        const itemCenterY = item.y + item.height / 2;
        
        // Only consider items in search band
        if (itemCenterY < searchBandTop || itemCenterY >= searchBandBottom) {
          continue;
        }
        
        const yKey = Math.round(item.y / yTolerance) * yTolerance;
        if (!lineGroups.has(yKey)) {
          lineGroups.set(yKey, []);
        }
        lineGroups.get(yKey)!.push(item);
      }
      
      // Process each line group
      for (const [, items] of lineGroups.entries()) {
        items.sort((a, b) => a.x - b.x);
        const lineText = items.map(item => item.str).join(' ').trim();
        
        // Check if line starts with anchor pattern
        if (anchorPattern.test(lineText)) {
          // Verify anchor is at start of line (not mid-sentence)
          const trimmedLine = lineText.trim();
          if (!trimmedLine.startsWith(numericPart)) {
            // Check if it's near-start after whitespace
            const match = trimmedLine.match(new RegExp(`^\\s*${numericPart.replace('.', '\\.')}`));
            if (!match) {
              continue; // Anchor appears mid-sentence, skip
            }
          }
          
          // Score based on position and section range
          const normalizedY = (items[0].y) / pageHeight;
          const positionScore = (1.0 - normalizedY) * 1000;
          
          const sectionBonus = (sectionEndPage !== undefined && pageIndex >= sectionStartPage && pageIndex <= sectionEndPage) ? 1000 : 0;
          
          const totalScore = positionScore + sectionBonus;
          
          if (totalScore > bestScore) {
            bestScore = totalScore;
            bestMatch = pageIndex;
          }
        }
      }
    } catch (e) {
      continue;
    }
  }
  
  return bestMatch;
}

/**
 * Determine section page boundaries
 * 
 * Returns map of sectionId -> { startPage, endPage } (0-based)
 */
export async function determineSectionBoundaries(
  docContext: DocumentContext,
  sectionIds: string[],
  pageCount: number
): Promise<Map<string, { startPage: number; endPage: number }>> {
  const boundaries = new Map<string, { startPage: number; endPage: number }>();
  
  // Find start page for each section
  // IMPORTANT: Search from beginning each time to find FIRST occurrence
  const sectionStartPages: Array<{ id: string; startPage: number }> = [];
  
  // Track previous section start for ordering preference
  let previousSectionStart = -1;
  
  for (const sectionId of sectionIds) {
    // Always search from page 0 to find the FIRST occurrence
    // Pass previousSectionStart to prefer pages after previous section
    const startPage = await findSectionHeadingPage(
      docContext,
      sectionId,
      pageCount,
      0,
      previousSectionStart >= 0 ? previousSectionStart : undefined
    );
    if (startPage >= 0) {
      sectionStartPages.push({ id: sectionId, startPage });
      previousSectionStart = startPage;
    }
  }
  
  // Sort by start page (this ensures sections are in document order)
  sectionStartPages.sort((a, b) => a.startPage - b.startPage);
  
  // Determine end pages (next section start - 1, or pageCount - 1 for last section)
  for (let i = 0; i < sectionStartPages.length; i++) {
    const section = sectionStartPages[i];
    const nextSection = sectionStartPages[i + 1];
    const endPage = nextSection ? nextSection.startPage - 1 : pageCount - 1;
    
    boundaries.set(section.id, {
      startPage: section.startPage,
      endPage: Math.max(section.startPage, endPage), // Ensure endPage >= startPage
    });
  }
  
  return boundaries;
}

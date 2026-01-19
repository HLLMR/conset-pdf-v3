/**
 * Section detection for specs PDFs
 * 
 * Detects section headers (e.g., "23 09 00") and groups pages by section.
 */

import { DocumentContext } from '../../analyze/documentContext.js';
import { SpecsSectionLocator } from '../../locators/specsSectionLocator.js';
import type { SpecSection } from '../ast/types.js';

/**
 * Detected section information
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
 * Detect sections in a spec PDF
 */
export async function detectSections(
  docContext: DocumentContext,
  customPattern?: string
): Promise<DetectedSection[]> {
  const locator = new SpecsSectionLocator(customPattern);
  const pageCount = docContext.pageCount;
  const sections: DetectedSection[] = [];
  
  let currentSection: DetectedSection | null = null;
  
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const pageContext = await docContext.getPageContext(pageIndex);
    await docContext.extractTextForPage(pageIndex);
    
    const locationResult = await locator.locate(pageContext);
    
    if (locationResult.normalizedId && locationResult.confidence > 0.5) {
      const normalizedId = locationResult.normalizedId;
      
      // Check if this is a new section
      if (!currentSection || currentSection.normalizedId !== normalizedId) {
        // Close previous section
        if (currentSection) {
          currentSection.endPage = pageIndex; // 0-based, will convert to 1-based later
          sections.push(currentSection);
        }
        
        // Start new section
        currentSection = {
          sectionId: locationResult.id || normalizedId,
          normalizedId,
          startPage: pageIndex,
          endPage: pageIndex,
          confidence: locationResult.confidence,
        };
        
        // Try to extract section title from page text
        const pageText = pageContext.getText();
        const title = extractSectionTitle(pageText, normalizedId);
        if (title) {
          currentSection.title = title;
        }
      } else {
        // Same section, update end page
        currentSection.endPage = pageIndex;
        // Update confidence if higher
        if (locationResult.confidence > currentSection.confidence) {
          currentSection.confidence = locationResult.confidence;
        }
      }
    } else {
      // No section ID found on this page
      // If we have a current section, extend it
      if (currentSection) {
        currentSection.endPage = pageIndex;
      }
    }
  }
  
  // Close final section
  if (currentSection) {
    sections.push(currentSection);
  }
  
  // Return sections with 0-based page indices
  // NOTE: The SpecSection type says "1-based" but the actual implementation uses 0-based
  // This is a known inconsistency - textExtractor treats startPage as 1-based in its loop
  // but convertToSpecSections receives 0-based values
  // For now, return 0-based to match the actual usage in textExtractor and bookmarkTreeGenerator
  return sections; // Keep 0-based for now - textExtractor will convert when using it
}

/**
 * Extract section title from page text
 * Looks for text immediately following section ID
 */
function extractSectionTitle(pageText: string, sectionId: string): string | undefined {
  // Look for section ID in text
  const idIndex = pageText.indexOf(sectionId);
  if (idIndex === -1) {
    return undefined;
  }
  
  // Get text after section ID (up to 100 chars, stop at newline or dash)
  const afterId = pageText.substring(idIndex + sectionId.length);
  const titleMatch = afterId.match(/^\s*[-–—:]\s*(.+?)(?:\n|$)/);
  
  if (titleMatch) {
    const title = titleMatch[1].trim();
    // Limit to 100 chars
    return title.length > 100 ? title.substring(0, 100) : title;
  }
  
  // Try to get first line after section ID
  const lines = afterId.split('\n');
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    if (firstLine.length > 0 && firstLine.length <= 100) {
      return firstLine;
    }
  }
  
  return undefined;
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
    content: [], // Will be populated later
  }));
}

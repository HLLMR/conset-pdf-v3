/**
 * Text extraction from narrative PDFs
 * 
 * Extracts page-aware text from PDF files for narrative processing.
 * Uses DocumentContext to comply with architecture constraints.
 */

import { createHash } from 'crypto';
import { DocumentContext } from '../analyze/documentContext.js';
import type { NarrativeTextDocument } from './types.js';

/**
 * Extract text from a narrative PDF with page awareness
 * 
 * @param pdfPath - Path to the narrative PDF file
 * @returns NarrativeTextDocument with page-aware text and file hash
 */
export async function extractNarrativeTextFromPdf(
  pdfPath: string
): Promise<NarrativeTextDocument> {
  // Use DocumentContext to extract text (complies with architecture)
  const docContext = new DocumentContext(pdfPath);
  await docContext.initialize();
  
  // Get PDF bytes from DocumentContext for hashing (metadata operation)
  const pdfBytes = docContext.getPdfBytes();
  // Verify bytes are not empty
  if (pdfBytes.length === 0) {
    throw new Error('PDF bytes are empty - file may not have been loaded correctly');
  }
  // Node's crypto.createHash accepts Uint8Array directly
  const fileHash = createHash('sha256').update(pdfBytes).digest('hex');
  
  const pageCount = docContext.pageCount;
  const pages: Array<{ pageNumber: number; text: string }> = [];
  const fullTextParts: string[] = [];
  
  // Extract text from each page using DocumentContext
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const pageContext = await docContext.getPageContext(pageIndex);
    await docContext.extractTextForPage(pageIndex);
    
    // Get text items with positions to reconstruct line breaks
    const textItems = pageContext.getTextItems();
    
    // Reconstruct text with line breaks based on Y position changes
    // Sort items by Y position (top to bottom, higher Y = top) then X (left to right)
    const sortedItems = [...textItems]
      .filter(item => item.str.trim().length > 0) // Skip empty items
      .sort((a, b) => {
        const lineBreakThreshold = 5;
        const yDiff = a.y - b.y; // Lower Y = higher on page (top to bottom)
        if (Math.abs(yDiff) > lineBreakThreshold) {
          return yDiff; // Different lines
        }
        return a.x - b.x; // Same line: left to right
      });
    
    let pageText = '';
    let lastY = -1;
    const lineBreakThreshold = 5; // Points - if Y changes by more than this, it's a new line
    
    for (const item of sortedItems) {
      // Check if we need a line break
      if (lastY >= 0 && Math.abs(item.y - lastY) > lineBreakThreshold) {
        pageText += '\n';
      } else if (pageText.length > 0 && !pageText.endsWith('\n') && !pageText.endsWith(' ')) {
        // Add space between items on same line
        pageText += ' ';
      }
      
      pageText += item.str;
      lastY = item.y;
    }
    
    // Normalize text (unicode, dashes, whitespace)
    const normalizedText = normalizeText(pageText);
    
    pages.push({
      pageNumber: pageIndex + 1, // 1-based
      text: normalizedText,
    });
    
    fullTextParts.push(normalizedText);
  }
  
  // Combine all pages with page separators
  const fullText = fullTextParts.join('\n\n--- PAGE BREAK ---\n\n');
  
  return {
    fileHash,
    pageCount,
    pages,
    fullText,
  };
}

/**
 * Normalize extracted text before parsing
 * - Convert non-breaking spaces to regular spaces
 * - Normalize unicode dashes (en/em) to "-"
 * - Normalize weird bullets to spaces
 * - Collapse excessive whitespace while preserving line breaks
 */
function normalizeText(text: string): string {
  // Normalize line endings
  let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Convert non-breaking spaces to regular spaces
  normalized = normalized.replace(/\u00A0/g, ' ');
  
  // Normalize unicode dashes (en-dash, em-dash, etc.) to regular dash
  normalized = normalized.replace(/[\u2013\u2014\u2015\u2212]/g, '-');
  
  // Normalize weird bullets to spaces
  normalized = normalized.replace(/[\u2022\u2023\u25E6\u2043\u2219]/g, ' ');
  
  // Collapse multiple spaces but preserve line breaks
  normalized = normalized.replace(/[ \t]+/g, ' ');
  
  // Trim trailing spaces from each line
  normalized = normalized.split('\n').map(line => line.trimEnd()).join('\n');
  
  // Remove excessive blank lines (more than 2 consecutive)
  normalized = normalized.replace(/\n{3,}/g, '\n\n');
  
  return normalized;
}


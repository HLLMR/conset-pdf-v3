import { PDFDocument } from 'pdf-lib';
import type { ConsetDocType } from '../index.js';
import { extractPageTextWithPositions, autoDetectTitleBlock } from './pdf.js';
import { findSheetIdWithFullDetection } from '../parser/drawingsSheetId.js';
import type { TextItemWithPosition } from './pdf.js';

/**
 * Extract sheet title from title block (text near sheet number)
 */
export function extractSheetTitle(
  sheetIdItem: TextItemWithPosition,
  titleBlockItems: TextItemWithPosition[]
): string | null {
  // Look for text items near the sheet number that might be the title
  // Typically the title is above or to the left of the sheet number
  const searchRadius = 200; // points
  
  // Find text items near the sheet number
  const nearbyItems = titleBlockItems.filter(item => {
    const dx = Math.abs(item.x - sheetIdItem.x);
    const dy = Math.abs(item.y - sheetIdItem.y);
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < searchRadius && item !== sheetIdItem;
  });
  
  // Filter out items that look like sheet numbers, dates, or other metadata
  const titleCandidates = nearbyItems.filter(item => {
    const text = item.str.trim();
    // Skip if it looks like a sheet number pattern
    if (/^[A-Z]{1,3}\s*\d+/.test(text)) {
      return false;
    }
    // Skip if it's a date
    if (/\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}/.test(text)) {
      return false;
    }
    // Skip if it's very short (likely metadata)
    if (text.length < 3) {
      return false;
    }
    // Skip common metadata words and approval/author info
    const metadataWords = ['SHEET', 'NO', 'DWG', 'DRAWING', 'REV', 'DATE', 'SCALE', 'SIZE', 
                           'APPROVED', 'CHECKED', 'DRAWN', 'BY', 'AUTHOR', 'CHECKER', 'APPROVER'];
    if (metadataWords.some(word => text.toUpperCase().includes(word))) {
      return false;
    }
    // Skip initials/names (typically 2-3 uppercase letters, possibly with period)
    // But don't filter out common words like "ONE", "TWO", "ALL", etc.
    // Only filter if it looks like initials (2-3 letters, often followed by period or very short)
    const commonWords = new Set(['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN',
                                 'ALL', 'NEW', 'OLD', 'TOP', 'BOT', 'END', 'AND', 'THE', 'FOR', 'ARE']);
    if (/^[A-Z]{2,3}$/.test(text) && !commonWords.has(text.toUpperCase())) {
      // Also check if it's likely initials (very short, and might be near other initials)
      return false;
    }
    return true;
  });
  
  if (titleCandidates.length === 0) {
    return null;
  }
  
  // Prefer items above the sheet number (titles are typically above)
  const aboveItems = titleCandidates.filter(item => item.y < sheetIdItem.y);
  const candidates = aboveItems.length > 0 ? aboveItems : titleCandidates;
  
  // Sort by proximity to sheet number
  candidates.sort((a, b) => {
    const distA = Math.sqrt(
      Math.pow(a.x - sheetIdItem.x, 2) + Math.pow(a.y - sheetIdItem.y, 2)
    );
    const distB = Math.sqrt(
      Math.pow(b.x - sheetIdItem.x, 2) + Math.pow(b.y - sheetIdItem.y, 2)
    );
    return distA - distB;
  });
  
  // Combine nearby text items into a title
  const titleParts: string[] = [];
  const usedItems = new Set<TextItemWithPosition>();
  
  for (const candidate of candidates.slice(0, 5)) { // Limit to 5 candidates
    if (usedItems.has(candidate)) continue;
    
    // Find items on the same line (similar Y coordinate)
    const lineItems = candidates.filter(item => {
      if (usedItems.has(item)) return false;
      const yDiff = Math.abs(item.y - candidate.y);
      return yDiff < 10; // Same line
    });
    
    // Sort by X coordinate (left to right)
    lineItems.sort((a, b) => a.x - b.x);
    
    // Combine into title, handling hyphens properly
    // If an item ends with a hyphen, join it with the next item without a space
    // Also check horizontal proximity - items very close together might be hyphenated words
    const lineTextParts: string[] = [];
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i].str.trim();
      if (item.length === 0) continue;
      
      const prevItem = i > 0 ? lineItems[i - 1] : null;
      const horizontalGap = prevItem ? (lineItems[i].x - (prevItem.x + prevItem.width)) : Infinity;
      
      // If previous part ends with hyphen, join without space
      if (lineTextParts.length > 0 && lineTextParts[lineTextParts.length - 1].endsWith('-')) {
        lineTextParts[lineTextParts.length - 1] += item;
      } 
      // If items are very close together (within ~5 points, typical for hyphenated words)
      // and the previous item doesn't end with punctuation, they might be a hyphenated word
      // But be conservative - only do this if the gap is very small (< 3 points)
      else if (prevItem && horizontalGap >= 0 && horizontalGap < 3 && 
               !lineTextParts[lineTextParts.length - 1].match(/[.!?;:,\-]$/)) {
        // Check if this looks like a hyphenated compound word pattern
        // Common patterns: ALL-CAPS words, or words that form common compounds
        const prevText = lineTextParts[lineTextParts.length - 1].toUpperCase();
        const currText = item.toUpperCase();
        // If both are short words (likely parts of a compound) and gap is tiny, join with hyphen
        if (prevText.length <= 6 && currText.length <= 6 && horizontalGap < 2) {
          lineTextParts[lineTextParts.length - 1] += '-' + item;
        } else {
          lineTextParts.push(item);
        }
      } else {
        lineTextParts.push(item);
      }
    }
    const lineText = lineTextParts.join(' ').trim();
    if (lineText.length > 0) {
      titleParts.push(lineText);
      lineItems.forEach(item => usedItems.add(item));
    }
  }
  
  if (titleParts.length === 0) {
    return null;
  }
  
  // Combine title parts with single space (not ' - ') to preserve hyphenated words
  // Only use ' - ' if there's a clear semantic break (e.g., "#6 - EXISTING")
  const title = titleParts.join(' ').trim();
  const maxLength = 100; // Reasonable limit for bookmark titles
  return title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
}

/**
 * Generate bookmarks for a PDF based on detected sheet numbers and titles
 */
export async function generateBookmarks(
  pdfPath: string,
  pdfDoc: PDFDocument,
  type: ConsetDocType,
  customPattern?: string,
  verbose: boolean = false
): Promise<void> {
  if (type !== 'drawings') {
    if (verbose) {
      console.log('Bookmark generation only supported for drawings type');
    }
    return;
  }
  
  if (verbose) {
    console.log('\n[Bookmarks] Generating bookmarks from detected sheet numbers...');
  }
  
  const pageCount = pdfDoc.getPageCount();
  const bookmarks: Array<{ title: string; pageIndex: number }> = [];
  
  for (let i = 0; i < pageCount; i++) {
    if (verbose && (i === 0 || (i + 1) % 20 === 0)) {
      console.log(`  Processing page ${i + 1}/${pageCount} for bookmark...`);
    }
    
    // Find sheet ID
    const parsed = await findSheetIdWithFullDetection(pdfPath, i, customPattern, false);
    
    if (!parsed || parsed.confidence < 0.60) {
      // Skip pages without reliable sheet IDs
      continue;
    }
    
    // Extract title from title block
    const titleBlockBounds = await autoDetectTitleBlock(pdfPath, i, false);
    const pageData = await extractPageTextWithPositions(pdfPath, i);
    
    let title: string | null = null;
    
    if (pageData && parsed.source === 'title-block') {
      // Find the sheet ID item in the title block
      const titleBlockItems = pageData.items.filter(item => {
        const itemRight = item.x + item.width;
        const itemBottom = item.y + item.height;
        return item.x >= titleBlockBounds.x &&
               item.y >= titleBlockBounds.y &&
               itemRight <= titleBlockBounds.x + titleBlockBounds.width &&
               itemBottom <= titleBlockBounds.y + titleBlockBounds.height;
      });
      
      // Find the text item that matches the sheet ID
      const sheetIdItem = titleBlockItems.find(item => {
        const text = item.str.trim();
        return text.includes(parsed.id) || text.includes(parsed.normalized);
      });
      
      if (sheetIdItem) {
        title = extractSheetTitle(sheetIdItem, titleBlockItems);
      }
    }
    
    // Format bookmark: "[sheet no] - [title]" or just "[sheet no]" if no title
    const bookmarkTitle = title 
      ? `${parsed.id} - ${title}`
      : parsed.id;
    
    bookmarks.push({
      title: bookmarkTitle,
      pageIndex: i,
    });
    
    if (verbose) {
      console.log(`  ✓ Page ${i + 1}: "${bookmarkTitle}"`);
    }
  }
  
  if (bookmarks.length === 0) {
    if (verbose) {
      console.log('  No bookmarks generated (no sheet IDs found)');
    }
    return;
  }
  
  // Remove existing bookmarks by clearing the outline
  try {
    const catalog = pdfDoc.catalog;
    if (catalog && (catalog as any).dict) {
      (catalog as any).dict.delete('Outlines');
    }
  } catch (e) {
    // Ignore if outlines don't exist
  }
  
  // Create bookmarks using pdf-lib's outline API
  // pdf-lib's bookmark support is limited - we'll use a workaround approach
  try {
    const { PDFDict, PDFName, PDFString, PDFArray } = await import('pdf-lib');
    
    if (bookmarks.length === 0) {
      if (verbose) {
        console.log('  No bookmarks to create');
      }
      return;
    }
    
    // Create outline items as a simple linked list (forward only to avoid circular refs)
    const outlineItemRefs: any[] = [];
    
    for (let i = 0; i < bookmarks.length; i++) {
      const bookmark = bookmarks[i];
      try {
        const page = pdfDoc.getPage(bookmark.pageIndex);
        const pageRef = page.ref;
        
        // Create outline item dictionary
        const outlineItem = PDFDict.withContext(pdfDoc.context);
        outlineItem.set(PDFName.of('Title'), PDFString.of(bookmark.title));
        
        // Create destination
        const destArray = PDFArray.withContext(pdfDoc.context);
        destArray.push(pageRef);
        destArray.push(PDFName.of('XYZ'));
        destArray.push(pdfDoc.context.obj(null));
        destArray.push(pdfDoc.context.obj(null));
        destArray.push(pdfDoc.context.obj(null));
        
        outlineItem.set(PDFName.of('Dest'), destArray);
        
        // Link to next item (if exists)
        if (i < bookmarks.length - 1) {
          // We'll set this after creating all items
        }
        
        outlineItemRefs.push(outlineItem);
      } catch (error: any) {
        if (verbose) {
          console.log(`  ⚠️  Failed to create bookmark for page ${bookmark.pageIndex + 1}: ${error?.message}`);
        }
      }
    }
    
    if (outlineItemRefs.length === 0) {
      return;
    }
    
    // Link items (forward only)
    for (let i = 0; i < outlineItemRefs.length - 1; i++) {
      outlineItemRefs[i].set(PDFName.of('Next'), outlineItemRefs[i + 1]);
    }
    
    // Create outline dictionary
    const outlineDict = PDFDict.withContext(pdfDoc.context);
    outlineDict.set(PDFName.of('Type'), PDFName.of('Outlines'));
    outlineDict.set(PDFName.of('First'), outlineItemRefs[0]);
    outlineDict.set(PDFName.of('Last'), outlineItemRefs[outlineItemRefs.length - 1]);
    outlineDict.set(PDFName.of('Count'), pdfDoc.context.obj(outlineItemRefs.length));
    
    // Add to catalog - use direct dict access
    const catalog = pdfDoc.catalog as any;
    const catalogDict = catalog?.dict || catalog;
    if (catalogDict) {
      catalogDict.set(PDFName.of('Outlines'), outlineDict);
    }
    
    if (verbose) {
      console.log(`\n[Bookmarks] Generated ${bookmarks.length} bookmark(s)`);
      console.log(`  Note: Bookmarks created. If not visible, pdf-lib bookmark support may be limited.`);
    }
  } catch (error: any) {
    if (verbose) {
      console.log(`  ⚠️  Failed to create bookmarks: ${error?.message}`);
      console.log(`  Note: pdf-lib has limited bookmark support. Consider using a PDF tool to add bookmarks manually.`);
    }
    // Don't throw - bookmarks are optional
  }
}

import { normalizeDrawingsSheetId } from './normalize.js';
import type { TextItemWithPosition, TitleBlockBounds } from '../utils/pdf.js';

export interface ParsedId {
  id: string;
  normalized: string;
  confidence: number;
  pageIndex: number;
  source: 'bookmark' | 'title-block' | 'lines' | 'text';
  warning?: string;
  context?: string; // Additional context about where the ID was found
}

/**
 * Default regex for detecting drawings sheet IDs
 * Pattern matches: M1-01, M1.01, M1 01, S1.0, E2-101A, M1.11ES, etc.
 * Updated to handle decimal numbers like S1.0 and multi-letter suffixes like ES, DN, etc.
 */
export const DEFAULT_DRAWINGS_PATTERN = /\b([A-Z]{1,3}\s*\d{0,2}\s*[-._ ]\s*\d{1,3}(?:\.\d+)?[A-Z]{0,3})\b/g;

/**
 * Anchor keywords that indicate sheet number location
 */
const ANCHOR_KEYWORDS = ['SHEET', 'SHT', 'DWG NO', 'DWG', 'DRAWING NO', 'DRAWING', 'SHEET NO', 'SHEET NO.', 'SHEETNUMBER'];

/**
 * Known discipline prefixes for construction drawings
 */
const DISCIPLINE_PREFIXES = new Set(['M', 'E', 'P', 'A', 'C', 'S', 'FP', 'FA', 'G', 'DG', 'H', 'L', 'Q', 'R', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']);

/**
 * Patterns that indicate false positives (measurements, references, etc.)
 */
const FALSE_POSITIVE_PATTERNS = [
  /^(OR|AND|LB|KG|CFR|EPA|PSI|GPM|CFM|BTU|TON|HP|KW|VOLT|AMP)\s*\d+/i, // "OR 250", "LB 125", "CFR 82", etc.
  /^\d+\s*(OR|AND|LB|KG|PSI|GPM|CFM|BTU|TON|HP|KW|VOLT|AMP)/i, // "125 LB", "250 LB", etc.
  /^(MIN|MAX|MIN\.|MAX\.)\s*\d+/i, // "MIN 1", "MIN. 1" (though MIN-1 might be valid)
];

/**
 * Check if page dimensions indicate a construction drawing (ANSI/ARCH sizes)
 */
function isConstructionDrawingSize(width: number, height: number): boolean {
  // ANSI/ARCH sizes in points (1 inch = 72 points)
  // Common sizes: ARCH A (9x12), ARCH B (12x18), ARCH C (18x24), ARCH D (24x36), ARCH E (36x48)
  // ANSI: A (8.5x11), B (11x17), C (17x22), D (22x34), E (34x44)
  
  const wInches = width / 72;
  const hInches = height / 72;
  
  // Check for landscape orientation and reasonable drawing sizes
  const isLandscape = width > height;
  const minSize = 8; // Minimum 8 inches
  const maxSize = 50; // Maximum 50 inches
  
  if (!isLandscape) {
    return false; // Construction drawings are landscape
  }
  
  // Check if dimensions match common drawing sizes (with tolerance)
  const commonSizes = [
    [9, 12], [12, 18], [18, 24], [24, 36], [36, 48], // ARCH
    [8.5, 11], [11, 17], [17, 22], [22, 34], [34, 44], // ANSI
  ];
  
  for (const [w, h] of commonSizes) {
    if (Math.abs(wInches - w) < 0.5 && Math.abs(hInches - h) < 0.5) {
      return true;
    }
    // Also check swapped (though shouldn't happen if landscape)
    if (Math.abs(wInches - h) < 0.5 && Math.abs(hInches - w) < 0.5) {
      return true;
    }
  }
  
  // If it's landscape and reasonable size, assume it's a drawing
  return wInches >= minSize && wInches <= maxSize && hInches >= minSize && hInches <= maxSize;
}

/**
 * Extract sheet ID from bookmark text
 */
function extractSheetIdFromBookmark(bookmarkTitle: string, customPattern?: string): string | null {
  const pattern = customPattern 
    ? new RegExp(customPattern, 'gi')
    : DEFAULT_DRAWINGS_PATTERN;
  
  const match = bookmarkTitle.match(pattern);
  if (match) {
    return match[1] || match[0];
  }
  
  return null;
}

/**
 * Enhanced confidence scoring for sheet ID candidates
 */
export function calculateEnhancedConfidence(
  id: string,
  item: TextItemWithPosition,
  titleBlockBounds: TitleBlockBounds | null,
  anchorKeywords: TextItemWithPosition[],
  allMatchesInPage: string[],
  allMatchesInROI: string[],
  pageWidth: number,
  pageHeight: number,
  verbose: boolean = false
): number {
  let confidence = 0.5; // Base confidence
  
  const normalizedId = normalizeDrawingsSheetId(id);
  
  // +0.3 if candidate is within title-block ROI
  if (titleBlockBounds) {
    const itemRight = item.x + item.width;
    const itemBottom = item.y + item.height;
    const inROI = item.x >= titleBlockBounds.x &&
                  item.y >= titleBlockBounds.y &&
                  itemRight <= titleBlockBounds.x + titleBlockBounds.width &&
                  itemBottom <= titleBlockBounds.y + titleBlockBounds.height;
    
    if (inROI) {
      confidence += 0.3;
      if (verbose) {
        console.log(`    [+0.3] In title-block ROI`);
      }
    }
  }
  
  // +0.3 if candidate is immediately adjacent to anchor keyword
  if (anchorKeywords.length > 0) {
    const nearestAnchor = anchorKeywords.reduce((nearest, anchor) => {
      const dx = Math.abs(item.x - anchor.x);
      const dy = Math.abs(item.y - anchor.y);
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance < nearest.distance ? { item: anchor, distance } : nearest;
    }, { item: anchorKeywords[0], distance: Infinity });
    
    // "Immediately adjacent" = within 50 points
    if (nearestAnchor.distance < 50) {
      confidence += 0.3;
      if (verbose) {
        console.log(`    [+0.3] Adjacent to anchor keyword (distance: ${nearestAnchor.distance.toFixed(1)})`);
      }
    }
  }
  
  // +0.2 if candidate matches a known discipline prefix
  const prefix = normalizedId.match(/^([A-Z]+)/)?.[1];
  if (prefix && DISCIPLINE_PREFIXES.has(prefix)) {
    confidence += 0.2;
    if (verbose) {
      console.log(`    [+0.2] Matches known discipline prefix: ${prefix}`);
    }
  }
  
  // -0.4 if candidate appears >N times across the page (likely references, not title block)
  const normalizedMatches = allMatchesInPage.map(m => normalizeDrawingsSheetId(m));
  const sameIdCount = normalizedMatches.filter(m => m === normalizedId).length;
  if (sameIdCount > 3) { // Appears more than 3 times
    confidence -= 0.4;
    if (verbose) {
      console.log(`    [-0.4] Appears ${sameIdCount} times on page (likely references)`);
    }
  }
  
  // +0.2 if candidate appears twice within the ROI (common in title blocks)
  const roiMatches = allMatchesInROI.map(m => normalizeDrawingsSheetId(m));
  const roiCount = roiMatches.filter(m => m === normalizedId).length;
  if (roiCount === 2) {
    confidence += 0.2;
    if (verbose) {
      console.log(`    [+0.2] Appears twice in ROI (title block pattern)`);
    }
  }
  
  // Additional scoring based on position
  // Sheet numbers are typically in the bottom-right corner (title block region)
  const isInBottomRight = item.x > pageWidth * 0.7 && item.y > pageHeight * 0.7;
  const isInBottomRightExtended = item.x > pageWidth * 0.6 && item.y > pageHeight * 0.6;
  
  if (isInBottomRight) {
    confidence += 0.15; // Strong signal - in typical title block location
    if (verbose) {
      console.log(`    [+0.15] In bottom-right corner (typical title block location)`);
    }
  } else if (isInBottomRightExtended) {
    confidence += 0.1;
    if (verbose) {
      console.log(`    [+0.1] Near bottom-right corner`);
    }
  } else {
    // Not in typical title block location - reduce confidence
    confidence -= 0.2;
    if (verbose) {
      console.log(`    [-0.2] Not in typical title block location (bottom-right corner)`);
    }
  }
  
  // Check for false positive patterns (measurements, references, etc.)
  const upperId = id.toUpperCase();
  for (const pattern of FALSE_POSITIVE_PATTERNS) {
    if (pattern.test(upperId)) {
      confidence -= 0.5; // Strong penalty for false positive patterns
      if (verbose) {
        console.log(`    [-0.5] Matches false positive pattern (likely measurement/reference, not sheet ID)`);
      }
      break;
    }
  }
  
  return Math.max(0, Math.min(1, confidence));
}

/**
 * Find sheet ID using the complete detection chain
 * 
 * @param docContextOrPath - DocumentContext (preferred) or pdfPath string (legacy)
 * @param pageIndex - 0-based page index
 * @param customPattern - Optional custom regex pattern
 * @param verbose - Verbose logging
 */
export async function findSheetIdWithFullDetection(
  docContextOrPath: any, // DocumentContext | string
  pageIndex: number,
  customPattern?: string,
  verbose: boolean = false
): Promise<ParsedId | null> {
  // Support both DocumentContext (new) and pdfPath string (legacy)
  const isDocumentContext = docContextOrPath && typeof docContextOrPath.getPageContext === 'function';
  const docContext = isDocumentContext ? docContextOrPath : null;
  const pdfPath = isDocumentContext ? null : docContextOrPath as string;
  
  if (verbose) {
    console.log(`\n[Sheet ID] Page ${pageIndex + 1}: Starting detection...`);
  }
  
  // Step 1: Get page context or page info
  let pageContext: any = null;
  let pageInfo: { width: number; height: number; rotation: number; isLandscape: boolean } | null = null;
  
  if (docContext) {
    // Use DocumentContext (single-load path)
    pageContext = await docContext.getPageContext(pageIndex);
    pageInfo = {
      width: pageContext.pageWidth,
      height: pageContext.pageHeight,
      rotation: pageContext.rotation,
      isLandscape: pageContext.isLandscape,
    };
  } else {
    // Legacy path - load PDF
    const { getPageInfo } = await import('../utils/pdf.js');
    pageInfo = await getPageInfo(pdfPath!, pageIndex);
    if (!pageInfo) {
      if (verbose) {
        console.log(`  [Sheet ID] Page ${pageIndex + 1}: Failed to get page info`);
      }
      return null;
    }
  }
  
  if (verbose) {
    console.log(`  [Page Info] Rotation: ${pageInfo.rotation}°, Size: ${pageInfo.width.toFixed(1)} x ${pageInfo.height.toFixed(1)} points, Landscape: ${pageInfo.isLandscape}`);
  }
  
  // Check if it's a construction drawing size
  const isDrawing = isConstructionDrawingSize(pageInfo.width, pageInfo.height);
  if (!isDrawing) {
    if (verbose) {
      console.log(`  [Sheet ID] Page ${pageIndex + 1}: Not a construction drawing size, skipping`);
    }
    return null;
  }
  
  // Warn if not landscape
  if (!pageInfo.isLandscape) {
    if (verbose) {
      console.log(`  ⚠️  [Sheet ID] Page ${pageIndex + 1}: WARNING - Page is not landscape (construction drawings should be landscape)`);
    }
  }
  
  // Warn if rotated
  if (pageInfo.rotation !== 0) {
    if (verbose) {
      console.log(`  ⚠️  [Sheet ID] Page ${pageIndex + 1}: WARNING - Page is rotated ${pageInfo.rotation}° (should be 0°)`);
    }
  }
  
  // Step 2: Try bookmarks first (easiest and most reliable)
  if (verbose) {
    console.log(`  [Detection] Step 1: Checking bookmarks...`);
  }
  
  let bookmarks: Array<{ title: string; pageIndex: number }> = [];
  if (docContext) {
    // Use cached bookmarks from DocumentContext
    bookmarks = await docContext.getBookmarks();
  } else {
    // Legacy path - load bookmarks
    const { extractBookmarks } = await import('../utils/pdf.js');
    bookmarks = await extractBookmarks(pdfPath!);
  }
  const pageBookmarks = bookmarks.filter(b => b.pageIndex === pageIndex);
  
  if (verbose) {
    if (bookmarks.length > 0) {
      console.log(`  [Bookmarks] PDF has ${bookmarks.length} total bookmark(s)`);
    } else {
      console.log(`  [Bookmarks] PDF has no bookmarks`);
    }
    if (pageBookmarks.length > 0) {
      console.log(`  [Bookmarks] Found ${pageBookmarks.length} bookmark(s) for page ${pageIndex + 1}:`);
      pageBookmarks.forEach(b => console.log(`    - "${b.title}"`));
    }
  }
  
  for (const bookmark of pageBookmarks) {
    const sheetId = extractSheetIdFromBookmark(bookmark.title, customPattern);
    if (sheetId) {
      const normalized = normalizeDrawingsSheetId(sheetId);
      if (verbose) {
        console.log(`  ✓ [Bookmark] Found sheet ID "${sheetId}" -> "${normalized}" in bookmark: "${bookmark.title}"`);
      }
      
      return {
        id: sheetId,
        normalized,
        confidence: 0.80, // Bookmarks can be unreliable (may point to wrong pages), so lower confidence
        pageIndex,
        source: 'bookmark',
        context: `bookmark: "${bookmark.title}"`,
      };
    }
  }
  
  if (verbose && pageBookmarks.length > 0) {
    console.log(`  [Bookmarks] No sheet ID pattern found in bookmark text`);
  }
  
  // Step 3: Try title block detection (corner-first approach)
  if (verbose) {
    console.log(`  [Detection] Step 2: Detecting title block...`);
  }
  
  let titleBlockBounds: any;
  let pageData: { items: any[]; pageWidth: number; pageHeight: number } | null = null;
  
  if (docContext && pageContext) {
    // Use DocumentContext - ensure text is extracted
    await docContext.extractTextForPage(pageIndex);
    const textItems = pageContext.getTextItems();
    
    // Check if title block already computed
    if (!pageContext.hasTitleBlockBounds()) {
      // Use autoDetectTitleBlock with DocumentContext (single-load)
      const { autoDetectTitleBlock } = await import('../utils/pdf.js');
      titleBlockBounds = await autoDetectTitleBlock(docContext, pageIndex, verbose);
      pageContext.setTitleBlockBounds(titleBlockBounds);
    } else {
      titleBlockBounds = pageContext.getTitleBlockBounds()!;
    }
    
    pageData = {
      items: textItems,
      pageWidth: pageContext.pageWidth,
      pageHeight: pageContext.pageHeight,
    };
  } else {
    // Legacy path
    const { autoDetectTitleBlock, extractPageTextWithPositions } = await import('../utils/pdf.js');
    titleBlockBounds = await autoDetectTitleBlock(pdfPath!, pageIndex, verbose);
    pageData = await extractPageTextWithPositions(pdfPath!, pageIndex);
    
    if (!pageData) {
      if (verbose) {
        console.log(`  [Sheet ID] Page ${pageIndex + 1}: Failed to extract text with positions`);
      }
      return null;
    }
  }
  
  // Filter text items to title block region
  const titleBlockItems = pageData.items.filter(item => {
    const itemRight = item.x + item.width;
    const itemBottom = item.y + item.height;
    
    return item.x >= titleBlockBounds.x &&
           item.y >= titleBlockBounds.y &&
           itemRight <= titleBlockBounds.x + titleBlockBounds.width &&
           itemBottom <= titleBlockBounds.y + titleBlockBounds.height;
  });
  
  // Get all matches on the page for scoring
  const pattern = customPattern 
    ? new RegExp(customPattern, 'gi')
    : DEFAULT_DRAWINGS_PATTERN;
  
  const allPageMatches: string[] = [];
  for (const item of pageData.items) {
    const match = item.str.match(pattern);
    if (match) {
      allPageMatches.push(match[1] || match[0]);
    }
  }
  
  // Find anchor keywords in title block
  const anchorKeywords = titleBlockItems.filter(item => {
    const upperStr = item.str.toUpperCase();
    return ANCHOR_KEYWORDS.some(keyword => upperStr.includes(keyword));
  });
  
  if (verbose) {
    console.log(`  [Title Block] Found ${titleBlockItems.length} text items in title block, ${anchorKeywords.length} anchor keyword(s)`);
  }
  
  // Find all candidate sheet IDs in title block
  const candidates: Array<{
    id: string;
    normalized: string;
    item: TextItemWithPosition;
    confidence: number;
  }> = [];
  
  for (const item of titleBlockItems) {
    const match = item.str.match(pattern);
    if (match) {
      const id = match[1] || match[0];
      const normalized = normalizeDrawingsSheetId(id);
      
      // Get matches in ROI for scoring
      const roiMatches: string[] = [];
      for (const roiItem of titleBlockItems) {
        const roiMatch = roiItem.str.match(pattern);
        if (roiMatch) {
          roiMatches.push(roiMatch[1] || roiMatch[0]);
        }
      }
      
      const confidence = calculateEnhancedConfidence(
        id,
        item,
        titleBlockBounds,
        anchorKeywords,
        allPageMatches,
        roiMatches,
        pageData.pageWidth,
        pageData.pageHeight,
        verbose
      );
      
      candidates.push({
        id,
        normalized,
        item,
        confidence,
      });
      
      if (verbose) {
        console.log(`  [Candidate] "${id}" -> "${normalized}" (confidence: ${confidence.toFixed(2)})`);
      }
    }
  }
  
  if (candidates.length === 0) {
    if (verbose) {
      console.log(`  [Sheet ID] Page ${pageIndex + 1}: No sheet ID candidates found in title block`);
    }
    
    // Step 4: Last resort - try parallel lines detection
    if (verbose) {
      console.log(`  [Detection] Step 3: Trying parallel lines detection (last resort)...`);
    }
    // This would be implemented if needed, but for now we'll return null
    return null;
  }
  
  // Sort by confidence (highest first)
  candidates.sort((a, b) => b.confidence - a.confidence);
  
  const best = candidates[0];
  
  // Adjust confidence based on title block detection method
  // If title block was detected by lines (high confidence), don't penalize
  // If detected by text clustering (medium), apply slight penalty
  // If default (low), apply larger penalty
  let titleBlockMultiplier = 1.0;
  if (titleBlockBounds.detectedBy === 'text-cluster') {
    titleBlockMultiplier = 0.9; // Slight penalty for text clustering
  } else if (titleBlockBounds.detectedBy === 'default') {
    titleBlockMultiplier = 0.7; // Larger penalty for default
  }
  // If detected by 'lines', keep multiplier at 1.0
  
  const finalConfidence = Math.min(1.0, best.confidence * titleBlockMultiplier);
  
  // Apply confidence thresholds
  let warning: string | undefined;
  if (finalConfidence >= 0.75) {
    // Auto-accept
    if (verbose) {
      console.log(`  ✓ [Selected] "${best.id}" -> "${best.normalized}" (confidence: ${finalConfidence.toFixed(2)} - HIGH)`);
    }
  } else if (finalConfidence >= 0.60) {
    // Accept with warning
    warning = `Low confidence (${finalConfidence.toFixed(2)})`;
    if (verbose) {
      console.log(`  ⚠️  [Selected] "${best.id}" -> "${best.normalized}" (confidence: ${finalConfidence.toFixed(2)} - LOW, accepting with warning)`);
    }
  } else {
    // Ambiguous - don't accept
    if (verbose) {
      console.log(`  ✗ [Rejected] "${best.id}" -> "${best.normalized}" (confidence: ${finalConfidence.toFixed(2)} - AMBIGUOUS, below threshold)`);
    }
    return null;
  }
  
  // Build context string for debugging
  const contextParts: string[] = [];
  if (titleBlockBounds.detectedBy === 'lines') {
    contextParts.push('title block detected by parallel lines');
  } else if (titleBlockBounds.detectedBy === 'text-cluster') {
    contextParts.push('title block detected by text clustering');
  } else {
    contextParts.push('title block using default bounds');
  }
  if (anchorKeywords.length > 0) {
    contextParts.push(`near "${anchorKeywords[0].str}" keyword`);
  }
  const context = contextParts.join(', ');
  
  return {
    id: best.id,
    normalized: best.normalized,
    confidence: finalConfidence,
    pageIndex,
    source: 'title-block',
    warning,
    context,
  };
}

/**
 * Simple text-based sheet ID extraction (used by splitSet command)
 */
export function getBestDrawingsSheetId(
  pageText: string,
  pageIndex: number,
  customPattern?: string
): ParsedId | null {
  const pattern = customPattern 
    ? new RegExp(customPattern, 'gi')
    : DEFAULT_DRAWINGS_PATTERN;
  
  const matches: string[] = [];
  let match;
  while ((match = pattern.exec(pageText)) !== null) {
    matches.push(match[1] || match[0]);
  }
  
  if (matches.length === 0) {
    return null;
  }
  
  // Simple confidence calculation for legacy mode
  const normalized = normalizeDrawingsSheetId(matches[0]);
  return {
    id: matches[0],
    normalized,
    confidence: 0.5,
    pageIndex,
    source: 'text',
  };
}


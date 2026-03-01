import type { SheetLocator, SheetLocationResult } from './sheetLocator.js';
import type { PageContext } from '../analyze/pageContext.js';
import type { DocumentContext } from '../analyze/documentContext.js';
import { normalizeDrawingsSheetId } from '../parser/normalize.js';
import { autoDetectTitleBlock } from '../utils/pdf.js';
import { calculateEnhancedConfidence } from '../parser/drawingsSheetId.js';
import { DEFAULT_DRAWINGS_PATTERN } from '../parser/drawingsSheetId.js';
import { extractSheetTitle } from '../utils/bookmarks.js';

/**
 * Legacy titleblock locator using auto-detection (cached)
 * 
 * This wraps the existing titleblock detection logic but uses
 * cached PageContext to avoid duplicate work.
 * 
 * Note: This locator should receive DocumentContext to avoid duplicate PDF loads.
 * For now, it falls back to direct PDF calls if docContext is not provided.
 */
export class LegacyTitleblockLocator implements SheetLocator {
  private pdfPath: string;
  private customPattern?: string;
  private docContext?: DocumentContext;
  
  constructor(pdfPathOrContext: string | DocumentContext, customPattern?: string) {
    // Support both DocumentContext (preferred) and pdfPath (legacy)
    if (typeof pdfPathOrContext === 'string') {
      this.pdfPath = pdfPathOrContext;
    } else {
      this.docContext = pdfPathOrContext;
      this.pdfPath = pdfPathOrContext.pdfPath;
    }
    this.customPattern = customPattern;
  }
  
  /**
   * Set DocumentContext (called from planner after DocumentContext is created)
   * This enables single-load behavior
   */
  setDocumentContext(docContext: DocumentContext): void {
    this.docContext = docContext;
  }
  
  getName(): string {
    return 'legacy-titleblock';
  }
  
  async locate(page: PageContext): Promise<SheetLocationResult> {
    // Check if title block bounds already computed (cached)
    let titleBlockBounds = page.getTitleBlockBounds();
    
    if (!page.hasTitleBlockBounds()) {
      // Compute once and cache
      // Use DocumentContext if available (single-load), otherwise fall back to direct call
      if (this.docContext) {
        // Use DocumentContext (single-load path)
        titleBlockBounds = await autoDetectTitleBlock(
          this.docContext,
          page.pageIndex,
          false // Don't verbose
        );
      } else {
        // Legacy path - direct PDF load
        titleBlockBounds = await autoDetectTitleBlock(
          this.pdfPath,
          page.pageIndex,
          false // Don't verbose
        );
      }
      page.setTitleBlockBounds(titleBlockBounds);
    }
    
    // Get text items (should already be cached in PageContext)
    const allItems = page.getTextItems();
    
    // Filter to title block region
    const titleBlockItems = allItems.filter(item => {
      if (!titleBlockBounds || titleBlockBounds.width === 0) {
        return false; // No title block detected
      }
      const itemRight = item.x + item.width;
      const itemBottom = item.y + item.height;
      return item.x >= titleBlockBounds!.x &&
             item.y >= titleBlockBounds!.y &&
             itemRight <= titleBlockBounds!.x + titleBlockBounds!.width &&
             itemBottom <= titleBlockBounds!.y + titleBlockBounds!.height;
    });
    
    if (titleBlockItems.length === 0) {
      return {
        confidence: 0.0,
        method: 'legacy-titleblock',
        warnings: ['No text found in title block region'],
      };
    }
    
    // Find anchor keywords
    const ANCHOR_KEYWORDS = ['SHEET', 'SHT', 'DWG NO', 'DWG', 'DRAWING NO', 'DRAWING', 'SHEET NO', 'SHEET NO.', 'SHEETNUMBER'];
    const anchorKeywords = titleBlockItems.filter(item =>
      ANCHOR_KEYWORDS.some(keyword => item.str.toUpperCase().includes(keyword))
    );
    
    if (!titleBlockBounds || titleBlockBounds.width === 0) {
      return {
        confidence: 0.0,
        method: 'legacy-titleblock',
        warnings: ['No title block detected'],
      };
    }
    
    // Find all matches in title block
    const pattern = this.customPattern 
      ? new RegExp(this.customPattern, 'g')
      : DEFAULT_DRAWINGS_PATTERN;
    
    const allMatches: string[] = [];
    const candidates: Array<{ id: string; normalized: string; item: any; confidence: number }> = [];
    
    for (const item of titleBlockItems) {
      const match = item.str.match(pattern);
      if (match) {
        const id = match[1] || match[0];
        allMatches.push(id);
        
        // Get matches in ROI for scoring
        const roiMatches = titleBlockItems
          .filter(i => {
            const m = i.str.match(pattern);
            return m && (m[1] || m[0]) === id;
          })
          .map(i => {
            const m = i.str.match(pattern);
            return m ? (m[1] || m[0]) : '';
          });
        
        const confidence = calculateEnhancedConfidence(
          id,
          item,
          titleBlockBounds,
          anchorKeywords,
          allMatches,
          roiMatches,
          page.pageWidth,
          page.pageHeight,
          false
        );
        
        candidates.push({
          id,
          normalized: normalizeDrawingsSheetId(id),
          item,
          confidence,
        });
      }
    }
    
    if (candidates.length === 0) {
      return {
        confidence: 0.0,
        method: 'legacy-titleblock',
        warnings: ['No sheet ID pattern found in title block'],
      };
    }
    
    // Sort by confidence
    candidates.sort((a, b) => b.confidence - a.confidence);
    const best = candidates[0];
    
    // Apply confidence thresholds
    if (best.confidence < 0.60) {
      return {
        confidence: best.confidence,
        method: 'legacy-titleblock',
        warnings: [`Low confidence (${best.confidence.toFixed(2)}) - below threshold`],
      };
    }
    
    // Extract title if available
    const sheetIdItem = best.item;
    const extractedTitle = extractSheetTitle(sheetIdItem, titleBlockItems);
    
    const detectedBy = titleBlockBounds.detectedBy || 'default';
    return {
      id: best.id,
      sheetIdNormalized: best.normalized,
      title: extractedTitle || undefined,
      confidence: best.confidence,
      method: 'legacy-titleblock',
      warnings: best.confidence < 0.75 ? [`Low confidence (${best.confidence.toFixed(2)})`] : [],
      context: detectedBy === 'lines' 
        ? 'title block detected by parallel lines'
        : detectedBy === 'text-cluster'
        ? 'title block detected by text clustering'
        : 'title block using default bounds',
    };
  }
}

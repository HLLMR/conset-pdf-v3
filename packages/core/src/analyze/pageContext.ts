import type { TextItemWithPosition } from '../utils/pdf.js';
import type { TitleBlockBounds } from '../utils/pdf.js';

/**
 * PageContext: Caches expensive per-page operations
 * 
 * Rule: All page-level PDF operations go through PageContext.
 * No direct pdf-lib calls for text extraction outside this module.
 */
export class PageContext {
  private _pageIndex: number;
  private _pageWidth: number = 0;
  private _pageHeight: number = 0;
  private _rotation: number = 0;
  private _isLandscape: boolean = false;
  
  // Cached expensive operations
  private _textItems: TextItemWithPosition[] | null = null;
  private _plainText: string | null = null; // Cached plain text (memoized)
  private _pageInfo: { width: number; height: number; rotation: number; isLandscape: boolean } | null = null; // Cached page info (memoized)
  private _titleBlockBounds: TitleBlockBounds | null = null;
  private _titleBlockComputed: boolean = false;
  
  // Detection results cache (keyed by detector name)
  private _detectionCache = new Map<string, any>();
  
  // Instrumentation: track access counts
  private _infoLoads: number = 0;
  private _textLoads: number = 0;
  private _itemsLoads: number = 0;
  private _roiQueries: number = 0;
  
  constructor(
    pageIndex: number,
    pageWidth: number,
    pageHeight: number,
    rotation: number = 0
  ) {
    this._pageIndex = pageIndex;
    this._pageWidth = pageWidth;
    this._pageHeight = pageHeight;
    this._rotation = rotation;
    this._isLandscape = pageWidth > pageHeight;
  }
  
  get pageIndex(): number {
    return this._pageIndex;
  }
  
  get pageWidth(): number {
    return this._pageWidth;
  }
  
  get pageHeight(): number {
    return this._pageHeight;
  }
  
  get rotation(): number {
    return this._rotation;
  }
  
  get isLandscape(): boolean {
    return this._isLandscape;
  }
  
  /**
   * Get page info (memoized - computed once, cached)
   * Returns: { width, height, rotation, isLandscape }
   */
  getInfo(): { width: number; height: number; rotation: number; isLandscape: boolean } {
    if (this._pageInfo === null) {
      this._infoLoads++;
      this._pageInfo = {
        width: this._pageWidth,
        height: this._pageHeight,
        rotation: this._rotation,
        isLandscape: this._isLandscape,
      };
    }
    return this._pageInfo;
  }
  
  /**
   * Get plain text (memoized - computed once from cached text items)
   */
  getText(): string {
    if (this._plainText === null) {
      this._textLoads++;
      const items = this.getTextItems(); // Will throw if not loaded
      this._plainText = items.map(item => item.str).join(' ');
    }
    return this._plainText;
  }
  
  /**
   * Set text items (extracted once, cached)
   */
  setTextItems(items: TextItemWithPosition[]): void {
    this._textItems = items;
    // Clear cached plain text if items change
    this._plainText = null;
  }
  
  /**
   * Get all text items (cached, memoized access)
   */
  getTextItems(): TextItemWithPosition[] {
    if (this._textItems === null) {
      throw new Error(`Text items not loaded for page ${this._pageIndex + 1}. Call setTextItems() first.`);
    }
    this._itemsLoads++;
    return this._textItems;
  }
  
  /**
   * Get visual text items for debug overlay
   * Returns items in the same visual coordinate space used by ROI filtering (top-left visual space)
   * 
   * @returns Array of text items with position information
   */
  getVisualTextItems(): Array<{ str: string; x: number; y: number; width: number; height: number }> {
    const items = this.getTextItems();
    // Return items in the same format - they're already in visual coordinates
    return items.map(item => ({
      str: item.str,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
    }));
  }
  
  /**
   * Get text items within a normalized ROI (0-1 coordinates, visual space)
   * Derived view computed from cached items - no extraction
   * 
   * @param roi Normalized ROI coordinates (0-1, bottom-left origin)
   * @param options Optional filtering controls
   * @param options.padNorm Expand ROI in normalized coords during filtering (default: 0)
   * @param options.intersectionMode "strict" requires entire item within ROI, "overlap" allows partial overlap (default: "strict" for backward compatibility with strictContainment=true)
   * @param options.overlapThreshold Only used if intersectionMode="overlap"; minimum overlap ratio (0-1) required (default: 0.5)
   */
  getTextItemsInROI(
    roi: { x: number; y: number; width: number; height: number },
    options?: {
      padNorm?: number;
      intersectionMode?: 'strict' | 'overlap';
      overlapThreshold?: number;
    }
  ): TextItemWithPosition[] {
    this._roiQueries++;
    const items = this.getTextItems(); // Uses cached items
    
    // Apply padding if specified
    const padNorm = options?.padNorm ?? 0;
    const expandedRoi = {
      x: Math.max(0, roi.x - padNorm),
      y: Math.max(0, roi.y - padNorm),
      width: Math.min(1 - (roi.x - padNorm), roi.width + 2 * padNorm),
      height: Math.min(1 - (roi.y - padNorm), roi.height + 2 * padNorm),
    };
    
    // Convert normalized ROI to absolute coordinates
    // ROI uses bottom-left origin (y: 0.0 = bottom, y: 1.0 = top) - PDF standard
    // Text items use top-left origin (y: 0 = top, y: max = bottom)
    // Since text items are now in visual (rotated) coordinates, we can use simple conversion
    // regardless of rotation - the transformation was already applied during extraction
    const absX = expandedRoi.x * this._pageWidth;
    const absY = this._pageHeight * (1.0 - expandedRoi.y - expandedRoi.height); // Convert bottom-left ROI to top-left text items
    const absWidth = expandedRoi.width * this._pageWidth;
    const absHeight = expandedRoi.height * this._pageHeight;
    
    const intersectionMode = options?.intersectionMode ?? 'strict';
    const overlapThreshold = options?.overlapThreshold ?? 0.5;
    
    // Filter items within ROI
    // ROI uses bottom-left origin, text items use top-left origin (after conversion)
    return items.filter(item => {
      const itemRight = item.x + item.width;
      const itemBottom = item.y + item.height;
      
      if (intersectionMode === 'strict') {
        // Strict containment: entire item must be within ROI bounds
        return item.x >= absX &&
               itemRight <= absX + absWidth &&
               item.y >= absY &&
               itemBottom <= absY + absHeight;
      } else {
        // Overlap mode: require minimum overlap ratio
        const overlapX = Math.max(0, Math.min(itemRight, absX + absWidth) - Math.max(item.x, absX));
        const overlapY = Math.max(0, Math.min(itemBottom, absY + absHeight) - Math.max(item.y, absY));
        const overlapArea = overlapX * overlapY;
        const itemArea = item.width * item.height;
        
        if (itemArea === 0) {
          // Zero-area item: use point-in-rectangle check
          return item.x >= absX && item.x <= absX + absWidth &&
                 item.y >= absY && item.y <= absY + absHeight;
        }
        
        const overlapRatio = overlapArea / itemArea;
        return overlapRatio >= overlapThreshold;
      }
    });
  }
  
  /**
   * Alias for getTextItemsInROI (for compatibility with RoiSheetLocator)
   * 
   * @param roi Normalized ROI coordinates (0-1)
   * @param strictContainment If true, require entire item to be within ROI. If false, allow overlap (default: false)
   * @deprecated Use getTextItemsInROI() with options instead
   */
  getTextInROI(roi: { x: number; y: number; width: number; height: number }, strictContainment: boolean = false): TextItemWithPosition[] {
    return this.getTextItemsInROI(roi, {
      intersectionMode: strictContainment ? 'strict' : 'overlap',
      overlapThreshold: strictContainment ? 1.0 : 0.5,
    });
  }
  
  /**
   * Set title block bounds (computed once, cached)
   */
  setTitleBlockBounds(bounds: TitleBlockBounds): void {
    this._titleBlockBounds = bounds;
    this._titleBlockComputed = true;
  }
  
  /**
   * Get title block bounds (cached)
   */
  getTitleBlockBounds(): TitleBlockBounds | null {
    return this._titleBlockBounds;
  }
  
  /**
   * Check if title block has been computed
   */
  hasTitleBlockBounds(): boolean {
    return this._titleBlockComputed;
  }
  
  /**
   * Cache detection result by key
   * Note: result is typed as 'any' because different locators return different result shapes
   * (SheetLocationResult, detection metadata, etc.). The cache is locator-specific.
   */
  setDetectionResult(key: string, result: any): void {
    this._detectionCache.set(key, result);
  }
  
  /**
   * Get cached detection result
   */
  getDetectionResult<T>(key: string): T | undefined {
    return this._detectionCache.get(key) as T | undefined;
  }
  
  /**
   * Clear all caches (for testing/debugging)
   */
  clearCache(): void {
    this._textItems = null;
    this._plainText = null;
    this._pageInfo = null;
    this._titleBlockBounds = null;
    this._titleBlockComputed = false;
    this._detectionCache.clear();
    // Reset instrumentation
    this._infoLoads = 0;
    this._textLoads = 0;
    this._itemsLoads = 0;
    this._roiQueries = 0;
  }
  
  /**
   * Get instrumentation info (for debugging/caching verification)
   */
  getInstrumentation(): {
    pageIndex: number;
    infoLoads: number;
    textLoads: number;
    itemsLoads: number;
    roiQueries: number;
    hasTextItems: boolean;
    hasPlainText: boolean;
    hasPageInfo: boolean;
  } {
    return {
      pageIndex: this._pageIndex,
      infoLoads: this._infoLoads,
      textLoads: this._textLoads,
      itemsLoads: this._itemsLoads,
      roiQueries: this._roiQueries,
      hasTextItems: this._textItems !== null,
      hasPlainText: this._plainText !== null,
      hasPageInfo: this._pageInfo !== null,
    };
  }
}

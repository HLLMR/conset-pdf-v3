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
   * Get text items within a normalized ROI (0-1 coordinates, visual space)
   * Derived view computed from cached items - no extraction
   * 
   * @param roi Normalized ROI coordinates (0-1)
   * @param strictContainment If true, require entire item to be within ROI. If false, allow overlap (default: false for backward compatibility)
   */
  getTextItemsInROI(roi: { x: number; y: number; width: number; height: number }, strictContainment: boolean = false): TextItemWithPosition[] {
    this._roiQueries++;
    const items = this.getTextItems(); // Uses cached items
    
    // Convert normalized ROI to absolute coordinates
    // ROI coordinates are normalized (0-1) with origin at bottom-left (PDF standard)
    // Text items use top-left origin (after Y flip in documentContext.ts)
    // 
    // ROI coordinate system (normalized, bottom-left origin):
    // - x: 0 = left, 1 = right
    // - y: 0 = bottom, 1 = top
    // - y represents the BOTTOM edge of the ROI
    //
    // Text item coordinate system (absolute, top-left origin):
    // - x: 0 = left, pageWidth = right
    // - y: 0 = top, pageHeight = bottom
    // - y represents the TOP edge of the text item
    //
    // Conversion:
    // ROI coordinate system (normalized, bottom-left origin):
    // - roi.y is the BOTTOM edge (0 = page bottom, 1 = page top)
    // - roi.y + roi.height is the TOP edge
    // 
    // Text item coordinate system (absolute, top-left origin):
    // - y is the TOP edge (0 = page top, pageHeight = page bottom)
    //
    // To convert ROI top edge to text item top edge:
    // - ROI top in normalized: roi.y + roi.height (where 1 = page top)
    // - ROI top in absolute (top-left): (1 - (roi.y + roi.height)) * pageHeight
    const absX = roi.x * this._pageWidth;
    const absY = (1.0 - roi.y - roi.height) * this._pageHeight;
    const absWidth = roi.width * this._pageWidth;
    const absHeight = roi.height * this._pageHeight;
    
    // Debug logging - always log first few queries to help diagnose
    const shouldLog = this._roiQueries <= 3 || (strictContainment && items.length === 0);
    if (shouldLog) {
      console.log(`[PageContext] ROI query #${this._roiQueries}: normalized=(${roi.x.toFixed(4)}, ${roi.y.toFixed(4)}, ${roi.width.toFixed(4)}, ${roi.height.toFixed(4)}), absolute=(${absX.toFixed(1)}, ${absY.toFixed(1)}, ${absWidth.toFixed(1)}, ${absHeight.toFixed(1)}), pageSize=(${this._pageWidth.toFixed(1)}, ${this._pageHeight.toFixed(1)}), strictContainment=${strictContainment}, totalItems=${items.length}`);
      if (items.length > 0 && items.length < 50) {
        const sampleItems = items.slice(0, 10);
        console.log(`[PageContext] Sample text items (showing ${sampleItems.length} of ${items.length}):`);
        sampleItems.forEach((item, i) => {
          const itemRight = item.x + (item.width || 0);
          const itemBottom = item.y + (item.height || 0);
          const inBounds = item.x >= absX && itemRight <= absX + absWidth && item.y >= absY && itemBottom <= absY + absHeight;
          console.log(`  [${i}] "${item.str.substring(0, 30)}" at (${item.x.toFixed(1)}, ${item.y.toFixed(1)}) size(${(item.width || 0).toFixed(1)}, ${(item.height || 0).toFixed(1)}) bounds(${itemRight.toFixed(1)}, ${itemBottom.toFixed(1)}) ${inBounds ? '✓ IN' : '✗ OUT'}`);
        });
      } else if (items.length === 0) {
        console.log(`[PageContext] WARNING: No text items found on page! This might indicate a text extraction issue.`);
      }
    }
    
    // Filter items within ROI
    // Note: Text items use top-left origin (y increases downward)
    return items.filter(item => {
      // Calculate actual bounding box
      // If width/height are 0 or missing, use a minimum size based on text length
      // This ensures we have a valid bounding box for strict containment checks
      let itemWidth = item.width;
      let itemHeight = item.height;
      
      // If dimensions are missing or zero, estimate from text length
      // Use a conservative estimate: ~6 points per character width, ~12 points height
      if (itemWidth <= 0 || itemHeight <= 0) {
        const textLength = item.str.length;
        itemWidth = Math.max(itemWidth, textLength * 6);
        itemHeight = Math.max(itemHeight, 12);
      }
      
      const itemRight = item.x + itemWidth;
      const itemBottom = item.y + itemHeight;
      
      if (strictContainment) {
        // Strict containment: entire item must be within ROI bounds
        // All four corners must be inside the ROI
        // Left edge must be at or to the right of ROI left
        // Right edge must be at or to the left of ROI right
        // Top edge must be at or below ROI top
        // Bottom edge must be at or above ROI bottom
        const leftInside = item.x >= absX;
        const rightInside = itemRight <= absX + absWidth;
        const topInside = item.y >= absY;
        const bottomInside = itemBottom <= absY + absHeight;
        
        return leftInside && rightInside && topInside && bottomInside;
      } else {
        // Overlap check: item overlaps with ROI (backward compatible behavior)
        return item.x < absX + absWidth &&
               itemRight > absX &&
               item.y < absY + absHeight &&
               itemBottom > absY;
      }
    });
  }
  
  /**
   * Alias for getTextItemsInROI (for compatibility with RoiSheetLocator)
   * 
   * @param roi Normalized ROI coordinates (0-1)
   * @param strictContainment If true, require entire item to be within ROI. If false, allow overlap (default: false)
   */
  getTextInROI(roi: { x: number; y: number; width: number; height: number }, strictContainment: boolean = false): TextItemWithPosition[] {
    return this.getTextItemsInROI(roi, strictContainment);
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

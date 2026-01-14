import type { PageContext } from '../analyze/pageContext.js';

/**
 * Result of sheet location attempt
 */
export interface SheetLocationResult {
  id?: string;
  normalizedId?: string;
  title?: string;
  confidence: number;
  method: string;
  warnings: string[];
  context?: string; // Additional debug info
}

/**
 * SheetLocator: Interface for different sheet ID/title detection strategies
 * 
 * Implementations:
 * - RoiSheetLocator: Uses layout profile with ROI regions
 * - LegacyTitleblockLocator: Uses auto-detected title block (cached)
 * - CompositeLocator: Tries ROI first, falls back to legacy
 */
export interface SheetLocator {
  /**
   * Locate sheet ID and title on a page
   * 
   * @param page Page context with cached text extraction
   * @returns Location result with ID, title, confidence, and method
   */
  locate(page: PageContext): Promise<SheetLocationResult>;
  
  /**
   * Get locator name for debugging/reporting
   */
  getName(): string;
}

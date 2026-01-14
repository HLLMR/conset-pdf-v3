import type { SheetLocator, SheetLocationResult } from './sheetLocator.js';
import type { PageContext } from '../analyze/pageContext.js';

/**
 * Composite locator: tries ROI first, falls back to legacy
 * 
 * This is useful when:
 * - Auto-layout proposes a profile but you want legacy as backup
 * - ROI detection might have gaps and legacy can fill them
 * - You want best-of-both-worlds detection
 */
export class CompositeLocator implements SheetLocator {
  private roiLocator: SheetLocator | null;
  private legacyLocator: SheetLocator;
  
  constructor(roiLocator: SheetLocator | null, legacyLocator: SheetLocator) {
    this.roiLocator = roiLocator;
    this.legacyLocator = legacyLocator;
  }
  
  /**
   * Set DocumentContext on legacy locator if it supports it
   * This enables single-load behavior for LegacyTitleblockLocator
   */
  setDocumentContext(docContext: any): void {
    if (this.legacyLocator && typeof (this.legacyLocator as any).setDocumentContext === 'function') {
      (this.legacyLocator as any).setDocumentContext(docContext);
    }
  }
  
  getName(): string {
    if (this.roiLocator) {
      return `composite(${this.roiLocator.getName()},${this.legacyLocator.getName()})`;
    }
    return this.legacyLocator.getName();
  }
  
  async locate(page: PageContext): Promise<SheetLocationResult> {
    // Try ROI first if available
    if (this.roiLocator) {
      const roiResult = await this.roiLocator.locate(page);
      
      // If ROI found something with decent confidence, use it
      if (roiResult.id && roiResult.confidence >= 0.60) {
        return {
          ...roiResult,
          method: `composite-${roiResult.method}`,
        };
      }
      
      // If ROI found something but low confidence, still prefer it but note fallback
      if (roiResult.id) {
        return {
          ...roiResult,
          method: `composite-${roiResult.method}`,
          warnings: [
            ...roiResult.warnings,
            'ROI found ID but confidence low - consider reviewing layout profile',
          ],
        };
      }
      
      // ROI failed - fall back to legacy with explanation
      const legacyResult = await this.legacyLocator.locate(page);
      
      // Build fallback explanation
      const roiFailureReasons = roiResult.warnings.length > 0 
        ? roiResult.warnings.join('; ')
        : 'ROI detection failed';
      
      return {
        ...legacyResult,
        method: `composite-fallback-${legacyResult.method}`,
        warnings: [
          ...legacyResult.warnings,
          `ROI detection failed, using legacy fallback. ROI failures: ${roiFailureReasons}`,
        ],
        context: legacyResult.context 
          ? `${legacyResult.context} (fallback from ROI: ${roiFailureReasons})`
          : `Legacy fallback (ROI: ${roiFailureReasons})`,
      };
    }
    
    // No ROI locator - use legacy only
    const legacyResult = await this.legacyLocator.locate(page);
    
    return {
      ...legacyResult,
      method: `composite-fallback-${legacyResult.method}`,
    };
  }
}

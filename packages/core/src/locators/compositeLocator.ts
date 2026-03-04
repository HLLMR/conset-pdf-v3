import type { SheetLocator, SheetLocationResult } from './sheetLocator.js';
import type { PageContext } from '../analyze/pageContext.js';
import { isLegacyLocatorEnabled } from '../config/featureFlags.js';
import { logLegacyLocatorUsage } from '../utils/deprecation.js';

/**
 * Composite locator: tries ROI first, falls back to legacy
 * 
 * **DEPRECATED**: The legacy locator fallback is deprecated and disabled by default.
 * Set `ENABLE_LEGACY_LOCATOR=true` environment variable to use it.
 * 
 * This is useful when:
 * - Auto-layout proposes a profile but you want legacy as backup
 * - ROI detection might have gaps and legacy can fill them
 * - You want best-of-both-worlds detection (with legacy fallback enabled)
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
      
      // ROI failed - check if legacy fallback is enabled
      const legacyEnabled = isLegacyLocatorEnabled();
      
      // Build fallback explanation
      const roiFailureReasons = roiResult.warnings.length > 0 
        ? roiResult.warnings.join('; ')
        : 'ROI detection failed';
      
      if (!legacyEnabled) {
        // Legacy fallback is disabled - return error with guidance
        logLegacyLocatorUsage(`Page ${page.pageIndex}: ROI detection failed`);
        return {
          confidence: 0.0,
          method: `composite-roi-failed`,
          warnings: [
            `ROI detection failed, and legacy fallback is DISABLED (ENABLE_LEGACY_LOCATOR=false).`,
            `ROI failures: ${roiFailureReasons}`,
            `To enable legacy fallback, set environment variable: ENABLE_LEGACY_LOCATOR=true`,
          ],
        };
      }
      
      // Legacy fallback is enabled - log deprecation and use it
      logLegacyLocatorUsage(`Page ${page.pageIndex}: ROI detection failed, falling back to legacy`);
      
      const legacyResult = await this.legacyLocator.locate(page);
      
      return {
        ...legacyResult,
        method: `composite-fallback-${legacyResult.method}`,
        warnings: [
          ...legacyResult.warnings,
          `⚠️  Using deprecated legacy locator fallback. ROI failures: ${roiFailureReasons}`,
        ],
        context: legacyResult.context 
          ? `${legacyResult.context} (fallback from ROI: ${roiFailureReasons})`
          : `Legacy fallback (ROI: ${roiFailureReasons})`,
      };
    }
    
    // No ROI locator - check if legacy-only usage is permitted
    const legacyEnabled = isLegacyLocatorEnabled();
    
    if (!legacyEnabled) {
      logLegacyLocatorUsage(`Page ${page.pageIndex}: Using legacy locator without ROI`);
      return {
        confidence: 0.0,
        method: 'composite-legacy-disabled',
        warnings: [
          'Legacy locator fallback is DISABLED (ENABLE_LEGACY_LOCATOR=false).',
          'CompositeLocator requires either ROI detection or legacy fallback enabled.',
          'To enable legacy fallback, set environment variable: ENABLE_LEGACY_LOCATOR=true',
        ],
      };
    }
    
    // Legacy fallback is enabled - log deprecation and use it
    logLegacyLocatorUsage(`Page ${page.pageIndex}: Using legacy locator only (no ROI)`);
    const legacyResult = await this.legacyLocator.locate(page);

    
    return {
      ...legacyResult,
      method: `composite-fallback-${legacyResult.method}`,
      warnings: [
        ...legacyResult.warnings,
        '⚠️  Using deprecated legacy locator. This system is abandoned and will be removed.',
      ],    };
  }
}
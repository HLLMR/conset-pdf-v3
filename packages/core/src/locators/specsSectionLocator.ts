import type { SheetLocator, SheetLocationResult } from './sheetLocator.js';
import type { PageContext } from '../analyze/pageContext.js';
import { getBestSpecsSectionId } from '../parser/specsSectionId.js';

/**
 * Specs section locator: Detects specs section IDs from page text
 * 
 * This locator quarantines the legacy specs detection logic behind
 * the SheetLocator interface, consuming PageContext (no IO).
 */
export class SpecsSectionLocator implements SheetLocator {
  private customPattern?: string;
  
  constructor(customPattern?: string) {
    this.customPattern = customPattern;
  }
  
  getName(): string {
    return 'specs-section';
  }
  
  async locate(page: PageContext): Promise<SheetLocationResult> {
    // Get plain text from cached PageContext
    const pageText = page.getText();
    
    // Use legacy detection function (quarantined behind locator)
    const parsed = getBestSpecsSectionId(pageText, page.pageIndex, this.customPattern);
    
    if (!parsed) {
      return {
        confidence: 0.0,
        method: 'specs-section',
        warnings: ['No specs section ID found'],
      };
    }
    
    return {
      id: parsed.id,
      normalizedId: parsed.normalized,
      confidence: parsed.confidence,
      method: 'specs-section',
      warnings: [],
    };
  }
}

import type { SheetLocator, SheetLocationResult } from './sheetLocator.js';
import type { PageContext } from '../analyze/pageContext.js';
import type { LayoutProfile } from '../layout/types.js';
import { normalizeDrawingsSheetId } from '../parser/normalize.js';

/**
 * ROI-based sheet locator using layout profile
 */
export class RoiSheetLocator implements SheetLocator {
  private profile: LayoutProfile;
  private defaultPattern: RegExp;
  
  constructor(profile: LayoutProfile) {
    this.profile = profile;
    
    // Use profile regex or default pattern
    const patternStr = profile.sheetId.regex || 
      /\b([A-Z]{1,3}\s*\d{0,2}\s*[-._ ]\s*\d{1,3}(?:\.\d+)?[A-Z]{0,3})\b/g;
    this.defaultPattern = new RegExp(patternStr, 'g');
  }
  
  getName(): string {
    return `ROI-${this.profile.name}`;
  }
  
  async locate(page: PageContext): Promise<SheetLocationResult> {
    const warnings: string[] = [];
    const roiFailures: Array<{ roiIndex: number; reason: string }> = [];
    
    // Try each ROI in order until we find a match
    let sheetId: string | undefined;
    let normalizedId: string | undefined;
    let confidence = 0.0;
    let matchedROI: number | undefined;
    
    for (let i = 0; i < this.profile.sheetId.rois.length; i++) {
      const roi = this.profile.sheetId.rois[i];
      const result = await this.extractFromROI(page, roi, i);
      
      if (result.id) {
        sheetId = result.id;
        normalizedId = result.normalizedId;
        confidence = result.confidence;
        matchedROI = i;
        
        // Add warning if multiple matches were found
        if (result.warning) {
          warnings.push(result.warning);
        }
        break;
      }
      
      // Track failure for reporting
      if (result.failureReason) {
        roiFailures.push({ roiIndex: i, reason: result.failureReason });
      }
      
      if (result.warning) {
        warnings.push(result.warning);
      }
    }
    
    // If all ROIs failed, provide summary
    if (!sheetId && roiFailures.length > 0) {
      const failureReasons = roiFailures.map(f => `ROI ${f.roiIndex + 1}: ${f.reason}`).join('; ');
      warnings.push(`All ${this.profile.sheetId.rois.length} ROI(s) failed: ${failureReasons}`);
    }
    
    // Extract title if configured
    let title: string | undefined;
    if (this.profile.sheetTitle && sheetId) {
      title = await this.extractTitle(page, matchedROI);
    }
    
    return {
      id: sheetId,
      normalizedId,
      title,
      confidence,
      method: `ROI-${matchedROI !== undefined ? matchedROI + 1 : 'none'}`,
      warnings,
      context: sheetId 
        ? `ROI ${(matchedROI || 0) + 1} in profile "${this.profile.name}"`
        : roiFailures.length > 0 
          ? `All ROIs failed (${roiFailures.map(f => f.reason).join(', ')})`
          : undefined,
    };
  }
  
  private async extractFromROI(
    page: PageContext,
    roi: { x: number; y: number; width: number; height: number },
    roiIndex: number
  ): Promise<{ id?: string; normalizedId?: string; confidence: number; warning?: string; failureReason?: string }> {
    // Get text items in ROI
    const roiItems = page.getTextInROI(roi);
    
    // Check for empty ROI (no text found)
    if (roiItems.length === 0) {
      return {
        confidence: 0.0,
        warning: `ROI ${roiIndex + 1} empty: No text found in ROI (x=${roi.x.toFixed(3)}, y=${roi.y.toFixed(3)}, w=${roi.width.toFixed(3)}, h=${roi.height.toFixed(3)})`,
        failureReason: 'ROI_EMPTY',
      };
    }
    
    // Check for low text density (very few text items suggests misconfigured ROI)
    const roiArea = roi.width * roi.height;
    const textDensity = roiItems.length / roiArea;
    if (textDensity < 10 && roiItems.length < 3) {
      return {
        confidence: 0.0,
        warning: `ROI ${roiIndex + 1} low text density: Only ${roiItems.length} text item(s) found (density: ${textDensity.toFixed(1)}). ROI may be misconfigured.`,
        failureReason: 'ROI_LOW_TEXT_DENSITY',
      };
    }
    
    // Find matches using regex
    const matches: Array<{ id: string; item: any }> = [];
    
    for (const item of roiItems) {
      const text = item.str;
      const match = text.match(this.defaultPattern);
      if (match) {
        const id = match[1] || match[0];
        matches.push({ id, item });
      }
    }
    
    if (matches.length === 0) {
      const sampleText = roiItems.slice(0, 3).map(item => item.str).join(' ');
      return {
        confidence: 0.0,
        warning: `ROI ${roiIndex + 1} no pattern match: Sheet ID pattern not found in ROI text. Sample text: "${sampleText.substring(0, 50)}${sampleText.length > 50 ? '...' : ''}"`,
        failureReason: 'ROI_NO_PATTERN_MATCH',
      };
    }
    
    // Calculate confidence
    const anchorKeywords = this.profile.sheetId.anchorKeywords || [];
    const anchorItems = roiItems.filter(item => 
      anchorKeywords.some(keyword => 
        item.str.toUpperCase().includes(keyword.toUpperCase())
      )
    );
    
    const confidence = this.calculateConfidence(matches, anchorItems);
    
    // Pick best match
    let bestMatch = matches[0];
    let multipleMatchesWarning: string | undefined;
    
    if (matches.length > 1) {
      // Multiple matches: pick closest to anchor if available
      if (anchorItems.length > 0) {
        bestMatch = matches.reduce((best, match) => {
          const bestDist = this.distanceToNearestAnchor(best.item, anchorItems);
          const matchDist = this.distanceToNearestAnchor(match.item, anchorItems);
          return matchDist < bestDist ? match : best;
        });
      }
      
      // Warn about multiple matches
      const matchIds = matches.map(m => m.id).join(', ');
      multipleMatchesWarning = `ROI ${roiIndex + 1} multiple matches: Found ${matches.length} candidate(s): ${matchIds}. Selected "${bestMatch.id}" based on ${anchorItems.length > 0 ? 'anchor proximity' : 'first match'}.`;
    }
    
    // Validate prefix if configured
    if (this.profile.validation?.allowedPrefixes) {
      const normalized = normalizeDrawingsSheetId(bestMatch.id);
      const prefix = normalized.match(/^([A-Z]+)/)?.[1];
      if (prefix && !this.profile.validation.allowedPrefixes.includes(prefix)) {
        return {
          confidence: 0.0,
          warning: `ROI ${roiIndex + 1} prefix rejected: ID "${bestMatch.id}" has prefix "${prefix}" not in allowed list [${this.profile.validation.allowedPrefixes.join(', ')}]`,
          failureReason: 'ROI_PREFIX_REJECTED',
        };
      }
    }
    
    return {
      id: bestMatch.id,
      normalizedId: normalizeDrawingsSheetId(bestMatch.id),
      confidence,
      warning: multipleMatchesWarning,
    };
  }
  
  private calculateConfidence(
    matches: Array<{ id: string; item: any }>,
    anchorItems: any[]
  ): number {
    if (matches.length === 0) return 0.0;
    
    if (matches.length === 1) {
      let conf = 0.8; // Base: one match found
      
      // Check anchor proximity
      if (anchorItems.length > 0) {
        const dist = this.distanceToNearestAnchor(matches[0].item, anchorItems);
        if (dist < 50) {
          conf = 1.0; // Perfect: near anchor
        }
      }
      
      return conf;
    }
    
    // Multiple matches: lower confidence
    return 0.5;
  }
  
  private distanceToNearestAnchor(item: any, anchors: any[]): number {
    if (anchors.length === 0) return Infinity;
    
    return Math.min(...anchors.map(anchor => {
      const dx = item.x - anchor.x;
      const dy = item.y - anchor.y;
      return Math.sqrt(dx * dx + dy * dy);
    }));
  }
  
  private async extractTitle(
    page: PageContext,
    _matchedROI: number | undefined
  ): Promise<string | undefined> {
    if (!this.profile.sheetTitle) return undefined;
    
    // Try each title ROI
    for (const roi of this.profile.sheetTitle.rois) {
      const roiItems = page.getTextInROI(roi);
      
      if (roiItems.length === 0) continue;
      
      // Filter out metadata words
      const titleCandidates = roiItems.filter(item => {
        const text = item.str.trim();
        if (text.length < 3) return false;
        if (/^[A-Z]{1,3}\s*\d+/.test(text)) return false; // Skip sheet numbers
        if (/\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}/.test(text)) return false; // Skip dates
        const metadataWords = ['SHEET', 'NO', 'DWG', 'DRAWING', 'REV', 'DATE', 'SCALE', 'SIZE',
                             'APPROVED', 'CHECKED', 'DRAWN', 'BY', 'AUTHOR', 'CHECKER', 'APPROVER'];
        if (metadataWords.some(word => text.toUpperCase().includes(word))) return false;
        if (/^[A-Z]{2,4}$/.test(text)) return false; // Skip initials
        return true;
      });
      
      if (titleCandidates.length > 0) {
        // Combine nearby items on same line
        const titleParts: string[] = [];
        const usedItems = new Set();
        
        for (const candidate of titleCandidates.slice(0, 3)) {
          if (usedItems.has(candidate)) continue;
          const lineItems = titleCandidates.filter(item => {
            if (usedItems.has(item)) return false;
            return Math.abs(item.y - candidate.y) < 10;
          });
          lineItems.sort((a, b) => a.x - b.x);
          const lineText = lineItems.map(item => item.str.trim()).join(' ').trim();
          if (lineText.length > 0) {
            titleParts.push(lineText);
            lineItems.forEach(item => usedItems.add(item));
          }
        }
        
        if (titleParts.length > 0) {
          const maxLength = this.profile.sheetTitle.maxLength || 100;
          const title = titleParts.join(' - ').trim();
          return title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
        }
      }
    }
    
    return undefined;
  }
}

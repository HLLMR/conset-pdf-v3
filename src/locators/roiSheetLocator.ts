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
    // Get text items in ROI using strict containment
    // Since ROIs are visually bounded in the GUI, we should only include items fully within the ROI
    const roiItems = page.getTextInROI(roi, true);
    
    // Check for empty ROI (no text found)
    if (roiItems.length === 0) {
      return {
        confidence: 0.0,
        warning: `ROI ${roiIndex + 1} empty: No text found in ROI`,
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
    // Strategy: Try individual items first, then try concatenated text (in case ID spans multiple items)
    const matches: Array<{ id: string; item: any }> = [];
    
    // First, try matching individual text items
    // Use global patterns to find ALL matches in each item, not just the first
    for (const item of roiItems) {
      const text = item.str.trim();
      if (!text) continue;
      
      const itemMatches: string[] = [];
      
      // Try configured pattern first (global)
      const defaultMatches = text.matchAll(this.defaultPattern);
      for (const match of defaultMatches) {
        const id = match[1] || match[0];
        const cleanedId = id.trim().replace(/\s+/g, '').toUpperCase();
        if (!itemMatches.includes(cleanedId)) {
          itemMatches.push(cleanedId);
        }
      }
      
      // If no matches, try flexible patterns (global)
      if (itemMatches.length === 0) {
        // Pattern 1: Very permissive - matches sheet IDs in various formats
        const flexiblePattern1 = /([A-Z]{1,4}[-._ ]?\d{1,6}(?:\.[A-Z0-9]+)?)/gi;
        let match;
        while ((match = flexiblePattern1.exec(text)) !== null) {
          const id = match[1] || match[0];
          const cleanedId = id.trim().replace(/\s+/g, '').toUpperCase();
          if (!itemMatches.includes(cleanedId)) {
            itemMatches.push(cleanedId);
          }
        }
      }
      
      if (itemMatches.length === 0) {
        // Pattern 2: Even more permissive - no separator required
        const flexiblePattern2 = /([A-Z]{1,4}\d{1,6}(?:\.[A-Z0-9]+)?)/gi;
        let match;
        while ((match = flexiblePattern2.exec(text)) !== null) {
          const id = match[1] || match[0];
          const cleanedId = id.trim().replace(/\s+/g, '').toUpperCase();
          if (!itemMatches.includes(cleanedId)) {
            itemMatches.push(cleanedId);
          }
        }
      }
      
      if (itemMatches.length === 0) {
        // Pattern 3: Extract ID from text that contains it (e.g., "Unit C1 A901.C1" -> "A901.C1")
        const flexiblePattern3 = /\b([A-Z]{1,4}[-._ ]?\d{1,6}(?:\.[A-Z0-9]+)?)\b/gi;
        let match;
        while ((match = flexiblePattern3.exec(text)) !== null) {
          const id = match[1] || match[0];
          const cleanedId = id.trim().replace(/\s+/g, '').toUpperCase();
          if (!itemMatches.includes(cleanedId)) {
            itemMatches.push(cleanedId);
          }
        }
      }
      
      // Add all matches from this item
      for (const id of itemMatches) {
        matches.push({ id, item });
      }
    }
    
    // If no matches in individual items, try concatenated text
    // This handles cases where the ID spans multiple text items (e.g., "A901" and ".C1" are separate)
    // Also find ALL matches in concatenated text, not just the first one
    if (matches.length === 0) {
      const concatenatedText = roiItems.map(item => item.str.trim()).join(' ');
      
      // Try to find ALL matches using flexible patterns (global flag)
      const allMatches: string[] = [];
      
      // Pattern 1: With separators and suffixes
      const flexiblePattern1 = /([A-Z]{1,4}[-._ ]?\d{1,6}(?:\.[A-Z0-9]+)?)/gi;
      let match;
      while ((match = flexiblePattern1.exec(concatenatedText)) !== null) {
        const id = match[1] || match[0];
        const cleanedId = id.trim().replace(/\s+/g, '').toUpperCase();
        if (!allMatches.includes(cleanedId)) {
          allMatches.push(cleanedId);
        }
      }
      
      // Pattern 2: Without separators
      if (allMatches.length === 0) {
        const flexiblePattern2 = /([A-Z]{1,4}\d{1,6}(?:\.[A-Z0-9]+)?)/gi;
        while ((match = flexiblePattern2.exec(concatenatedText)) !== null) {
          const id = match[1] || match[0];
          const cleanedId = id.trim().replace(/\s+/g, '').toUpperCase();
          if (!allMatches.includes(cleanedId)) {
            allMatches.push(cleanedId);
          }
        }
      }
      
      // Pattern 3: With word boundaries
      if (allMatches.length === 0) {
        const flexiblePattern3 = /\b([A-Z]{1,4}[-._ ]?\d{1,6}(?:\.[A-Z0-9]+)?)\b/gi;
        while ((match = flexiblePattern3.exec(concatenatedText)) !== null) {
          const id = match[1] || match[0];
          const cleanedId = id.trim().replace(/\s+/g, '').toUpperCase();
          if (!allMatches.includes(cleanedId)) {
            allMatches.push(cleanedId);
          }
        }
      }
      
      // Add all found matches (they'll be scored and ranked later)
      for (const id of allMatches) {
        // Use the first item as the source for positioning (we'll score based on ID quality)
        matches.push({ id, item: roiItems[0] });
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
    
    // Score and rank matches to pick the best one
    // Score factors:
    // 1. Completeness: IDs with suffix (e.g., "A901.C1") are better than partial (e.g., "C1")
    // 2. Length: Longer IDs are generally more complete
    // 3. Structure: IDs with separators or suffixes follow expected patterns
    // 4. Anchor proximity: Closer to anchor keywords is better
    const scoredMatches = matches.map(match => {
      let score = 0;
      const id = match.id;
      
      // Base score from length (longer = better, but not too long)
      score += Math.min(id.length * 2, 20);
      
      // Bonus for having a suffix (e.g., ".C1", ".D", ".08")
      if (id.includes('.') && /\.([A-Z0-9]+)$/i.test(id)) {
        score += 15;
      }
      
      // Bonus for having a separator (e.g., "A-101", "A.101")
      if (/[-._ ]/.test(id)) {
        score += 5;
      }
      
      // Bonus for having multiple letters (e.g., "AD101" vs "A101")
      const letterCount = (id.match(/[A-Z]/gi) || []).length;
      if (letterCount >= 2) {
        score += 5;
      }
      
      // Bonus for having multiple digits (e.g., "A901" vs "A9")
      const digitCount = (id.match(/\d/g) || []).length;
      if (digitCount >= 3) {
        score += 5;
      }
      
      // Penalty for very short IDs that are likely partial matches
      // (e.g., "C1", "B3" are probably unit identifiers, not sheet IDs)
      if (id.length <= 3 && !id.includes('.') && digitCount <= 2) {
        score -= 20; // Heavy penalty for short, simple IDs
      }
      
      // Penalty for IDs that look like partial words (e.g., "EVEL1" from "LEVEL1")
      if (/^[A-Z]{4,}\d+$/i.test(id) && !/^[A-Z]{1,3}\d+/i.test(id)) {
        score -= 15; // Likely a partial word match
      }
      
      // Anchor proximity bonus (if anchors exist)
      if (anchorItems.length > 0) {
        const dist = this.distanceToNearestAnchor(match.item, anchorItems);
        // Closer is better: 0-50px = +10, 50-100px = +5, >100px = 0
        if (dist < 50) {
          score += 10;
        } else if (dist < 100) {
          score += 5;
        }
      }
      
      return { match, score };
    });
    
    // Sort by score (highest first)
    scoredMatches.sort((a, b) => b.score - a.score);
    
    const bestMatch = scoredMatches[0].match;
    const confidence = this.calculateConfidence([bestMatch], anchorItems);
    
    let multipleMatchesWarning: string | undefined;
    if (matches.length > 1) {
      const matchIds = matches.map(m => m.id).join(', ');
      const selectionReason = anchorItems.length > 0 
        ? 'anchor proximity and completeness'
        : 'completeness and structure';
      multipleMatchesWarning = `ROI ${roiIndex + 1} multiple matches: Found ${matches.length} candidate(s): ${matchIds}. Selected "${bestMatch.id}" based on ${selectionReason}.`;
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
      // Use strict containment for title extraction - entire text item must be within ROI
      // This prevents picking up text that's partially outside the ROI (like "DATE" above the title box)
      const roiItems = page.getTextInROI(roi, true);
      
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

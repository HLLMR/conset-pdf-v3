import type { SheetLocator, SheetLocationResult } from './sheetLocator.js';
import type { PageContext } from '../analyze/pageContext.js';
import type { LayoutProfile } from '../layout/types.js';
import { normalizeDrawingsSheetId } from '../parser/normalize.js';
import { assembleTextVisual, type VisualTextItem } from '../analyze/readingOrder.js';

/**
 * ROI-based sheet locator using layout profile
 */
export class RoiSheetLocator implements SheetLocator {
  private profile: LayoutProfile;
  private defaultPattern: RegExp;
  
  // Internal constants for geometry-aware detection
  private static readonly DEFAULT_ID_PAD_NORM = 0.002; // Tiny expansion to tolerate drift
  
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
    // Get text items in ROI with small padding to tolerate drift
    // Use overlap mode to be more tolerant of items near ROI boundaries
    const roiItems = page.getTextItemsInROI(roi, {
      padNorm: RoiSheetLocator.DEFAULT_ID_PAD_NORM,
      intersectionMode: 'overlap',
      overlapThreshold: 0.3, // Lower threshold to catch items that are mostly in ROI
    });
    
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
    
    // Candidate-based matching: test regex on each item independently, then try small spatial merges
    type Candidate = {
      id: string;
      items: VisualTextItem[]; // Items that make up this candidate
      bbox: { x: number; y: number; width: number; height: number }; // Bounding box
      charCount: number; // Total character count
      tokenCount: number; // Number of items merged
    };
    
    const candidates: Candidate[] = [];
    
    // Helper to test regex patterns on text
    const findMatchesInText = (text: string): string[] => {
      const matches: string[] = [];
      
      // Try configured pattern first
      const defaultMatches = text.matchAll(this.defaultPattern);
      for (const match of defaultMatches) {
        const id = match[1] || match[0];
        const cleanedId = id.trim().replace(/\s+/g, '').toUpperCase();
        if (!matches.includes(cleanedId)) {
          matches.push(cleanedId);
        }
      }
      
      // If no matches, try flexible patterns
      if (matches.length === 0) {
        const patterns = [
          /([A-Z]{1,4}[-._ ]?\d{1,6}(?:\.[A-Z0-9]+)?)/gi,
          /([A-Z]{1,4}\d{1,6}(?:\.[A-Z0-9]+)?)/gi,
          /\b([A-Z]{1,4}[-._ ]?\d{1,6}(?:\.[A-Z0-9]+)?)\b/gi,
        ];
        
        for (const pattern of patterns) {
          let match;
          while ((match = pattern.exec(text)) !== null) {
            const id = match[1] || match[0];
            const cleanedId = id.trim().replace(/\s+/g, '').toUpperCase();
            if (!matches.includes(cleanedId)) {
              matches.push(cleanedId);
            }
          }
          if (matches.length > 0) break;
        }
      }
      
      return matches;
    };
    
    // Helper to compute bounding box for items
    const computeBbox = (items: VisualTextItem[]): { x: number; y: number; width: number; height: number } => {
      if (items.length === 0) {
        return { x: 0, y: 0, width: 0, height: 0 };
      }
      const minX = Math.min(...items.map(item => item.x));
      const maxX = Math.max(...items.map(item => item.x + item.width));
      const minY = Math.min(...items.map(item => item.y));
      const maxY = Math.max(...items.map(item => item.y + item.height));
      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    };
    
    // Step 1: Test regex on each item independently
    for (const item of roiItems) {
      const text = item.str.trim();
      if (!text) continue;
      
      const matches = findMatchesInText(text);
      for (const id of matches) {
        candidates.push({
          id,
          items: [item],
          bbox: computeBbox([item]),
          charCount: id.length,
          tokenCount: 1,
        });
      }
    }
    
    // Step 2: If no matches, try small merges of spatial neighbors (pairs only)
    if (candidates.length === 0) {
      // Sort items by y (top to bottom), then x (left to right) for consistent neighbor finding
      const sortedItems = [...roiItems].sort((a, b) => {
        const yDiff = Math.abs(a.y - b.y);
        if (yDiff > 10) {
          return a.y - b.y; // Different lines
        }
        return a.x - b.x; // Same line
      });
      
      // Try merging each item with its nearest-right neighbor (same line)
      for (let i = 0; i < sortedItems.length; i++) {
        const item = sortedItems[i];
        const itemText = item.str.trim();
        if (!itemText) continue;
        
        // Find nearest-right neighbor on same line (y within tolerance)
        const lineTol = 10;
        let nearestRight: VisualTextItem | null = null;
        let minXDist = Infinity;
        
        for (let j = i + 1; j < sortedItems.length; j++) {
          const other = sortedItems[j];
          const yDiff = Math.abs(other.y - item.y);
          if (yDiff <= lineTol && other.x > item.x) {
            const xDist = other.x - (item.x + item.width);
            if (xDist < minXDist && xDist < 50) { // Only consider nearby items
              minXDist = xDist;
              nearestRight = other;
            }
          }
        }
        
        if (nearestRight) {
          const mergedText = itemText + nearestRight.str.trim();
          const matches = findMatchesInText(mergedText);
          for (const id of matches) {
            candidates.push({
              id,
              items: [item, nearestRight],
              bbox: computeBbox([item, nearestRight]),
              charCount: id.length,
              tokenCount: 2,
            });
          }
        }
        
        // Try merging with nearest-below neighbor (next line, near x overlap)
        let nearestBelow: VisualTextItem | null = null;
        let minYDist = Infinity;
        
        for (let j = i + 1; j < sortedItems.length; j++) {
          const other = sortedItems[j];
          if (other.y > item.y) {
            // Check x overlap
            const itemRight = item.x + item.width;
            const otherRight = other.x + other.width;
            if (item.x < otherRight && itemRight > other.x) {
              const yDist = other.y - (item.y + item.height);
              if (yDist < minYDist && yDist < 30) { // Only consider nearby items
                minYDist = yDist;
                nearestBelow = other;
              }
            }
          }
        }
        
        if (nearestBelow) {
          const mergedText = itemText + ' ' + nearestBelow.str.trim();
          const matches = findMatchesInText(mergedText);
          for (const id of matches) {
            candidates.push({
              id,
              items: [item, nearestBelow],
              bbox: computeBbox([item, nearestBelow]),
              charCount: id.length,
              tokenCount: 2,
            });
          }
        }
      }
    }
    
    // Convert candidates to matches format for compatibility with existing scoring
    // Note: item is typed as 'any' because it's a TextItemWithPosition from PDF.js text extraction
    // The exact shape varies and isn't fully typed in pdfjs-dist
    const matches: Array<{ id: string; item: any; candidate?: Candidate }> = candidates.map(candidate => ({
      id: candidate.id,
      item: candidate.items[0], // Use first item for positioning
      candidate,
    }));
    
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
    
    // Score and rank candidates to pick the best one
    // Score factors:
    // 1. Completeness: IDs with suffix (e.g., "A901.C1") are better than partial (e.g., "C1")
    // 2. Length: Longer IDs are generally more complete
    // 3. Structure: IDs with separators or suffixes follow expected patterns
    // 4. Geometry: Smaller bounding boxes are better (sheet IDs are compact)
    // 5. Position: Prefer candidates closer to bottom-right of ROI
    // 6. Token count: Prefer candidates made from fewer items (less merging = more reliable)
    // 7. Anchor proximity: Closer to anchor keywords is better
    const scoredMatches = matches.map(match => {
      let score = 0;
      const id = match.id;
      const candidate = match.candidate;
      
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
      
      // Geometry-aware scoring: prefer smaller bounding boxes (sheet IDs are compact)
      if (candidate) {
        const bboxArea = candidate.bbox.width * candidate.bbox.height;
        // Smaller area = better (sheet IDs are compact)
        // Normalize by page area to get relative size
        const pageArea = page.pageWidth * page.pageHeight;
        const relativeArea = bboxArea / pageArea;
        // Score: smaller relative area gets higher score (max +10 points)
        score += Math.max(0, 10 - relativeArea * 10000);
        
        // Prefer candidates closer to bottom-right of ROI
        // ROI bottom-right in visual coordinates (top-left origin)
        const roiBottomRightX = roi.x * page.pageWidth + roi.width * page.pageWidth;
        const roiBottomRightY = page.pageHeight * (1.0 - roi.y); // Convert from bottom-left to top-left
        const candidateCenterX = candidate.bbox.x + candidate.bbox.width / 2;
        const candidateCenterY = candidate.bbox.y + candidate.bbox.height / 2;
        const distToBottomRight = Math.sqrt(
          Math.pow(candidateCenterX - roiBottomRightX, 2) +
          Math.pow(candidateCenterY - roiBottomRightY, 2)
        );
        // Closer to bottom-right = better (max +5 points)
        const maxDist = Math.sqrt(Math.pow(page.pageWidth, 2) + Math.pow(page.pageHeight, 2));
        score += Math.max(0, 5 * (1 - distToBottomRight / maxDist));
        
        // Penalty for candidates made from too many items (prefer single items or small merges)
        if (candidate.tokenCount > 2) {
          score -= 10; // Penalty for merging more than 2 items
        } else if (candidate.tokenCount === 2) {
          score -= 2; // Small penalty for merging 2 items
        }
        
        // Penalty for candidates with too many characters (likely contamination)
        if (candidate.charCount > id.length * 1.5) {
          score -= 15; // Heavy penalty if candidate text is much longer than matched ID
        }
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
      
      return { match, score, candidate };
    });
    
    // Exception rule: Allow very short compact candidates if they're the only one and closest to anchor
    // This handles cases like "L6" that are valid but get penalized by normal scoring
    if (anchorItems.length > 0 && scoredMatches.length > 0) {
      const pageArea = page.pageWidth * page.pageHeight;
      const compactCandidates = scoredMatches.filter(scored => {
        const candidate = scored.candidate;
        if (!candidate) return false;
        
        const id = scored.match.id;
        // Must be <= 3 characters
        if (id.length > 3) return false;
        
        // Must have very small bounding box (compact)
        const bboxArea = candidate.bbox.width * candidate.bbox.height;
        const relativeArea = bboxArea / pageArea;
        // Consider "very small" as less than 0.0001 of page area (e.g., < 100px² on a 1000x1000 page)
        if (relativeArea >= 0.0001) return false;
        
        return true;
      });
      
      // Only apply exception if there's exactly ONE compact candidate
      if (compactCandidates.length === 1) {
        const compactCandidate = compactCandidates[0];
        
        // Check if it's the closest to anchor
        const compactDist = this.distanceToNearestAnchor(compactCandidate.match.item, anchorItems);
        const isClosestToAnchor = scoredMatches.every(scored => {
          if (scored === compactCandidate) return true;
          const otherDist = this.distanceToNearestAnchor(scored.match.item, anchorItems);
          return compactDist <= otherDist;
        });
        
        // Check if there are any longer valid candidates (length > 3)
        const longerCandidates = scoredMatches.filter(scored => {
          return scored.match.id.length > 3 && scored !== compactCandidate;
        });
        
        // Only allow compact candidate if:
        // 1. It's closest to anchor
        // 2. There are NO longer valid candidates (never override longer candidates)
        if (isClosestToAnchor && longerCandidates.length === 0) {
          // Boost the score significantly to make it the best match
          // Add enough points to overcome the -20 penalty and then some
          compactCandidate.score += 50;
        }
      }
    }
    
    // Sort by score (highest first), then by deterministic tie-breakers
    scoredMatches.sort((a, b) => {
      // Primary: score (descending)
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // Tie-breaker 1: smaller bbox area (ascending)
      if (a.candidate && b.candidate) {
        const aArea = a.candidate.bbox.width * a.candidate.bbox.height;
        const bArea = b.candidate.bbox.width * b.candidate.bbox.height;
        if (aArea !== bArea) {
          return aArea - bArea;
        }
      }
      // Tie-breaker 2: x position (ascending - prefer leftmost)
      if (a.match.item.x !== b.match.item.x) {
        return a.match.item.x - b.match.item.x;
      }
      // Tie-breaker 3: y position (ascending - prefer topmost)
      return a.match.item.y - b.match.item.y;
    });
    
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
    
    // Validate prefix if configured (permissive: allow any 1-3 letter alphanumeric prefix)
    if (this.profile.validation?.allowedPrefixes) {
      const normalized = normalizeDrawingsSheetId(bestMatch.id);
      const prefix = normalized.match(/^([A-Z0-9]{1,3})/)?.[1];
      if (prefix) {
        // Check if prefix matches allowed list (recommended prefixes)
        const isAllowed = this.profile.validation.allowedPrefixes.includes(prefix);
        
        // Also check if it's a valid alphanumeric prefix (1-3 characters)
        const isValidFormat = /^[A-Z0-9]{1,3}$/.test(prefix);
        
        if (!isAllowed && isValidFormat) {
          // Prefix is valid format but not in recommended list - allow it but warn
          // Don't reject - just note it's not in the recommended list
          if (roiIndex === 0) { // Only warn on first ROI to avoid spam
            // This is informational - we allow it
          }
        } else if (!isValidFormat) {
          // Invalid format - reject
          return {
            confidence: 0.0,
            warning: `ROI ${roiIndex + 1} prefix rejected: ID "${bestMatch.id}" has invalid prefix "${prefix}" (must be 1-3 alphanumeric characters)`,
            failureReason: 'ROI_PREFIX_REJECTED',
          };
        }
        // If prefix is in allowed list or valid format, continue
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
      // Use overlap mode with small padding for title extraction to handle drift
      // This is more tolerant than strict containment while still filtering out distant text
      let roiItems = page.getTextItemsInROI(roi, {
        padNorm: RoiSheetLocator.DEFAULT_ID_PAD_NORM,
        intersectionMode: 'overlap',
        overlapThreshold: 0.3,
      });
        
      if (roiItems.length === 0) continue;
        
      // For rotated pages, filter out items that are clearly outside the title block region
      // (e.g., project info at the top, drawing content at the bottom)
      // This helps when the ROI spans too large a vertical range
      // Note: Since text items are now in visual coordinates, this filtering works for all rotations
      const rotation = page.rotation || 0;
      if (rotation !== 0) {
        // Find sheet ID location to use as reference
        const sheetIdItems = page.getTextItems().filter(item => 
          /^[A-Z]{1,3}\d+[.\-]\d+[A-Z]?$/i.test(item.str.trim())
        );
        if (sheetIdItems.length > 0) {
          const sheetIdY = Math.min(...sheetIdItems.map(item => item.y));
          // Title should be above or near sheet ID, but not too high (avoid project info)
          // Filter to items between y=sheetIdY-100 and y=sheetIdY+30 (around sheet ID level)
          // This allows for titles that might span multiple lines
          const minY = sheetIdY - 100;
          const maxY = sheetIdY + 30;
          roiItems = roiItems.filter(item => item.y >= minY && item.y <= maxY);
        }
      }
        
      if (roiItems.length === 0) continue;
      
      // Filter out metadata words and project information
      // Only filter if the text IS metadata (exact matches or common patterns), not if it just contains the word
      const titleCandidates = roiItems.filter(item => {
        const text = item.str.trim();
        // Keep single characters/numbers if they're not just whitespace
        if (text.length === 0) return false;
        if (text.length === 1 && text === ' ') return false; // Skip single spaces
        // Keep dashes and single digits - they're part of titles
        if (text === '-' || /^\d$/.test(text)) return true;
        if (/^[A-Z]{1,3}\s*\d+/.test(text)) return false; // Skip sheet numbers like "S1.0"
        if (/\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}/.test(text)) return false; // Skip dates
        if (/^[A-Z]{2,4}$/.test(text) && text.length <= 3) {
          // Skip very short all-caps that might be initials, but keep longer words
          // This is a heuristic - might need adjustment
          return false;
        }
        
        // Filter out project information patterns
        const projectInfoPatterns = [
          /^RICHARDSON\s+INDEPENDENT\s+SCHOOL\s+DISTRICT$/i,
          /^PARTIAL\s+HVAC\s+REPLACEMENT$/i,
          /^LAKE\s+HIGHLANDS\s+HIGH\s+SCHOOL$/i,
          /^\d+\s+CHURCH\s+ROAD/i,
          /DALLAS,\s+TEXAS/i,
          /^9449\s+CHURCH\s+ROAD/i
        ];
        
        // If it matches a project info pattern, filter it out
        if (projectInfoPatterns.some(pattern => pattern.test(text))) return false;
        
        // Only filter if text is clearly metadata (exact matches or common metadata patterns)
        const metadataPatterns = [
          /^SHEET\s+NO\.?$/i,
          /^DWG\s+NO\.?$/i,
          /^DRAWING\s+NO\.?$/i,
          /^REV\.?$/i,
          /^DATE$/i,
          /^SCALE$/i,
          /^SIZE$/i,
          /^APPROVED\s+BY$/i,
          /^CHECKED\s+BY$/i,
          /^DRAWN\s+BY$/i,
          /^AUTHOR$/i,
          /^CHECKER$/i,
          /^APPROVER$/i
        ];
        
        // If it matches a metadata pattern exactly, filter it out
        if (metadataPatterns.some(pattern => pattern.test(text))) return false;
        
        // Otherwise keep it (even if it contains words like "NOTES" or "GENERAL")
        return true;
      });
      
      if (titleCandidates.length > 0) {
        // Use visual reading-order assembly to handle wrapped titles correctly
        // Convert to VisualTextItem format
        const visualItems: VisualTextItem[] = titleCandidates.map(item => ({
          str: item.str,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
        }));
        
        // Assemble using visual reading order (handles wrapping correctly)
        const titleText = assembleTextVisual(visualItems, {
          joinLines: 'space', // Titles often wrap but should read as one line
        });
        
        // Clean up multiple spaces and normalize dashes
        const cleanedTitle = titleText
          .replace(/\s+/g, ' ') // Multiple spaces to single space
          .replace(/\s*-\s*/g, ' - ') // Normalize dash spacing
          .trim();
        
        if (cleanedTitle.length > 0) {
          const maxLength = this.profile.sheetTitle.maxLength || 100;
          return cleanedTitle.length > maxLength ? cleanedTitle.substring(0, maxLength) + '...' : cleanedTitle;
        }
      }
    }
    
    return undefined;
  }
}

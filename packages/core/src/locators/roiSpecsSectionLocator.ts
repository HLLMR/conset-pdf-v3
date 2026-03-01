import type { SheetLocator, SheetLocationResult } from './sheetLocator.js';
import type { PageContext } from '../analyze/pageContext.js';
import type { LayoutProfile } from '../layout/types.js';
import { assembleTextVisual, type VisualTextItem } from '../analyze/readingOrder.js';
import { normalizeSpecsSectionId } from '../parser/normalize.js';

/**
 * ROI-based specs section locator.
 *
 * Detection rules:
 * - Section ID must match strict header token: "SECTION XX YY ZZ"
 * - Returned id strips "SECTION" and keeps "XX YY ZZ"
 * - Section title is extracted only when Section ID is positively detected
 */
export class RoiSpecsSectionLocator implements SheetLocator {
  private profile: LayoutProfile;
  private static readonly STRICT_SECTION_PATTERN = /\bSECTION\s+(\d{2}\s+\d{2}\s+\d{2})\b/i;
  private static readonly DEFAULT_PAD_NORM = 0.002;
  private static readonly TITLE_UPWARD_EXPAND_NORM = 0.025;
  private static readonly PART_ONE_GENERAL_PATTERN = /\bPART\s+1\s*-\s*GENERAL\b/i;
  private static readonly PART_ONE_GENERAL_SUFFIX_PATTERN = /\s*\bPART\s+1\s*-\s*GENERAL\b\s*$/i;
  private static readonly SECTION_PREFIX_PATTERN = /\bSECTION\s+\d{2}\s+\d{2}\s+\d{2}\b\s*[-:–—]?\s*/gi;

  constructor(profile: LayoutProfile) {
    this.profile = profile;
  }

  getName(): string {
    return `ROI-SPECS-${this.profile.name}`;
  }

  private sanitizeTitle(rawTitle: string): { title?: string; isPartOnly: boolean } {
    const withoutSectionPrefix = rawTitle
      .replace(RoiSpecsSectionLocator.SECTION_PREFIX_PATTERN, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const isPartOnly = RoiSpecsSectionLocator.PART_ONE_GENERAL_PATTERN.test(withoutSectionPrefix)
      && withoutSectionPrefix.replace(RoiSpecsSectionLocator.PART_ONE_GENERAL_PATTERN, '').trim().length === 0;

    const withoutPartSuffix = withoutSectionPrefix
      .replace(RoiSpecsSectionLocator.PART_ONE_GENERAL_SUFFIX_PATTERN, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!withoutPartSuffix) {
      return { title: undefined, isPartOnly };
    }

    return {
      title: withoutPartSuffix,
      isPartOnly,
    };
  }

  private getExpandedUpwardRoi(roi: { x: number; y: number; width: number; height: number }) {
    const expandBy = Math.min(
      RoiSpecsSectionLocator.TITLE_UPWARD_EXPAND_NORM,
      Math.max(0, 1 - (roi.y + roi.height))
    );

    return {
      x: roi.x,
      y: roi.y,
      width: roi.width,
      height: roi.height + expandBy,
    };
  }

  async locate(page: PageContext): Promise<SheetLocationResult> {
    const warnings: string[] = [];

    let sectionId: string | undefined;
    let sectionIdNormalized: string | undefined;
    let matchedROI: number | undefined;

    for (let i = 0; i < this.profile.sheetId.rois.length; i++) {
      const roi = this.profile.sheetId.rois[i];
      const roiItems = page.getTextItemsInROI(roi, {
        padNorm: RoiSpecsSectionLocator.DEFAULT_PAD_NORM,
        intersectionMode: 'overlap',
        overlapThreshold: 0.3,
      }) as VisualTextItem[];

      if (roiItems.length === 0) {
        warnings.push(`ROI ${i + 1} empty: No text found in Section ID ROI`);
        continue;
      }

      const roiText = assembleTextVisual(roiItems, { joinLines: 'space' }).trim();
      const match = roiText.match(RoiSpecsSectionLocator.STRICT_SECTION_PATTERN);
      if (!match) {
        warnings.push(`ROI ${i + 1} no strict SECTION match`);
        continue;
      }

      // Validate that the matched text is in ALL CAPS (section headers are always all caps)
      const matchedText = match[0]; // e.g., "SECTION 01 60 00"
      if (matchedText !== matchedText.toUpperCase()) {
        warnings.push(`ROI ${i + 1} section match not in ALL CAPS (found: "${matchedText}")`);
        continue;
      }

      // Check that the section header is not buried in body text
      // Reject if text before match looks like inline reference (contains prepositions, articles, etc.)
      const beforeMatch = (roiText.substring(0, match.index || 0).trim() || '').toLowerCase();
      
      // Signs of inline reference/body text before the match
      const inlineIndicators = [
        /\bas\s+(specified|required|noted|stated|described)/i,
        /\bper\s+(section|the)/i,
        /\baccording\s+to/i,
        /\bin\s+(section|accordance|compliance)/i,
        /\breakout\s+by/i,
        /\brefer\s+to/i,
        /,\s*$/, // ends with comma (inline)
        /\b(and|or|as|per|except|unless|where|if|per)\s*$/i, // ends with conjunction
      ];
      
      const hasInlineIndicators = inlineIndicators.some(pattern => pattern.test(beforeMatch));
      
      if (hasInlineIndicators) {
        warnings.push(`ROI ${i + 1} section match found but appears to be inline reference`);
        continue;
      }

      const rawId = match[1].replace(/\s+/g, ' ').trim();
      sectionId = rawId;
      sectionIdNormalized = normalizeSpecsSectionId(rawId);
      matchedROI = i;
      break;
    }

    let title: string | undefined;
    if (sectionId && this.profile.sheetTitle && this.profile.sheetTitle.rois.length > 0) {
      const baseTitleRoi = this.profile.sheetTitle.rois[0];
      const titleItems = page.getTextItemsInROI(baseTitleRoi, {
        padNorm: RoiSpecsSectionLocator.DEFAULT_PAD_NORM,
        intersectionMode: 'overlap',
        overlapThreshold: 0.3,
      }) as VisualTextItem[];

      if (titleItems.length > 0) {
        const extractedTitle = assembleTextVisual(titleItems, { joinLines: 'space' }).trim();
        const sanitizedBase = this.sanitizeTitle(extractedTitle);

        if (sanitizedBase.isPartOnly) {
          const expandedUpwardRoi = this.getExpandedUpwardRoi(baseTitleRoi);
          const expandedTitleItems = page.getTextItemsInROI(expandedUpwardRoi, {
            padNorm: RoiSpecsSectionLocator.DEFAULT_PAD_NORM,
            intersectionMode: 'overlap',
            overlapThreshold: 0.3,
          }) as VisualTextItem[];

          if (expandedTitleItems.length > 0) {
            const expandedTitle = assembleTextVisual(expandedTitleItems, { joinLines: 'space' }).trim();
            const sanitizedExpanded = this.sanitizeTitle(expandedTitle);

            if (sanitizedExpanded.title && sanitizedExpanded.title === sanitizedExpanded.title.toUpperCase()) {
              title = sanitizedExpanded.title;
            } else if (sanitizedExpanded.title) {
              warnings.push(`Expanded title ROI text not in ALL CAPS (found: "${sanitizedExpanded.title}")`);
            } else {
              warnings.push('Expanded title ROI did not produce a usable section title');
            }
          } else {
            warnings.push('Expanded title ROI empty while trying to recover from PART 1 - GENERAL');
          }
        } else if (sanitizedBase.title && sanitizedBase.title === sanitizedBase.title.toUpperCase()) {
          title = sanitizedBase.title;
        } else if (sanitizedBase.title) {
          warnings.push(`Title ROI text not in ALL CAPS (found: "${sanitizedBase.title}"), likely not a section title`);
        }
      }
    }

    return {
      id: sectionId,
      sectionIdNormalized,
      title,
      confidence: sectionId ? 1.0 : 0.0,
      method: `ROI-SPECS-${matchedROI !== undefined ? matchedROI + 1 : 'none'}`,
      warnings,
      context: sectionId
        ? `Strict SECTION match in ROI ${(matchedROI || 0) + 1}`
        : 'No strict SECTION header detected in configured ROIs',
    };
  }
}

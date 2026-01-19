/**
 * Profile validation
 * 
 * Validates profiles against measurable gates to ensure quality.
 */

import type { TemplateProfile, SpecProfile, SheetTemplateProfile, EquipmentSubmittalProfile } from './types.js';
import type { LayoutTranscript } from '../types.js';
import { generateCandidates } from '../candidates.js';

/**
 * Profile validation result
 */
export interface ProfileValidation {
  /** Whether profile passes all validation gates */
  valid: boolean;
  /** Validation gate results */
  gates: {
    /** Header/footer coverage ≥ 80% */
    headerFooterCoverage: boolean;
    /** Heading detection produces consistent hierarchy */
    headingHierarchy: boolean;
    /** Body band excludes ≥95% of headers/footers */
    bodyBandExclusion: boolean;
    /** Schedule column structure stable */
    scheduleStructure: boolean;
  };
  /** Issues found during validation */
  issues: string[];
  /** Confidence score (0.0-1.0) */
  confidence: number;
}

/**
 * Validate a profile against a transcript
 * 
 * @param profile Profile to validate
 * @param transcript Transcript to validate against
 * @returns Validation result
 */
export function validateProfile(
  profile: TemplateProfile,
  transcript: LayoutTranscript
): ProfileValidation {
  const candidates = generateCandidates(transcript);
  const issues: string[] = [];
  let confidence = 1.0;
  
  // Validate based on profile type
  if (profile.docType === 'spec') {
    return validateSpecProfile(profile, transcript, candidates, issues, confidence);
  } else if (profile.docType === 'drawing') {
    return validateSheetTemplateProfile(profile, transcript, candidates, issues, confidence);
  } else if (profile.docType === 'equipmentSubmittal') {
    return validateEquipmentSubmittalProfile(profile, transcript, candidates, issues, confidence);
  }
  
  // Unknown profile type
  return {
    valid: false,
    gates: {
      headerFooterCoverage: false,
      headingHierarchy: false,
      bodyBandExclusion: false,
      scheduleStructure: false,
    },
    issues: ['Unknown profile type'],
    confidence: 0.0,
  };
}

/**
 * Validate spec profile
 */
function validateSpecProfile(
  profile: SpecProfile,
  transcript: LayoutTranscript,
  candidates: any,
  issues: string[],
  baseConfidence: number
): ProfileValidation {
  const gates = {
    headerFooterCoverage: false,
    headingHierarchy: false,
    bodyBandExclusion: false,
    scheduleStructure: true, // Not applicable for specs
  };
  
  let confidence = baseConfidence;
  
  // Check header/footer coverage
  const headerBands = candidates.headerBands || [];
  const footerBands = candidates.footerBands || [];
  
  if (headerBands.length > 0 && footerBands.length > 0) {
    // Check if detected bands align with profile regions
    const headerCoverage = checkRegionCoverage(profile.regions.header, headerBands, transcript);
    const footerCoverage = checkRegionCoverage(profile.regions.footer, footerBands, transcript);
    
    const avgCoverage = (headerCoverage + footerCoverage) / 2;
    gates.headerFooterCoverage = avgCoverage >= 0.80;
    
    if (!gates.headerFooterCoverage) {
      issues.push(`Header/footer coverage (${(avgCoverage * 100).toFixed(1)}%) is below 80%`);
      confidence *= 0.8;
    }
  } else {
    issues.push('No header/footer bands detected');
    confidence *= 0.6;
  }
  
  // Check heading hierarchy
  const headingCandidates = candidates.headingCandidates || [];
  if (headingCandidates.length > 0) {
    // Check if heading levels match profile outline levels
    const levels = new Set(headingCandidates.map((h: any) => h.level));
    const expectedLevels = new Set(profile.outline.levels.map(l => l.level));
    
    const levelMatch = Array.from(levels).filter((l) => expectedLevels.has(l as number)).length / Math.max(levels.size, expectedLevels.size);
    gates.headingHierarchy = levelMatch >= 0.70;
    
    if (!gates.headingHierarchy) {
      issues.push(`Heading level match (${(levelMatch * 100).toFixed(1)}%) is below 70%`);
      confidence *= 0.8;
    }
  } else {
    issues.push('No heading candidates detected');
    confidence *= 0.7;
  }
  
  // Check body band exclusion
  const bodyExclusion = checkBodyBandExclusion(profile.regions.body, profile.regions.header, profile.regions.footer, transcript);
  gates.bodyBandExclusion = bodyExclusion >= 0.95;
  
  if (!gates.bodyBandExclusion) {
    issues.push(`Body band exclusion (${(bodyExclusion * 100).toFixed(1)}%) is below 95%`);
    confidence *= 0.9;
  }
  
  return {
    valid: Object.values(gates).every(g => g),
    gates,
    issues,
    confidence: Math.max(0.0, Math.min(1.0, confidence)),
  };
}

/**
 * Validate sheet template profile
 */
function validateSheetTemplateProfile(
  profile: SheetTemplateProfile,
  _transcript: LayoutTranscript,
  candidates: any,
  issues: string[],
  baseConfidence: number
): ProfileValidation {
  const gates = {
    headerFooterCoverage: true, // Not primary concern for drawings
    headingHierarchy: true, // Not applicable
    bodyBandExclusion: true, // Not applicable
    scheduleStructure: false,
  };
  
  let confidence = baseConfidence;
  
  // Check schedule structure stability
  if (profile.schedules.length > 0) {
    const tableCandidates = candidates.tableCandidates || [];
    if (tableCandidates.length > 0) {
      // Check if detected tables align with profile schedules
      const scheduleMatch = tableCandidates.length / Math.max(profile.schedules.length, 1);
      gates.scheduleStructure = scheduleMatch >= 0.80;
      
      if (!gates.scheduleStructure) {
        issues.push(`Schedule structure match (${(scheduleMatch * 100).toFixed(1)}%) is below 80%`);
        confidence *= 0.8;
      }
    } else {
      issues.push('No table candidates detected for schedules');
      confidence *= 0.7;
    }
  } else {
    gates.scheduleStructure = true; // No schedules to validate
  }
  
  return {
    valid: Object.values(gates).every(g => g),
    gates,
    issues,
    confidence: Math.max(0.0, Math.min(1.0, confidence)),
  };
}

/**
 * Validate equipment submittal profile
 */
function validateEquipmentSubmittalProfile(
  profile: EquipmentSubmittalProfile,
  _transcript: LayoutTranscript,
  candidates: any,
  issues: string[],
  baseConfidence: number
): ProfileValidation {
  const gates = {
    headerFooterCoverage: true, // Not primary concern
    headingHierarchy: true, // Not applicable
    bodyBandExclusion: true, // Not applicable
    scheduleStructure: false,
  };
  
  let confidence = baseConfidence;
  
  // Check table structure
  if (profile.tableDefinitions.length > 0) {
    const tableCandidates = candidates.tableCandidates || [];
    if (tableCandidates.length > 0) {
      const tableMatch = tableCandidates.length / Math.max(profile.tableDefinitions.length, 1);
      gates.scheduleStructure = tableMatch >= 0.80;
      
      if (!gates.scheduleStructure) {
        issues.push(`Table structure match (${(tableMatch * 100).toFixed(1)}%) is below 80%`);
        confidence *= 0.8;
      }
    } else {
      issues.push('No table candidates detected');
      confidence *= 0.7;
    }
  } else {
    gates.scheduleStructure = true;
  }
  
  return {
    valid: Object.values(gates).every(g => g),
    gates,
    issues,
    confidence: Math.max(0.0, Math.min(1.0, confidence)),
  };
}

/**
 * Check region coverage (how well detected bands align with profile region)
 */
function checkRegionCoverage(
  region: { x0: number; y0: number; x1: number; y1: number },
  bands: Array<{ y: number; confidence: number }>,
  _transcript: LayoutTranscript
): number {
  if (bands.length === 0) {
    return 0.0;
  }
  
  // Check if any detected band Y coordinates fall within region
  const regionYMin = region.y0;
  const regionYMax = region.y1;
  
  let matchingBands = 0;
  for (const band of bands) {
    if (band.y >= regionYMin && band.y <= regionYMax) {
      matchingBands++;
    }
  }
  
  return matchingBands / bands.length;
}

/**
 * Check body band exclusion (how well body excludes headers/footers)
 */
function checkBodyBandExclusion(
  body: { x0: number; y0: number; x1: number; y1: number },
  header: { x0: number; y0: number; x1: number; y1: number },
  footer: { x0: number; y0: number; x1: number; y1: number },
  transcript: LayoutTranscript
): number {
  let totalSpans = 0;
  let excludedSpans = 0;
  
  for (const page of transcript.pages) {
    for (const span of page.spans) {
      const [, y0, , y1] = span.bbox;
      const spanCenterY = (y0 + y1) / 2;
      
      // Check if span is in body region
      if (spanCenterY >= body.y0 && spanCenterY <= body.y1) {
        totalSpans++;
        
        // Check if span is also in header or footer (should be excluded)
        const inHeader = spanCenterY >= header.y0 && spanCenterY <= header.y1;
        const inFooter = spanCenterY >= footer.y0 && spanCenterY <= footer.y1;
        
        if (!inHeader && !inFooter) {
          excludedSpans++;
        }
      }
    }
  }
  
  return totalSpans > 0 ? excludedSpans / totalSpans : 1.0;
}

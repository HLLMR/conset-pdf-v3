import { readJson } from '../utils/fs.js';
import type { LayoutProfile } from './types.js';
import { validateROI } from './types.js';

/**
 * Load layout profile from JSON file
 */
export async function loadLayoutProfile(path: string): Promise<LayoutProfile> {
  const profile = await readJson<LayoutProfile>(path);
  const warnings: string[] = [];
  
  // Validate structure
  if (!profile.name || !profile.version) {
    throw new Error(`Invalid layout profile: missing 'name' or 'version'`);
  }
  
  if (!profile.sheetId || !profile.sheetId.rois || !Array.isArray(profile.sheetId.rois)) {
    throw new Error(`Invalid layout profile: missing or invalid 'sheetId.rois'`);
  }
  
  if (profile.sheetId.rois.length === 0) {
    throw new Error(`Invalid layout profile: 'sheetId.rois' must contain at least one ROI`);
  }
  
  // Validate all ROIs
  for (let i = 0; i < profile.sheetId.rois.length; i++) {
    const roi = profile.sheetId.rois[i];
    const validation = validateROI(roi);
    if (!validation.valid) {
      throw new Error(`Invalid ROI at sheetId.rois[${i}]: ${validation.errors.join(', ')}`);
    }
    
    // Warn about potentially misconfigured ROIs
    const roiArea = roi.width * roi.height;
    if (roiArea < 0.01) {
      warnings.push(`Warning: ROI ${i + 1} is very small (area: ${roiArea.toFixed(4)}). May not capture enough text.`);
    }
    if (roiArea > 0.5) {
      warnings.push(`Warning: ROI ${i + 1} is very large (area: ${roiArea.toFixed(4)}). May capture too much text.`);
    }
  }
  
  // Validate sheetTitle ROIs if present
  if (profile.sheetTitle?.rois) {
    for (let i = 0; i < profile.sheetTitle.rois.length; i++) {
      const roi = profile.sheetTitle.rois[i];
      const validation = validateROI(roi);
      if (!validation.valid) {
        throw new Error(`Invalid ROI at sheetTitle.rois[${i}]: ${validation.errors.join(', ')}`);
      }
    }
  }
  
  // Warn if no anchor keywords configured (reduces confidence)
  if (!profile.sheetId.anchorKeywords || profile.sheetId.anchorKeywords.length === 0) {
    warnings.push(`Warning: No anchor keywords configured. Confidence scoring may be lower.`);
  }
  
  // Warn if validation rules are strict but may be too restrictive
  if (profile.validation?.allowedPrefixes && profile.validation.allowedPrefixes.length < 3) {
    warnings.push(`Warning: Only ${profile.validation.allowedPrefixes.length} allowed prefix(es). May reject valid IDs.`);
  }
  
  // Set defaults
  if (!profile.page) {
    profile.page = {};
  }
  if (!profile.page.roiSpace) {
    profile.page.roiSpace = 'visual'; // Default to visual space
  }
  
  // Log warnings if any
  if (warnings.length > 0) {
    console.warn(`\nLayout profile "${profile.name}" warnings:`);
    warnings.forEach(w => console.warn(`  ⚠️  ${w}`));
  }
  
  return profile;
}

/**
 * Create inline layout profile from CLI ROI flags
 */
export function createInlineLayout(
  sheetIdRoi: string,
  sheetTitleRoi?: string
): LayoutProfile {
  // Parse ROI string: "x,y,width,height"
  const parseROI = (roiStr: string): { x: number; y: number; width: number; height: number } => {
    const parts = roiStr.split(',').map(s => parseFloat(s.trim()));
    if (parts.length !== 4 || parts.some(isNaN)) {
      throw new Error(`Invalid ROI format: "${roiStr}". Expected "x,y,width,height"`);
    }
    return {
      x: parts[0],
      y: parts[1],
      width: parts[2],
      height: parts[3],
    };
  };
  
  const sheetIdROI = parseROI(sheetIdRoi);
  const validation = validateROI(sheetIdROI);
  if (!validation.valid) {
    throw new Error(`Invalid sheet ID ROI: ${validation.errors.join(', ')}`);
  }
  
  const profile: LayoutProfile = {
    name: 'inline-roi',
    version: '1.0.0',
    source: 'user-defined',
    sheetId: {
      rois: [sheetIdROI],
    },
  };
  
  if (sheetTitleRoi) {
    const titleROI = parseROI(sheetTitleRoi);
    const titleValidation = validateROI(titleROI);
    if (!titleValidation.valid) {
      throw new Error(`Invalid sheet title ROI: ${titleValidation.errors.join(', ')}`);
    }
    profile.sheetTitle = {
      rois: [titleROI],
    };
  }
  
  return profile;
}

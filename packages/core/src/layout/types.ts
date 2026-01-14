/**
 * Layout Profile: User-defined regions for sheet ID and title extraction
 */

export interface NormalizedROI {
  /**
   * Normalized coordinates (0.0 - 1.0) relative to page
   * Origin: bottom-left (PDF standard)
   */
  x: number;      // Left edge (0.0 = left margin, 1.0 = right margin)
  y: number;      // Bottom edge (0.0 = bottom margin, 1.0 = top margin)
  width: number;  // Width as fraction of page width
  height: number; // Height as fraction of page height (extends upward from y)
}

export interface LayoutProfile {
  name: string;
  version: string;
  description?: string;
  
  /**
   * Page constraints (optional validation)
   */
  page?: {
    orientation?: 'landscape' | 'portrait';
    roiSpace?: 'visual' | 'pdf';  // default 'visual' (what user sees after rotation)
    minWidth?: number;             // Points
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
  };
  
  /**
   * Sheet ID extraction configuration
   */
  sheetId: {
    rois: NormalizedROI[];  // Array for fallback (try in order)
    regex?: string;          // Optional: override default pattern
    anchorKeywords?: string[]; // Optional: proximity hints
  };
  
  /**
   * Sheet title extraction (optional)
   */
  sheetTitle?: {
    rois: NormalizedROI[];  // Array for fallback
    maxLength?: number;      // Default: 100
  };
  
  /**
   * Optional validation rules
   */
  validation?: {
    requireInSheetList?: boolean;  // default false
    allowedPrefixes?: string[];    // e.g., ['M', 'E', 'P', 'A']
  };
  
  /**
   * Metadata
   */
  createdAt?: string;  // ISO timestamp
  updatedAt?: string;
  source?: 'auto-detected' | 'manual' | 'user-defined';
}

/**
 * Convert normalized ROI to absolute coordinates
 */
export function roiToAbsolute(
  roi: NormalizedROI,
  pageWidth: number,
  pageHeight: number,
  _rotation: number = 0  // Reserved for future rotation handling
): { x: number; y: number; width: number; height: number } {
  // ROI coordinates are in "visual space" (what user sees after rotation)
  // If rotation != 0, we've already normalized the page coordinates
  // So we can directly convert normalized to absolute
  
  return {
    x: roi.x * pageWidth,
    y: roi.y * pageHeight,  // PDF origin is bottom-left
    width: roi.width * pageWidth,
    height: roi.height * pageHeight,
  };
}

/**
 * Validate ROI bounds
 */
export function validateROI(roi: NormalizedROI): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (roi.x < 0 || roi.x > 1) {
    errors.push(`ROI x must be between 0 and 1, got ${roi.x}`);
  }
  if (roi.y < 0 || roi.y > 1) {
    errors.push(`ROI y must be between 0 and 1, got ${roi.y}`);
  }
  if (roi.width <= 0 || roi.width > 1) {
    errors.push(`ROI width must be between 0 and 1, got ${roi.width}`);
  }
  if (roi.height <= 0 || roi.height > 1) {
    errors.push(`ROI height must be between 0 and 1, got ${roi.height}`);
  }
  if (roi.x + roi.width > 1) {
    errors.push(`ROI extends beyond page width (x + width = ${roi.x + roi.width})`);
  }
  if (roi.y + roi.height > 1) {
    errors.push(`ROI extends beyond page height (y + height = ${roi.y + roi.height})`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

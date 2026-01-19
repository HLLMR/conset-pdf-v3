/**
 * List item detection for specs PDFs
 * 
 * Detects and parses list items with numbering sequences.
 */

import type { SpecNode } from '../ast/types.js';

/**
 * List marker patterns
 */
const LIST_PATTERNS = [
  // Lowercase alpha: "a.", "b)", etc.
  { pattern: /^(\s*)([a-z])[\.\)]\s+(.+)$/, style: 'alpha-lower' as const },
  // Uppercase alpha: "A.", "B)", etc.
  { pattern: /^(\s*)([A-Z])[\.\)]\s+(.+)$/, style: 'alpha-upper' as const },
  // Numeric: "1.", "2)", etc.
  { pattern: /^(\s*)(\d+)[\.\)]\s+(.+)$/, style: 'numeric' as const },
  // Roman numerals: "i.", "ii)", "III.", etc. (case-insensitive)
  { pattern: /^(\s*)([ivxlcdm]+)[\.\)]\s+(.+)$/i, style: 'roman' as const },
];

/**
 * Detect if a node is a list item and extract marker
 */
export function detectListItem(node: SpecNode): {
  isListItem: boolean;
  marker?: string;
  style?: 'alpha-lower' | 'alpha-upper' | 'numeric' | 'roman';
} {
  if (!node.text) {
    return { isListItem: false };
  }
  
  // Try each pattern
  for (const { pattern, style } of LIST_PATTERNS) {
    const match = node.text.match(pattern);
    if (match) {
      const marker = match[2];
      return {
        isListItem: true,
        marker,
        style,
      };
    }
  }
  
  return { isListItem: false };
}

/**
 * Infer list item level from indentation (X coordinate)
 * Uses median X coordinate clustering
 * 
 * Note: Basic implementation - level inference will be improved in hierarchy builder
 */
export function inferListLevel(_nodes: SpecNode[]): void {
  // For now, levels are set to 0 by default
  // Level inference will be improved in hierarchy builder using X coordinate clustering
}

/**
 * Track numbering sequences and detect breaks
 */
export function validateNumberingSequence(nodes: SpecNode[]): string[] {
  const issues: string[] = [];
  const levelSequences = new Map<number, { expected: string; style: string }>();
  
  for (const node of nodes) {
    const listInfo = detectListItem(node);
    if (!listInfo.isListItem) {
      continue;
    }
    
    const level = node.level;
    const marker = listInfo.marker!;
    const style = listInfo.style!;
    
    if (!levelSequences.has(level)) {
      // Start new sequence
      levelSequences.set(level, { expected: getNextMarker(marker, style), style });
    } else {
      const sequence = levelSequences.get(level)!;
      // Check if marker matches expected
      if (marker.toLowerCase() !== sequence.expected.toLowerCase()) {
        issues.push(`NUMBERING_BREAK: Expected "${sequence.expected}" but found "${marker}" at level ${level}`);
      }
      // Update expected next marker
      sequence.expected = getNextMarker(marker, style);
    }
  }
  
  return issues;
}

/**
 * Get next marker in sequence
 */
function getNextMarker(current: string, style: string): string {
  switch (style) {
    case 'alpha-lower':
      if (current === 'z') return 'aa';
      return String.fromCharCode(current.charCodeAt(0) + 1);
    case 'alpha-upper':
      if (current === 'Z') return 'AA';
      return String.fromCharCode(current.charCodeAt(0) + 1);
    case 'numeric':
      return String(parseInt(current, 10) + 1);
    case 'roman':
      // Simple increment for roman numerals (not full roman numeral math)
      return current;
    default:
      return current;
  }
}

/**
 * Detect and classify list items in nodes
 */
export function detectListItems(nodes: SpecNode[]): SpecNode[] {
  for (const node of nodes) {
    const listInfo = detectListItem(node);
    if (listInfo.isListItem) {
      node.type = 'list-item';
      node.listMarker = listInfo.marker;
    }
  }
  
  // Infer levels (basic implementation)
  inferListLevel(nodes);
  
  // Validate numbering sequences
  const issues = validateNumberingSequence(nodes);
  if (issues.length > 0) {
    // Add issues to affected list item nodes
    for (const node of nodes) {
      if (node.type === 'list-item') {
        if (!node.issues) {
          node.issues = [];
        }
        node.issues.push('NUMBERING_BREAK');
      }
    }
  }
  
  return nodes;
}

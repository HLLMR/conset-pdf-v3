/**
 * Anchor detection for specs PDFs
 * 
 * Detects hierarchical anchors (e.g., "2.4-T.5.b.1") from text.
 */

import type { SpecNode } from '../ast/types.js';

/**
 * Anchor detection patterns
 */
const ANCHOR_PATTERNS = [
  // Primary: Full hierarchical anchor (e.g., "2.4-T.5.b.1")
  /(\d+\.\d+(-[A-Z]\.\d+[a-z]?\.\d+)?)/g,
  // Secondary: Partial anchor starting with letter (e.g., "T.5.b.1")
  /([A-Z]\.\d+[a-z]?\.\d+)/g,
  // Tertiary: Simple numeric anchor (e.g., "2.4")
  /(\d+\.\d+)/g,
];

/**
 * Detect anchors in a node's text
 */
export function detectAnchor(node: SpecNode): string | null {
  if (!node.text) {
    return null;
  }
  
  // Try each pattern in order
  for (const pattern of ANCHOR_PATTERNS) {
    const match = node.text.match(pattern);
    if (match && match[0]) {
      // Anchor must be followed by text (not standalone)
      const anchorIndex = node.text.indexOf(match[0]);
      const afterAnchor = node.text.substring(anchorIndex + match[0].length).trim();
      
      if (afterAnchor.length > 0) {
        return match[0];
      }
    }
  }
  
  return null;
}

/**
 * Detect and assign anchors to nodes
 * Validates that anchors are unique within a section
 */
export function detectAnchors(nodes: SpecNode[]): {
  nodes: SpecNode[];
  issues: string[];
} {
  const issues: string[] = [];
  const anchorMap = new Map<string, SpecNode[]>();
  
  // Detect anchors for all nodes
  for (const node of nodes) {
    const anchor = detectAnchor(node);
    if (anchor) {
      node.anchor = anchor;
      
      // Track anchor occurrences
      if (!anchorMap.has(anchor)) {
        anchorMap.set(anchor, []);
      }
      anchorMap.get(anchor)!.push(node);
    } else {
      node.anchor = null;
    }
  }
  
  // Check for duplicate anchors
  for (const [anchor, nodesWithAnchor] of anchorMap.entries()) {
    if (nodesWithAnchor.length > 1) {
      issues.push(`DUPLICATE_ANCHOR: Anchor "${anchor}" found ${nodesWithAnchor.length} times`);
      // Mark all but the first as having issues
      for (let i = 1; i < nodesWithAnchor.length; i++) {
        if (!nodesWithAnchor[i].issues) {
          nodesWithAnchor[i].issues = [];
        }
        nodesWithAnchor[i].issues!.push('DUPLICATE_ANCHOR');
      }
    }
  }
  
  // Generate ANCHOR_REQUIRED issues for nodes without anchors
  for (const node of nodes) {
    if (node.anchor === null) {
      if (!node.issues) {
        node.issues = [];
      }
      node.issues.push('ANCHOR_REQUIRED');
    }
  }
  
  return { nodes, issues };
}

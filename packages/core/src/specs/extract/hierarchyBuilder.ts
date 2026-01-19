/**
 * Hierarchy building for specs PDFs
 * 
 * Builds hierarchical node structure from indentation (X coordinate clustering).
 */

import type { SpecNode } from '../ast/types.js';

/**
 * Build hierarchical structure from flat nodes
 * Uses X coordinate clustering to infer parent-child relationships
 */
export function buildHierarchy(nodes: SpecNode[]): SpecNode[] {
  if (nodes.length === 0) {
    return [];
  }
  
  // For now, we'll use a simple approach:
  // - Cluster nodes by approximate X coordinate (using Y as proxy if X not available)
  // - Build parent-child relationships based on level inference
  // - Assign levels based on indentation
  
  // Group nodes by approximate X coordinate (cluster by 20 points)
  // Since we don't have X coordinates directly in nodes yet, we'll use a simple heuristic:
  // - List items with same marker style at same position = same level
  // - Nodes with anchors that are more specific (longer) = deeper level
  
  const rootNodes: SpecNode[] = [];
  const nodeMap = new Map<string, SpecNode>();
  
  // Build node map for quick lookup
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }
  
  // Infer levels from anchors and list markers
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    
    // Infer level from anchor depth (more dots = deeper level)
    if (node.anchor) {
      const dotCount = (node.anchor.match(/\./g) || []).length;
      node.level = Math.max(0, dotCount - 1);
    }
    
    // Infer level from list marker position
    if (node.type === 'list-item' && node.listMarker) {
      // Simple heuristic: if previous node is list item at same level, keep same level
      // Otherwise, check if it's nested
      if (i > 0) {
        const prevNode = nodes[i - 1];
        if (prevNode.type === 'list-item' && prevNode.level !== undefined) {
          // Check if this is a continuation or new level
          // For now, assume same level unless anchor suggests otherwise
          if (node.anchor === null) {
            node.level = prevNode.level;
          }
        }
      }
    }
    
    // Ensure level is set
    if (node.level === undefined) {
      node.level = 0;
    }
  }
  
  // Build parent-child relationships
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    
    // Find parent: node with lower level that comes before this node
    let parent: SpecNode | null = null;
    for (let j = i - 1; j >= 0; j--) {
      const candidate = nodes[j];
      if (candidate.level < node.level) {
        parent = candidate;
        break;
      }
    }
    
    if (parent) {
      node.parentId = parent.id;
      if (!parent.children) {
        parent.children = [];
      }
      parent.children.push(node);
    } else {
      // Root node
      rootNodes.push(node);
    }
  }
  
  return rootNodes;
}

/**
 * Assign levels to nodes based on hierarchy
 */
export function assignLevels(_nodes: SpecNode[], rootNodes: SpecNode[]): void {
  // Levels are already assigned during hierarchy building
  // This function can be used for validation or recalculation if needed
  function assignLevelRecursive(node: SpecNode, level: number): void {
    node.level = level;
    if (node.children) {
      for (const child of node.children) {
        assignLevelRecursive(child, level + 1);
      }
    }
  }
  
  for (const root of rootNodes) {
    assignLevelRecursive(root, 0);
  }
}

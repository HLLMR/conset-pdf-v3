/**
 * Patch application for specs PDFs
 * 
 * Applies patch operations to SpecDoc AST.
 */

import type { SpecDoc, SpecNode } from '../ast/types.js';
import type {
  SpecPatchOperation,
  InsertOperation,
  DeleteOperation,
  MoveOperation,
  RenumberOperation,
  ReplaceOperation,
} from './types.js';
import { findNodeByAnchor } from './validator.js';

/**
 * Apply patch operations to SpecDoc
 */
export function applyPatch(specDoc: SpecDoc, operations: SpecPatchOperation[]): SpecDoc {
  // Create a deep copy to avoid mutating original
  const patchedDoc: SpecDoc = JSON.parse(JSON.stringify(specDoc));
  
  // Apply operations in order
  for (const operation of operations) {
    switch (operation.op) {
      case 'insert':
        applyInsert(patchedDoc, operation);
        break;
      case 'delete':
        applyDelete(patchedDoc, operation);
        break;
      case 'move':
        applyMove(patchedDoc, operation);
        break;
      case 'renumber':
        applyRenumber(patchedDoc, operation);
        break;
      case 'replace':
        applyReplace(patchedDoc, operation);
        break;
    }
  }
  
  return patchedDoc;
}

/**
 * Apply insert operation
 */
function applyInsert(specDoc: SpecDoc, operation: InsertOperation): void {
  const targetMatches = findNodeByAnchor(
    specDoc,
    operation.targetAnchor,
    operation.sectionId
  );
  
  if (targetMatches.length !== 1) {
    throw new Error(`Cannot insert: target anchor "${operation.targetAnchor}" not found or ambiguous`);
  }
  
  const target = targetMatches[0];
  
  // Find target node in AST structure
  const { node: targetNode, parentArray, index } = findNodeInAst(specDoc, target.id);
  if (!targetNode || !parentArray || index === undefined) {
    throw new Error(`Cannot insert: target node not found in AST structure`);
  }
  
  // Create new node
  const newNode: SpecNode = {
    id: `${targetNode.id}-inserted-${Date.now()}`,
    anchor: null, // New nodes don't have anchors initially
    type: operation.content.type,
    text: operation.content.text,
    listMarker: operation.content.listMarker,
    level: operation.content.level ?? targetNode.level,
    page: targetNode.page, // Same page as target
    confidence: 1.0,
  };
  
  // Insert based on position
  if (operation.position === 'before') {
    parentArray.splice(index, 0, newNode);
  } else if (operation.position === 'after') {
    parentArray.splice(index + 1, 0, newNode);
  } else if (operation.position === 'child') {
    if (!targetNode.children) {
      targetNode.children = [];
    }
    targetNode.children.push(newNode);
    newNode.parentId = targetNode.id;
  }
}

/**
 * Apply delete operation
 */
function applyDelete(specDoc: SpecDoc, operation: DeleteOperation): void {
  for (const anchor of operation.targetAnchors) {
    const matches = findNodeByAnchor(specDoc, anchor, operation.sectionId);
    
    if (matches.length !== 1) {
      throw new Error(`Cannot delete: target anchor "${anchor}" not found or ambiguous`);
    }
    
    const target = matches[0];
    const { parentArray, index } = findNodeInAst(specDoc, target.id);
    
    if (!parentArray || index === undefined) {
      throw new Error(`Cannot delete: target node not found in AST structure`);
    }
    
    // Remove node (and all children will be removed with it)
    parentArray.splice(index, 1);
  }
}

/**
 * Find node in AST structure and return its location
 */
function findNodeInAst(
  specDoc: SpecDoc,
  nodeId: string
): {
  section?: { section: typeof specDoc.sections[0]; index: number };
  node?: SpecNode;
  parentArray?: SpecNode[];
  index?: number;
} {
  for (let sectionIndex = 0; sectionIndex < specDoc.sections.length; sectionIndex++) {
    const section = specDoc.sections[sectionIndex];
    const result = findNodeInNodes(section.content, nodeId, section.content);
    
    if (result.node) {
      return {
        section: { section, index: sectionIndex },
        ...result,
      };
    }
  }
  
  return {};
}

/**
 * Find node in node array (recursive)
 */
function findNodeInNodes(
  nodes: SpecNode[],
  nodeId: string,
  parentArray: SpecNode[]
): {
  node?: SpecNode;
  parentArray?: SpecNode[];
  index?: number;
} {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    
    if (node.id === nodeId) {
      return {
        node,
        parentArray,
        index: i,
      };
    }
    
    // Recurse into children
    if (node.children) {
      const childResult = findNodeInNodes(node.children, nodeId, node.children);
      if (childResult.node) {
        return childResult;
      }
    }
  }
  
  return {};
}

/**
 * Apply move operation
 */
function applyMove(specDoc: SpecDoc, operation: MoveOperation): void {
  // Find source nodes
  const sourceNodes: SpecNode[] = [];
  for (const anchor of operation.sourceAnchors) {
    const matches = findNodeByAnchor(specDoc, anchor, operation.sectionId);
    if (matches.length !== 1) {
      throw new Error(`Cannot move: source anchor "${anchor}" not found or ambiguous`);
    }
    sourceNodes.push(matches[0]);
  }
  
  // Find target node
  const targetMatches = findNodeByAnchor(
    specDoc,
    operation.targetAnchor,
    operation.sectionId
  );
  if (targetMatches.length !== 1) {
    throw new Error(`Cannot move: target anchor "${operation.targetAnchor}" not found or ambiguous`);
  }
  const target = targetMatches[0];
  
  // Remove source nodes from their current locations
  for (const sourceNode of sourceNodes) {
    const { parentArray, index } = findNodeInAst(specDoc, sourceNode.id);
    if (!parentArray || index === undefined) {
      throw new Error(`Cannot move: source node not found in AST structure`);
    }
    parentArray.splice(index, 1);
  }
  
  // Find target location
  const { node: targetNode, parentArray: targetParentArray, index: targetIndex } = findNodeInAst(specDoc, target.id);
  if (!targetNode || !targetParentArray || targetIndex === undefined) {
    throw new Error(`Cannot move: target node not found in AST structure`);
  }
  
  // Insert source nodes at target location
  if (operation.position === 'before') {
    targetParentArray.splice(targetIndex, 0, ...sourceNodes);
  } else if (operation.position === 'after') {
    targetParentArray.splice(targetIndex + 1, 0, ...sourceNodes);
  } else if (operation.position === 'child') {
    if (!targetNode.children) {
      targetNode.children = [];
    }
    targetNode.children.push(...sourceNodes);
    // Update parent IDs
    for (const sourceNode of sourceNodes) {
      sourceNode.parentId = targetNode.id;
    }
  }
}

/**
 * Apply renumber operation
 */
function applyRenumber(specDoc: SpecDoc, operation: RenumberOperation): void {
  // Find start node
  const startMatches = findNodeByAnchor(
    specDoc,
    operation.startAnchor,
    operation.sectionId
  );
  if (startMatches.length !== 1) {
    throw new Error(`Cannot renumber: start anchor "${operation.startAnchor}" not found or ambiguous`);
  }
  const startNode = startMatches[0];
  
  // Find start node in AST to get siblings
  const { node: startNodeInAst, parentArray } = findNodeInAst(specDoc, startNode.id);
  if (!startNodeInAst || !parentArray) {
    throw new Error(`Cannot renumber: start node not found in AST structure`);
  }
  
  const startIndex = parentArray.indexOf(startNodeInAst);
  if (startIndex === -1) {
    throw new Error(`Cannot renumber: start node not found in parent array`);
  }
  
  // Renumber all subsequent siblings at same level
  let currentMarker = operation.newStart;
  for (let i = startIndex; i < parentArray.length; i++) {
    const node = parentArray[i];
    if (node.level === startNodeInAst.level && node.type === 'list-item') {
      node.listMarker = currentMarker;
      currentMarker = getNextMarker(currentMarker, operation.style);
    }
  }
}

/**
 * Get next marker in sequence
 */
function getNextMarker(current: string, style: 'alpha-lower' | 'alpha-upper' | 'numeric'): string {
  switch (style) {
    case 'alpha-lower':
      if (current === 'z') return 'aa';
      return String.fromCharCode(current.charCodeAt(0) + 1);
    case 'alpha-upper':
      if (current === 'Z') return 'AA';
      return String.fromCharCode(current.charCodeAt(0) + 1);
    case 'numeric':
      return String(parseInt(current, 10) + 1);
    default:
      return current;
  }
}

/**
 * Apply replace operation
 */
function applyReplace(specDoc: SpecDoc, operation: ReplaceOperation): void {
  const targetMatches = findNodeByAnchor(
    specDoc,
    operation.targetAnchor,
    operation.sectionId
  );
  
  if (targetMatches.length !== 1) {
    throw new Error(`Cannot replace: target anchor "${operation.targetAnchor}" not found or ambiguous`);
  }
  
  const target = targetMatches[0];
  const { node: targetNode } = findNodeInAst(specDoc, target.id);
  
  if (!targetNode) {
    throw new Error(`Cannot replace: target node not found in AST structure`);
  }
  
  // Replace text
  targetNode.text = operation.newText;
}

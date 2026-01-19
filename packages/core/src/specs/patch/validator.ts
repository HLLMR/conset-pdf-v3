/**
 * Patch validation for specs PDFs
 * 
 * Validates patch operations before application.
 */

import type { SpecPatch, SpecPatchOperation } from './types.js';
import type { SpecDoc, SpecNode } from '../ast/types.js';

/**
 * Validation error
 */
export interface PatchValidationError {
  operationIndex: number;
  operation: SpecPatchOperation;
  code: string;
  message: string;
}

/**
 * Validation result
 */
export interface PatchValidationResult {
  valid: boolean;
  errors: PatchValidationError[];
}

/**
 * Find node by anchor in SpecDoc
 */
export function findNodeByAnchor(
  specDoc: SpecDoc,
  anchor: string,
  sectionId?: string
): SpecNode[] {
  const matches: SpecNode[] = [];
  
  for (const section of specDoc.sections) {
    // If sectionId provided, only search in matching section
    if (sectionId && section.sectionId !== sectionId) {
      continue;
    }
    
    // Search recursively in section content
    const sectionMatches = findNodeByAnchorInNodes(section.content, anchor);
    matches.push(...sectionMatches);
  }
  
  return matches;
}

/**
 * Find node by anchor in node array (recursive)
 */
function findNodeByAnchorInNodes(nodes: SpecNode[], anchor: string): SpecNode[] {
  const matches: SpecNode[] = [];
  
  for (const node of nodes) {
    if (node.anchor === anchor) {
      matches.push(node);
    }
    
    // Recurse into children
    if (node.children) {
      matches.push(...findNodeByAnchorInNodes(node.children, anchor));
    }
  }
  
  return matches;
}

/**
 * Validate patch operations
 */
export function validatePatch(
  patch: SpecPatch,
  specDoc: SpecDoc
): PatchValidationResult {
  const errors: PatchValidationError[] = [];
  
  for (let i = 0; i < patch.operations.length; i++) {
    const operation = patch.operations[i];
    const operationErrors = validateOperation(operation, specDoc, i);
    errors.push(...operationErrors);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a single operation
 */
function validateOperation(
  operation: SpecPatchOperation,
  specDoc: SpecDoc,
  operationIndex: number
): PatchValidationError[] {
  const errors: PatchValidationError[] = [];
  
  switch (operation.op) {
    case 'insert':
    case 'replace':
    case 'move': {
      // Validate target anchor exists and is non-null
      const targetAnchor = operation.targetAnchor;
      const targetMatches = findNodeByAnchor(
        specDoc,
        targetAnchor,
        operation.sectionId
      );
      
      if (targetMatches.length === 0) {
        errors.push({
          operationIndex,
          operation,
          code: 'PATCH_TARGET_NOT_FOUND',
          message: `Target anchor "${targetAnchor}" not found${operation.sectionId ? ` in section ${operation.sectionId}` : ''}`,
        });
      } else if (targetMatches.length > 1) {
        errors.push({
          operationIndex,
          operation,
          code: 'PATCH_TARGET_AMBIGUOUS',
          message: `Target anchor "${targetAnchor}" matches ${targetMatches.length} nodes. Provide sectionId or mustMatchText for disambiguation.`,
        });
      } else {
        const target = targetMatches[0];
        if (target.anchor === null) {
          errors.push({
            operationIndex,
            operation,
            code: 'PATCH_TARGET_MISSING_ANCHOR',
            message: `Target node exists but has null anchor (required for patchability)`,
          });
        }
        
        // Validate mustMatchText if provided
        if ('mustMatchText' in operation && operation.mustMatchText) {
          if (target.text !== operation.mustMatchText) {
            errors.push({
              operationIndex,
              operation,
              code: 'PATCH_MATCH_FAILED',
              message: `mustMatchText validation failed. Expected: "${operation.mustMatchText}", found: "${target.text?.substring(0, 50) || 'no text'}"`,
            });
          }
        }
      }
      break;
    }
    
    case 'renumber': {
      // Validate start anchor exists and is non-null
      const startMatches = findNodeByAnchor(
        specDoc,
        operation.startAnchor,
        operation.sectionId
      );
      
      if (startMatches.length === 0) {
        errors.push({
          operationIndex,
          operation,
          code: 'PATCH_TARGET_NOT_FOUND',
          message: `Start anchor "${operation.startAnchor}" not found${operation.sectionId ? ` in section ${operation.sectionId}` : ''}`,
        });
      } else if (startMatches.length > 1) {
        errors.push({
          operationIndex,
          operation,
          code: 'PATCH_TARGET_AMBIGUOUS',
          message: `Start anchor "${operation.startAnchor}" matches ${startMatches.length} nodes. Provide sectionId for disambiguation.`,
        });
      } else {
        const target = startMatches[0];
        if (target.anchor === null) {
          errors.push({
            operationIndex,
            operation,
            code: 'PATCH_TARGET_MISSING_ANCHOR',
            message: `Start node exists but has null anchor (required for patchability)`,
          });
        }
      }
      break;
    }
    
    case 'delete': {
      // Validate all target anchors exist
      for (const anchor of operation.targetAnchors) {
        const matches = findNodeByAnchor(specDoc, anchor, operation.sectionId);
        if (matches.length === 0) {
          errors.push({
            operationIndex,
            operation,
            code: 'PATCH_TARGET_NOT_FOUND',
            message: `Target anchor "${anchor}" not found${operation.sectionId ? ` in section ${operation.sectionId}` : ''}`,
          });
        } else if (matches.length > 1) {
          errors.push({
            operationIndex,
            operation,
            code: 'PATCH_TARGET_AMBIGUOUS',
            message: `Target anchor "${anchor}" matches ${matches.length} nodes. Provide sectionId for disambiguation.`,
          });
        } else {
          const target = matches[0];
          if (target.anchor === null) {
            errors.push({
              operationIndex,
              operation,
              code: 'PATCH_TARGET_MISSING_ANCHOR',
              message: `Target node for anchor "${anchor}" has null anchor (required for patchability)`,
            });
          }
        }
      }
      break;
    }
  }
  
  return errors;
}

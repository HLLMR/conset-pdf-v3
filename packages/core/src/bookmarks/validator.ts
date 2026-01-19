/**
 * Bookmark destination validation
 */

import type { BookmarkDestination, BookmarkNode } from './types.js';
import { BOOKMARK_ISSUE_CODES } from './types.js';

/**
 * Validate bookmark destination
 */
export function validateDestination(
  destination: BookmarkDestination,
  pageCount: number
): BookmarkDestination {
  const isValid = destination.pageIndex >= 0 && destination.pageIndex < pageCount;
  const validationError = isValid
    ? undefined
    : `Page index ${destination.pageIndex} out of range (0-${pageCount - 1})`;
  
  return {
    ...destination,
    isValid,
    validationError,
  };
}

/**
 * Validate fit type (check if supported)
 */
export function validateFitType(fitType: string | null | undefined): {
  isSupported: boolean;
  normalizedType: 'XYZ' | 'Fit' | 'FitH' | null;
  issueCode?: string;
} {
  if (!fitType || fitType === 'XYZ' || fitType === 'Fit' || fitType === 'FitH') {
    return {
      isSupported: true,
      normalizedType: (fitType as 'XYZ' | 'Fit' | 'FitH') || null,
    };
  }
  
  // Unsupported fit types
  return {
    isSupported: false,
    normalizedType: null, // Will be converted to safe fallback
    issueCode: BOOKMARK_ISSUE_CODES.BOOKMARK_INVALID_FIT,
  };
}

/**
 * Validate bookmark node
 */
export function validateBookmarkNode(
  node: BookmarkNode,
  pageCount: number
): BookmarkNode {
  // Validate destination
  const validatedDestination = validateDestination(node.destination, pageCount);
  
  // Validate fit type
  const fitValidation = validateFitType(node.destination.fitType);
  
  // Collect issues
  const issues: string[] = [];
  if (!validatedDestination.isValid) {
    issues.push(BOOKMARK_ISSUE_CODES.BOOKMARK_DEAD_DEST);
  }
  if (!fitValidation.isSupported && node.destination.fitType) {
    issues.push(fitValidation.issueCode!);
  }
  
  // Determine status
  let status = node.status;
  if (!validatedDestination.isValid) {
    status = 'error';
  } else if (!fitValidation.isSupported) {
    status = status === 'error' ? 'error' : 'warning';
  }
  
  return {
    ...node,
    destination: {
      ...validatedDestination,
      fitType: fitValidation.normalizedType,
    },
    status,
    issues: issues.length > 0 ? issues : undefined,
  };
}

/**
 * Validate all bookmarks in tree
 */
export function validateBookmarkTree(
  nodes: Map<string, BookmarkNode>,
  pageCount: number
): Map<string, BookmarkNode> {
  const validated = new Map<string, BookmarkNode>();
  
  for (const [id, node] of nodes.entries()) {
    validated.set(id, validateBookmarkNode(node, pageCount));
  }
  
  return validated;
}

/**
 * Issue message helpers for specs-patch workflow
 */

import type { SpecNode } from '../../specs/ast/types.js';

/**
 * Get human-readable issue message
 */
export function getIssueMessage(issueCode: string, node: SpecNode): string {
  switch (issueCode) {
    case 'ANCHOR_REQUIRED':
      return `Node missing anchor (required for patchability): "${node.text?.substring(0, 50) || 'no text'}"`;
    case 'DUPLICATE_ANCHOR':
      return `Duplicate anchor found: "${node.anchor}"`;
    case 'NUMBERING_BREAK':
      return `Numbering sequence break detected`;
    case 'NO_SECTION_HEADER':
      return 'No section header detected';
    case 'AMBIGUOUS_ANCHOR':
      return `Ambiguous anchor: "${node.anchor}"`;
    default:
      return `Issue: ${issueCode}`;
  }
}

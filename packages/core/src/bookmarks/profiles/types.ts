/**
 * Bookmark profile types
 */

import type { BookmarkTree } from '../types.js';

/**
 * Bookmark profile identifier
 */
export type BookmarkProfileId = 'raw' | 'specs-v1' | 'specs-v2-detailed';

/**
 * Bookmark style options (user-configurable)
 */
export interface BookmarkStyleOptions {
  /** Profile to use for shaping bookmarks */
  profile?: BookmarkProfileId;
  /** Maximum depth for bookmarks (overrides profile default) */
  maxDepth?: number;
  /** Maximum title length before truncation (overrides profile default) */
  maxTitleLength?: number;
  /** Include subsections (only meaningful for specs-v2-detailed) */
  includeSubsections?: boolean;
  /** Include articles under sections (default: true) */
  includeArticles?: boolean;
  /** Include PART-level bookmarks (default: false, Parts are unreliable) */
  includeParts?: boolean;
}

/**
 * Resolved bookmark style options (with profile defaults applied)
 */
export interface ResolvedBookmarkStyleOptions {
  profile: BookmarkProfileId;
  maxDepth: number;
  maxTitleLength: number;
  includeSubsections: boolean;
  includeArticles: boolean;
  includeParts: boolean;
}

/**
 * Bookmark profile interface
 * 
 * Profiles shape bookmark trees by filtering, normalizing, and sorting nodes.
 */
export interface BookmarkProfile {
  /** Profile identifier */
  id: BookmarkProfileId;
  /** Human-readable description */
  description: string;
  /** Default max depth for this profile */
  defaultMaxDepth: number;
  /** Default max title length for this profile */
  defaultMaxTitleLength: number;
  /** Default includeSubsections for this profile */
  defaultIncludeSubsections: boolean;
  /** Default includeArticles for this profile */
  defaultIncludeArticles: boolean;
  /** Default includeParts for this profile */
  defaultIncludeParts: boolean;
  /** Shape tree according to profile rules and resolved options */
  shape(tree: BookmarkTree, options: ResolvedBookmarkStyleOptions): BookmarkTree;
  /** Normalize a bookmark title (with resolved maxTitleLength) */
  normalizeTitle(title: string, maxTitleLength: number): string;
}

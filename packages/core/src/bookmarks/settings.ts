/**
 * Bookmark settings and configuration
 * 
 * Provides user-configurable bookmark shaping options and defaults.
 * This is the "settings hook" for GUI integration (GUI can read/write these).
 */

import type { BookmarkStyleOptions, BookmarkProfileId } from './profiles/types.js';
import { resolveBookmarkStyleOptions } from './profiles/index.js';

/**
 * Bookmark build settings (user-configurable)
 * 
 * This extends BookmarkStyleOptions with additional configuration hooks
 * for future GUI integration.
 */
export interface BookmarkSettings extends BookmarkStyleOptions {
  /** Profile to use for shaping bookmarks */
  profile?: BookmarkProfileId;
  /** Maximum depth for bookmarks */
  maxDepth?: number;
  /** Maximum title length before truncation */
  maxTitleLength?: number;
  /** Include subsections (only meaningful for specs-v2-detailed) */
  includeSubsections?: boolean;
}

/**
 * Default bookmark settings factory
 * 
 * Returns default settings based on context (rebuild mode, etc.)
 */
export function getDefaultBookmarkSettings(context?: {
  rebuild?: boolean;
  bookmarkTreeProvided?: boolean;
}): BookmarkSettings {
  // Use the same resolution logic as the workflow
  const resolved = resolveBookmarkStyleOptions(undefined, context);
  
  return {
    profile: resolved.profile,
    maxDepth: resolved.maxDepth,
    maxTitleLength: resolved.maxTitleLength,
    includeSubsections: resolved.includeSubsections,
  };
}

/**
 * Merge user settings with defaults
 * 
 * User settings override defaults, but profile defaults fill in missing values.
 */
export function mergeBookmarkSettings(
  userSettings?: BookmarkSettings,
  context?: {
    rebuild?: boolean;
    bookmarkTreeProvided?: boolean;
  }
): BookmarkSettings {
  return resolveBookmarkStyleOptions(userSettings, context);
}

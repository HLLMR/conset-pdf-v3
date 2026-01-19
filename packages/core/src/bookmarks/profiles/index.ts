/**
 * Bookmark profiles
 */

import type {
  BookmarkProfile,
  BookmarkProfileId,
  BookmarkStyleOptions,
  ResolvedBookmarkStyleOptions,
} from './types.js';
import { rawProfile } from './raw.js';
import { specsV1Profile } from './specsV1.js';
import { specsV2DetailedProfile } from './specsV2Detailed.js';

export type {
  BookmarkProfile,
  BookmarkProfileId,
  BookmarkStyleOptions,
  ResolvedBookmarkStyleOptions,
} from './types.js';
export { rawProfile } from './raw.js';
export { specsV1Profile } from './specsV1.js';
export { specsV2DetailedProfile } from './specsV2Detailed.js';

/**
 * Profile registry
 */
const PROFILE_REGISTRY: Record<BookmarkProfileId, BookmarkProfile> = {
  raw: rawProfile,
  'specs-v1': specsV1Profile,
  'specs-v2-detailed': specsV2DetailedProfile,
};

/**
 * Get bookmark profile by ID
 */
export function getBookmarkProfile(id: BookmarkProfileId): BookmarkProfile {
  const profile = PROFILE_REGISTRY[id];
  if (!profile) {
    throw new Error(`Unknown bookmark profile: ${id}`);
  }
  return profile;
}

/**
 * Resolve bookmark style options with profile defaults
 * 
 * @param options - User-provided style options
 * @param context - Context for default selection (rebuild mode, bookmarkTree provided, etc.)
 */
export function resolveBookmarkStyleOptions(
  options?: BookmarkStyleOptions,
  context?: {
    rebuild?: boolean;
    bookmarkTreeProvided?: boolean;
  }
): ResolvedBookmarkStyleOptions {
  // Determine default profile
  let defaultProfile: BookmarkProfileId = 'raw';
  if (context?.rebuild && context?.bookmarkTreeProvided && !options?.profile) {
    // Default to specs-v1 when rebuilding from bookmarkTree
    defaultProfile = 'specs-v1';
  }

  const profileId = options?.profile || defaultProfile;
  const profile = getBookmarkProfile(profileId);

  // Resolve options with profile defaults
  return {
    profile: profileId,
    maxDepth: options?.maxDepth ?? profile.defaultMaxDepth,
    maxTitleLength: options?.maxTitleLength ?? profile.defaultMaxTitleLength,
    includeSubsections: options?.includeSubsections ?? profile.defaultIncludeSubsections,
    includeArticles: options?.includeArticles ?? true, // Default: include articles
    includeParts: options?.includeParts ?? false, // Default: exclude parts (unreliable)
  };
}

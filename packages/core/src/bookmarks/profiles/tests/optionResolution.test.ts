/**
 * Tests for bookmark style option resolution
 */

import { describe, it, expect } from '@jest/globals';
import {
  resolveBookmarkStyleOptions,
  getBookmarkProfile,
} from '../index.js';
import type { BookmarkStyleOptions } from '../types.js';

describe('Bookmark Style Option Resolution', () => {
  describe('resolveBookmarkStyleOptions', () => {
    it('should default to raw profile when no context provided', () => {
      const resolved = resolveBookmarkStyleOptions();
      expect(resolved.profile).toBe('raw');
      expect(resolved.maxDepth).toBe(999); // No depth limit
      expect(resolved.maxTitleLength).toBe(200);
      expect(resolved.includeSubsections).toBe(true);
    });

    it('should default to specs-v1 when rebuild=true and bookmarkTree provided', () => {
      const resolved = resolveBookmarkStyleOptions(undefined, {
        rebuild: true,
        bookmarkTreeProvided: true,
      });
      expect(resolved.profile).toBe('specs-v1');
      expect(resolved.maxDepth).toBe(2); // specs-v1 default
      expect(resolved.maxTitleLength).toBe(120);
      expect(resolved.includeSubsections).toBe(false);
    });

    it('should use user-provided profile even when rebuild context suggests specs-v1', () => {
      const options: BookmarkStyleOptions = {
        profile: 'raw',
      };
      const resolved = resolveBookmarkStyleOptions(options, {
        rebuild: true,
        bookmarkTreeProvided: true,
      });
      expect(resolved.profile).toBe('raw');
    });

    it('should allow maxDepth override', () => {
      const options: BookmarkStyleOptions = {
        profile: 'specs-v1',
        maxDepth: 3,
      };
      const resolved = resolveBookmarkStyleOptions(options);
      expect(resolved.profile).toBe('specs-v1');
      expect(resolved.maxDepth).toBe(3); // Override applied
      expect(resolved.maxTitleLength).toBe(120); // Profile default
    });

    it('should allow maxTitleLength override', () => {
      const options: BookmarkStyleOptions = {
        profile: 'raw',
        maxTitleLength: 150,
      };
      const resolved = resolveBookmarkStyleOptions(options);
      expect(resolved.profile).toBe('raw');
      expect(resolved.maxTitleLength).toBe(150); // Override applied
      expect(resolved.maxDepth).toBe(999); // Profile default
    });

    it('should allow includeSubsections override', () => {
      const options: BookmarkStyleOptions = {
        profile: 'specs-v1',
        includeSubsections: true,
      };
      const resolved = resolveBookmarkStyleOptions(options);
      expect(resolved.profile).toBe('specs-v1');
      expect(resolved.includeSubsections).toBe(true); // Override applied
    });

    it('should not default to specs-v1 when rebuild=false', () => {
      const resolved = resolveBookmarkStyleOptions(undefined, {
        rebuild: false,
        bookmarkTreeProvided: true,
      });
      expect(resolved.profile).toBe('raw'); // Safe default
    });

    it('should not default to specs-v1 when bookmarkTree not provided', () => {
      const resolved = resolveBookmarkStyleOptions(undefined, {
        rebuild: true,
        bookmarkTreeProvided: false,
      });
      expect(resolved.profile).toBe('raw'); // Safe default
    });
  });

  describe('getBookmarkProfile', () => {
    it('should return raw profile', () => {
      const profile = getBookmarkProfile('raw');
      expect(profile.id).toBe('raw');
      expect(profile.description).toBeDefined();
    });

    it('should return specs-v1 profile', () => {
      const profile = getBookmarkProfile('specs-v1');
      expect(profile.id).toBe('specs-v1');
      expect(profile.description).toBeDefined();
    });

    it('should throw for unknown profile', () => {
      expect(() => getBookmarkProfile('unknown' as any)).toThrow('Unknown bookmark profile');
    });
  });
});

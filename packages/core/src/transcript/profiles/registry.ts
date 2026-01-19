/**
 * Profile registry
 * 
 * Manages profile storage, loading, and matching.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { TemplateProfile, ProfileMetadata } from './types.js';
import type { LayoutTranscript } from '../types.js';
import { validateProfile, type ProfileValidation } from './validation.js';

/**
 * Profile registry implementation
 */
export class ProfileRegistry {
  private profilesDir: string;
  private profilesCache = new Map<string, TemplateProfile>();
  
  constructor(profilesDir?: string) {
    // Default to profiles directory in user data or current directory
    this.profilesDir = profilesDir || path.join(process.cwd(), 'profiles');
  }
  
  /**
   * Load a profile by ID
   * 
   * @param profileId Profile identifier
   * @returns Loaded profile or null if not found
   */
  async loadProfile(profileId: string): Promise<TemplateProfile | null> {
    // Check cache first
    if (this.profilesCache.has(profileId)) {
      return this.profilesCache.get(profileId)!;
    }
    
    // Load from file system
    const profilePath = path.join(this.profilesDir, `${profileId}.json`);
    
    try {
      const content = await fs.readFile(profilePath, 'utf-8');
      const profile = JSON.parse(content) as TemplateProfile;
      
      // Cache profile
      this.profilesCache.set(profileId, profile);
      
      return profile;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw new Error(`Failed to load profile ${profileId}: ${error.message}`);
    }
  }
  
  /**
   * Save a profile
   * 
   * @param profile Profile to save
   * @param metadata Profile metadata
   */
  async saveProfile(profile: TemplateProfile, metadata: ProfileMetadata): Promise<void> {
    // Ensure profiles directory exists
    await fs.mkdir(this.profilesDir, { recursive: true });
    
    // Save profile with metadata
    const profilePath = path.join(this.profilesDir, `${metadata.profileId}.json`);
    const profileData = {
      ...profile,
      metadata,
    };
    
    await fs.writeFile(profilePath, JSON.stringify(profileData, null, 2), 'utf-8');
    
    // Update cache
    this.profilesCache.set(metadata.profileId, profile);
  }
  
  /**
   * Validate a profile against a transcript
   * 
   * @param profile Profile to validate
   * @param transcript Transcript to validate against
   * @returns Validation result
   */
  async validateProfile(
    profile: TemplateProfile,
    transcript: LayoutTranscript
  ): Promise<ProfileValidation> {
    return validateProfile(profile, transcript);
  }
  
  /**
   * Find matching profile for a transcript
   * 
   * @param transcript Transcript to match
   * @returns Best matching profile or null
   */
  async findMatchingProfile(transcript: LayoutTranscript): Promise<TemplateProfile | null> {
    // Get all profiles
    const profiles = await this.listProfiles();
    
    if (profiles.length === 0) {
      return null;
    }
  
    // Score each profile
    let bestProfile: TemplateProfile | null = null;
    let bestScore = 0.0;
    
    for (const profile of profiles) {
      const validation = await this.validateProfile(profile, transcript);
      const score = validation.confidence;
      
      if (score > bestScore) {
        bestScore = score;
        bestProfile = profile;
      }
    }
    
    // Only return if confidence is above threshold
    return bestScore >= 0.70 ? bestProfile : null;
  }
  
  /**
   * List all available profiles
   * 
   * @returns Array of profile IDs
   */
  async listProfiles(): Promise<TemplateProfile[]> {
    try {
      const files = await fs.readdir(this.profilesDir);
      const profiles: TemplateProfile[] = [];
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const profileId = path.basename(file, '.json');
          const profile = await this.loadProfile(profileId);
          if (profile) {
            profiles.push(profile);
          }
        }
      }
      
      return profiles;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw new Error(`Failed to list profiles: ${error.message}`);
    }
  }
  
  /**
   * Delete a profile
   * 
   * @param profileId Profile identifier
   */
  async deleteProfile(profileId: string): Promise<void> {
    const profilePath = path.join(this.profilesDir, `${profileId}.json`);
    
    try {
      await fs.unlink(profilePath);
      this.profilesCache.delete(profileId);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw new Error(`Failed to delete profile ${profileId}: ${error.message}`);
      }
    }
  }
}

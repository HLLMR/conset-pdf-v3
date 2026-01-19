/**
 * Types for ML Ruleset Compiler
 */

import type { SpecProfile, SheetTemplateProfile, EquipmentSubmittalProfile } from '../profiles/types.js';
import type { AbstractTranscript } from '../abstraction/abstractTranscript.js';

/**
 * Input for profile proposal
 */
export interface ProfileProposalInput {
  /** Abstract transcript (privacy-preserving) */
  abstractTranscript: AbstractTranscript;
  /** Document type hint (optional) */
  docTypeHint?: 'spec' | 'drawing' | 'equipmentSubmittal';
  /** Additional context for the LLM */
  context?: {
    /** User-provided notes */
    notes?: string;
    /** Known document characteristics */
    characteristics?: string[];
  };
}

/**
 * Profile candidate with validation metadata
 */
export interface ProfileCandidate<T> {
  /** Proposed profile */
  profile: T;
  /** Validation result */
  validation: {
    /** Whether profile passes validation gates */
    valid: boolean;
    /** Confidence score (0.0-1.0) */
    confidence: number;
    /** Issues found during validation */
    issues: string[];
  };
  /** Generation metadata */
  metadata: {
    /** Number of attempts made */
    attempts: number;
    /** LLM model used */
    model?: string;
    /** Generation timestamp */
    generatedAt: string;
  };
}

/**
 * Spec profile candidate
 */
export type SpecProfileCandidate = ProfileCandidate<SpecProfile>;

/**
 * Sheet template profile candidate
 */
export type SheetTemplateProfileCandidate = ProfileCandidate<SheetTemplateProfile>;

/**
 * Equipment submittal profile candidate
 */
export type EquipmentSubmittalProfileCandidate = ProfileCandidate<EquipmentSubmittalProfile>;

/**
 * LLM API configuration
 */
export interface LLMConfig {
  /** API endpoint URL */
  apiUrl?: string;
  /** API key */
  apiKey?: string;
  /** Model identifier */
  model?: string;
  /** Temperature for generation (0.0-1.0) */
  temperature?: number;
  /** Maximum tokens in response */
  maxTokens?: number;
}

/**
 * LLM request/response types
 */
export interface LLMRequest {
  /** System prompt */
  systemPrompt: string;
  /** User prompt */
  userPrompt: string;
  /** Configuration */
  config: LLMConfig;
}

export interface LLMResponse {
  /** Generated content */
  content: string;
  /** Model used */
  model?: string;
  /** Tokens used */
  tokensUsed?: number;
}

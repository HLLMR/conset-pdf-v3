/**
 * Ruleset Compiler Interface
 * 
 * Defines the contract for ML-assisted profile generation from abstract transcripts.
 */

import type {
  ProfileProposalInput,
  SpecProfileCandidate,
  SheetTemplateProfileCandidate,
  EquipmentSubmittalProfileCandidate,
} from './types.js';

/**
 * Ruleset Compiler interface
 * 
 * Provides methods to propose profiles using ML/LLM assistance.
 */
export interface RulesetCompiler {
  /**
   * Propose a spec profile from an abstract transcript
   * 
   * @param input Profile proposal input
   * @returns Spec profile candidate with validation
   */
  proposeSpecProfile(input: ProfileProposalInput): Promise<SpecProfileCandidate>;

  /**
   * Propose a sheet template profile from an abstract transcript
   * 
   * @param input Profile proposal input
   * @returns Sheet template profile candidate with validation
   */
  proposeSheetTemplateProfile(input: ProfileProposalInput): Promise<SheetTemplateProfileCandidate>;

  /**
   * Propose an equipment submittal profile from an abstract transcript
   * 
   * @param input Profile proposal input
   * @returns Equipment submittal profile candidate with validation
   */
  proposeEquipmentSubmittalProfile(input: ProfileProposalInput): Promise<EquipmentSubmittalProfileCandidate>;
}

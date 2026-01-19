/**
 * API-based Ruleset Compiler
 * 
 * Implements RulesetCompiler using LLM API calls.
 */

import type {
  RulesetCompiler,
} from './rulesetCompiler.js';
import type {
  ProfileProposalInput,
  SpecProfileCandidate,
  SheetTemplateProfileCandidate,
  EquipmentSubmittalProfileCandidate,
  ProfileCandidate,
  LLMConfig,
  LLMRequest,
  LLMResponse,
} from './types.js';
import type {
  SpecProfile,
  SheetTemplateProfile,
  EquipmentSubmittalProfile,
} from '../profiles/types.js';
import { validateProfile } from '../profiles/validation.js';
import { createTranscriptExtractor } from '../factory.js';

/**
 * Default LLM configuration
 */
const DEFAULT_LLM_CONFIG: LLMConfig = {
  apiUrl: process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions',
  apiKey: process.env.LLM_API_KEY,
  model: process.env.LLM_MODEL || 'gpt-4',
  temperature: 0.3,
  maxTokens: 4000,
};

/**
 * Maximum retry attempts for compile-validate loop
 */
const MAX_ATTEMPTS = 3;

/**
 * API-based Ruleset Compiler implementation
 */
export class APIRulesetCompiler implements RulesetCompiler {
  private llmConfig: LLMConfig;
  private maxAttempts: number;

  constructor(config?: Partial<LLMConfig>, maxAttempts: number = MAX_ATTEMPTS) {
    this.llmConfig = { ...DEFAULT_LLM_CONFIG, ...config };
    this.maxAttempts = maxAttempts;
  }

  async proposeSpecProfile(input: ProfileProposalInput): Promise<SpecProfileCandidate> {
    return this.compileWithValidation(
      input,
      'spec',
      this.generateSpecProfilePrompt.bind(this),
      this.parseSpecProfile.bind(this),
    );
  }

  async proposeSheetTemplateProfile(input: ProfileProposalInput): Promise<SheetTemplateProfileCandidate> {
    return this.compileWithValidation(
      input,
      'drawing',
      this.generateSheetTemplateProfilePrompt.bind(this),
      this.parseSheetTemplateProfile.bind(this),
    );
  }

  async proposeEquipmentSubmittalProfile(input: ProfileProposalInput): Promise<EquipmentSubmittalProfileCandidate> {
    return this.compileWithValidation(
      input,
      'equipmentSubmittal',
      this.generateEquipmentSubmittalProfilePrompt.bind(this),
      this.parseEquipmentSubmittalProfile.bind(this),
    );
  }

  /**
   * Compile-validate loop: propose, validate, re-prompt if needed
   */
  private async compileWithValidation<T extends SpecProfile | SheetTemplateProfile | EquipmentSubmittalProfile>(
    input: ProfileProposalInput,
    _docType: 'spec' | 'drawing' | 'equipmentSubmittal',
    promptGenerator: (input: ProfileProposalInput, previousIssues?: string[]) => { systemPrompt: string; userPrompt: string },
    parser: (response: string) => T,
  ): Promise<ProfileCandidate<T>> {
    let attempts = 0;
    let previousIssues: string[] = [];
    let lastProfile: T | null = null;

    // Get original transcript for validation (if available)
    let originalTranscript = null;
    if (input.abstractTranscript.filePath && !input.abstractTranscript.filePath.startsWith('anonymized_')) {
      try {
        const extractor = createTranscriptExtractor();
        originalTranscript = await extractor.extractTranscript(input.abstractTranscript.filePath);
      } catch {
        // If we can't get original transcript, validation will be limited
      }
    }

    while (attempts < this.maxAttempts) {
      attempts++;

      // Generate prompt
      const { systemPrompt, userPrompt } = promptGenerator(input, previousIssues.length > 0 ? previousIssues : undefined);

      // Call LLM
      const response = await this.callLLM({
        systemPrompt,
        userPrompt,
        config: this.llmConfig,
      });

      // Parse profile from response
      try {
        const profile = parser(response.content);
        lastProfile = profile;

        // Validate profile if we have original transcript
        if (originalTranscript) {
          const validation = validateProfile(profile, originalTranscript);

          // If valid, return candidate
          if (validation.valid) {
            return {
              profile,
              validation: {
                valid: true,
                confidence: validation.confidence,
                issues: [],
              },
              metadata: {
                attempts,
                model: response.model || this.llmConfig.model,
                generatedAt: new Date().toISOString(),
              },
            };
          }

          // Store issues for re-prompting
          previousIssues = validation.issues;
        } else {
          // No original transcript for validation - return with low confidence
          return {
            profile,
            validation: {
              valid: false,
              confidence: 0.5,
              issues: ['No original transcript available for validation'],
            },
            metadata: {
              attempts,
              model: response.model || this.llmConfig.model,
              generatedAt: new Date().toISOString(),
            },
          };
        }
      } catch (parseError) {
        // Parsing failed - re-prompt with error message
        previousIssues.push(`Failed to parse profile: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }
    }

    // Max attempts reached - return last profile with validation issues
    if (lastProfile && originalTranscript) {
      const validation = validateProfile(lastProfile, originalTranscript);
      return {
        profile: lastProfile,
        validation: {
          valid: validation.valid,
          confidence: validation.confidence,
          issues: validation.issues,
        },
        metadata: {
          attempts,
          model: this.llmConfig.model,
          generatedAt: new Date().toISOString(),
        },
      };
    }

    // Failed to generate any profile
    throw new Error(`Failed to generate valid profile after ${attempts} attempts. Issues: ${previousIssues.join('; ')}`);
  }

  /**
   * Call LLM API
   */
  private async callLLM(request: LLMRequest): Promise<LLMResponse> {
    if (!this.llmConfig.apiKey) {
      throw new Error('LLM API key not configured. Set LLM_API_KEY environment variable.');
    }

    // For OpenAI-compatible API
    const response = await fetch(this.llmConfig.apiUrl!, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.llmConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: this.llmConfig.model,
        messages: [
          { role: 'system', content: request.systemPrompt },
          { role: 'user', content: request.userPrompt },
        ],
        temperature: this.llmConfig.temperature,
        max_tokens: this.llmConfig.maxTokens,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };
    return {
      content: data.choices?.[0]?.message?.content || '',
      model: data.model,
      tokensUsed: data.usage?.total_tokens,
    };
  }

  /**
   * Generate prompt for spec profile
   */
  private generateSpecProfilePrompt(input: ProfileProposalInput, previousIssues?: string[]): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `You are an expert at analyzing PDF document structure and generating extraction profiles for specification documents.

Your task is to analyze an abstract transcript (where sensitive content has been replaced with tokens) and propose a SpecProfile JSON structure.

The SpecProfile should include:
- Page model (common size, allowed rotations)
- Regions (header, footer, body bands)
- Outline structure (heading levels with patterns)
- Optional table extraction strategies

Return ONLY valid JSON matching the SpecProfile interface.`;

    const userPrompt = this.buildUserPrompt(input, previousIssues, 'spec');
    return { systemPrompt, userPrompt };
  }

  /**
   * Generate prompt for sheet template profile
   */
  private generateSheetTemplateProfilePrompt(input: ProfileProposalInput, previousIssues?: string[]): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `You are an expert at analyzing PDF document structure and generating extraction profiles for drawing/sheet templates.

Your task is to analyze an abstract transcript and propose a SheetTemplateProfile JSON structure.

The SheetTemplateProfile should include:
- Page model (common size, allowed rotations)
- Title block configuration (bbox, field definitions)
- Standard blocks (revision block, notes, etc.)
- Schedule definitions

Return ONLY valid JSON matching the SheetTemplateProfile interface.`;

    const userPrompt = this.buildUserPrompt(input, previousIssues, 'drawing');
    return { systemPrompt, userPrompt };
  }

  /**
   * Generate prompt for equipment submittal profile
   */
  private generateEquipmentSubmittalProfilePrompt(input: ProfileProposalInput, previousIssues?: string[]): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `You are an expert at analyzing PDF document structure and generating extraction profiles for equipment submittal documents.

Your task is to analyze an abstract transcript and propose an EquipmentSubmittalProfile JSON structure.

The EquipmentSubmittalProfile should include:
- Unit structure patterns (cover block, unit report patterns)
- Header block ROIs with field definitions
- Table definitions for performance data

Return ONLY valid JSON matching the EquipmentSubmittalProfile interface.`;

    const userPrompt = this.buildUserPrompt(input, previousIssues, 'equipmentSubmittal');
    return { systemPrompt, userPrompt };
  }

  /**
   * Build user prompt from input
   */
  private buildUserPrompt(input: ProfileProposalInput, previousIssues?: string[], docType?: string): string {
    const abstractJson = JSON.stringify(input.abstractTranscript, null, 2);
    
    let prompt = `Analyze the following abstract transcript and propose a ${docType || 'document'} profile:\n\n`;
    prompt += `Abstract Transcript:\n${abstractJson}\n\n`;

    if (input.context?.notes) {
      prompt += `Additional context: ${input.context.notes}\n\n`;
    }

    if (input.context?.characteristics && input.context.characteristics.length > 0) {
      prompt += `Known characteristics:\n${input.context.characteristics.map(c => `- ${c}`).join('\n')}\n\n`;
    }

    if (previousIssues && previousIssues.length > 0) {
      prompt += `Previous validation issues (please address these):\n${previousIssues.map(issue => `- ${issue}`).join('\n')}\n\n`;
    }

    prompt += `Return ONLY the JSON profile object, no markdown, no code blocks, just the JSON.`;

    return prompt;
  }

  /**
   * Parse spec profile from LLM response
   */
  private parseSpecProfile(response: string): SpecProfile {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || response.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1] : response;
    
    const parsed = JSON.parse(jsonStr);
    
    // Validate and normalize structure
    return {
      docType: 'spec',
      profileVersion: parsed.profileVersion || '1.0.0',
      pageModel: parsed.pageModel || {
        commonSize: [612, 792], // Default letter size
        rotationAllowed: [0],
      },
      regions: parsed.regions || {
        header: { x0: 0, y0: 0, x1: 612, y1: 72 },
        footer: { x0: 0, y0: 720, x1: 612, y1: 792 },
        body: { x0: 0, y0: 72, x1: 612, y1: 720 },
      },
      outline: parsed.outline || {
        levels: [],
      },
      tables: parsed.tables,
      confidence: parsed.confidence || {
        overall: 0.5,
        notes: [],
      },
    };
  }

  /**
   * Parse sheet template profile from LLM response
   */
  private parseSheetTemplateProfile(response: string): SheetTemplateProfile {
    const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || response.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1] : response;
    
    const parsed = JSON.parse(jsonStr) as Partial<SheetTemplateProfile>;
    
    return {
      docType: 'drawing',
      name: parsed.name || 'Generated Sheet Template',
      version: parsed.version || '1.0.0',
      description: parsed.description,
      page: parsed.page,
      sheetId: parsed.sheetId || {
        rois: [],
      },
      sheetTitle: parsed.sheetTitle,
      validation: parsed.validation,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
      source: parsed.source || 'user-defined',
      titleBlock: parsed.titleBlock || {
        bbox: { x0: 0, y0: 0, x1: 612, y1: 100 },
        fields: {},
      },
      standardBlocks: parsed.standardBlocks || {},
      schedules: parsed.schedules || [],
    };
  }

  /**
   * Parse equipment submittal profile from LLM response
   */
  private parseEquipmentSubmittalProfile(response: string): EquipmentSubmittalProfile {
    const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || response.match(/(\{[\s\S]*\})/);
    const jsonStr = jsonMatch ? jsonMatch[1] : response;
    
    const parsed = JSON.parse(jsonStr);
    
    return {
      docType: 'equipmentSubmittal',
      profileVersion: parsed.profileVersion || '1.0.0',
      unitStructure: parsed.unitStructure || {
        coverBlockPattern: '',
        unitReportPattern: '',
      },
      headerBlockRois: parsed.headerBlockRois || {},
      tableDefinitions: parsed.tableDefinitions || [],
    };
  }
}

/**
 * Create an API-based ruleset compiler
 */
export function createAPIRulesetCompiler(config?: Partial<LLMConfig>, maxAttempts?: number): RulesetCompiler {
  return new APIRulesetCompiler(config, maxAttempts);
}

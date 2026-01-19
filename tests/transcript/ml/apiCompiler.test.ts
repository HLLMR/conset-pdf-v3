/**
 * Tests for API-based Ruleset Compiler
 */

import { describe, it, expect, jest } from '@jest/globals';
import { APIRulesetCompiler, createAPIRulesetCompiler } from '@conset-pdf/core';
import type { ProfileProposalInput, LLMConfig, AbstractTranscript } from '@conset-pdf/core';
import { PrivacyMode } from '@conset-pdf/core';

// Mock fetch for LLM API calls
global.fetch = jest.fn() as jest.Mock;

describe('APIRulesetCompiler', () => {
  const mockAbstractTranscript: AbstractTranscript = {
    filePath: 'anonymized_test.pdf',
    extractionEngine: 'pymupdf',
    privacyMode: PrivacyMode.STRICT_STRUCTURE_ONLY,
    pages: [
      {
        pageNumber: 1,
        pageIndex: 0,
        width: 612,
        height: 792,
        spans: [
          {
            tokenId: 'TOKEN_001',
            tokenClass: 'KEYWORD' as any,
            originalLength: 6,
            bbox: [72, 720, 200, 732],
            fontName: 'Arial',
            fontSize: 12,
            flags: { isBold: true },
            spanId: 'span_001',
            pageIndex: 0,
          },
        ],
        metadata: {
          originalCharCount: 100,
          hasTextLayer: true,
        },
      },
    ],
    metadata: {
      totalPages: 1,
      hasTrueTextLayer: true,
      tokenCount: 1,
    },
  };

  const mockInput: ProfileProposalInput = {
    abstractTranscript: mockAbstractTranscript,
    docTypeHint: 'spec',
  };

  beforeEach(() => {
    (global.fetch as jest.Mock).mockClear();
  });

  it('should create compiler instance', () => {
    const compiler = createAPIRulesetCompiler();
    expect(compiler).toBeDefined();
    expect(compiler).toBeInstanceOf(APIRulesetCompiler);
  });

  it('should create compiler with custom config', () => {
    const config: Partial<LLMConfig> = {
      model: 'gpt-3.5-turbo',
      temperature: 0.5,
    };
    const compiler = createAPIRulesetCompiler(config);
    expect(compiler).toBeDefined();
  });

  it('should throw error when API key not configured', async () => {
    const compiler = createAPIRulesetCompiler({ apiKey: undefined });
    
    // Mock fetch to simulate missing API key
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('API key not configured'));

    await expect(compiler.proposeSpecProfile(mockInput)).rejects.toThrow();
  });

  it('should handle LLM API errors gracefully', async () => {
    const compiler = createAPIRulesetCompiler({
      apiKey: 'test-key',
      apiUrl: 'https://api.test.com/v1/chat/completions',
    });

    // Mock fetch to return error
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    await expect(compiler.proposeSpecProfile(mockInput)).rejects.toThrow(/LLM API error/);
  });

  it('should parse spec profile from LLM response', async () => {
    const compiler = createAPIRulesetCompiler({
      apiKey: 'test-key',
    });

    const mockLLMResponse = {
      ok: true,
      json: async () => ({
        model: 'gpt-4',
        choices: [{
          message: {
            content: JSON.stringify({
              docType: 'spec',
              profileVersion: '1.0.0',
              pageModel: {
                commonSize: [612, 792],
                rotationAllowed: [0],
              },
              regions: {
                header: { x0: 0, y0: 0, x1: 612, y1: 72 },
                footer: { x0: 0, y0: 720, x1: 612, y1: 792 },
                body: { x0: 0, y0: 72, x1: 612, y1: 720 },
              },
              outline: {
                levels: [
                  {
                    level: 1,
                    pattern: '^SECTION\\s+\\d+',
                    fontSizeRange: [12, 14],
                    isBold: true,
                  },
                ],
              },
              confidence: {
                overall: 0.9,
                notes: [],
              },
            }),
          },
        }],
        usage: { total_tokens: 100 },
      }),
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce(mockLLMResponse);

    // Note: This will fail validation if we don't have original transcript
    // But it tests the parsing logic
    const result = await compiler.proposeSpecProfile(mockInput);
    
    expect(result).toBeDefined();
    expect(result.profile).toBeDefined();
    expect(result.profile.docType).toBe('spec');
    expect(result.metadata.attempts).toBeGreaterThan(0);
  });

  it('should handle markdown code blocks in LLM response', async () => {
    const compiler = createAPIRulesetCompiler({
      apiKey: 'test-key',
    });

    const mockProfile = {
      docType: 'spec',
      profileVersion: '1.0.0',
      pageModel: { commonSize: [612, 792], rotationAllowed: [0] },
      regions: {
        header: { x0: 0, y0: 0, x1: 612, y1: 72 },
        footer: { x0: 0, y0: 720, x1: 612, y1: 792 },
        body: { x0: 0, y0: 72, x1: 612, y1: 720 },
      },
      outline: { levels: [] },
    };

    const mockLLMResponse = {
      ok: true,
      json: async () => ({
        model: 'gpt-4',
        choices: [{
          message: {
            content: `Here's the profile:\n\`\`\`json\n${JSON.stringify(mockProfile)}\n\`\`\``,
          },
        }],
      }),
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce(mockLLMResponse);

    const result = await compiler.proposeSpecProfile(mockInput);
    
    expect(result).toBeDefined();
    expect(result.profile.docType).toBe('spec');
  });

  it('should retry on validation failure', async () => {
    const compiler = new APIRulesetCompiler(
      { apiKey: 'test-key' },
      2 // maxAttempts = 2
    );

    // Mock multiple LLM responses (validation will fail without original transcript)
    const mockResponse = {
      ok: true,
      json: async () => ({
        model: 'gpt-4',
        choices: [{
          message: {
            content: JSON.stringify({
              docType: 'spec',
              profileVersion: '1.0.0',
              pageModel: { commonSize: [612, 792], rotationAllowed: [0] },
              regions: {
                header: { x0: 0, y0: 0, x1: 612, y1: 72 },
                footer: { x0: 0, y0: 720, x1: 612, y1: 792 },
                body: { x0: 0, y0: 72, x1: 612, y1: 720 },
              },
              outline: { levels: [] },
            }),
          },
        }],
      }),
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    // Should complete without throwing (will return with validation issues)
    const result = await compiler.proposeSpecProfile(mockInput);
    
    expect(result).toBeDefined();
    expect(result.metadata.attempts).toBeGreaterThan(0);
  });
});

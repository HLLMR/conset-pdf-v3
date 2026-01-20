/**
 * Tests for API-based Ruleset Compiler
 */

import { describe, it, expect, jest } from '@jest/globals';
import { APIRulesetCompiler, createAPIRulesetCompiler } from '@conset-pdf/core';
import type { ProfileProposalInput, LLMConfig, AbstractTranscript } from '@conset-pdf/core';
import { PrivacyMode } from '@conset-pdf/core';

// Mock fetch for LLM API calls
const mockFetch = jest.fn<typeof fetch>();
global.fetch = mockFetch as any;

describe('APIRulesetCompiler', () => {
  const mockAbstractTranscript: AbstractTranscript = {
    filePath: 'anonymized_test.pdf',
    extractionEngine: 'pymupdf',
    privacyMode: PrivacyMode.STRICT_STRUCTURE_ONLY,
    coordinateSystem: {
      origin: 'top-left',
      units: 'pt',
      yDirection: 'down',
      rotationNormalized: true,
    },
    pages: [
      {
        pageNumber: 1,
        pageIndex: 0,
        width: 612,
        height: 792,
        spans: [
          {
            placeholderId: 'PLACEHOLDER_123456789abc',
            tokenClass: 'KEYWORD' as any,
            tokenShape: 'AAAA',
            charClassFlags: {
              hasDigit: false,
              hasAlpha: true,
              hasUpper: true,
              hasLower: false,
              hasDash: false,
              hasSlash: false,
              hasDot: false,
              hasPunct: false,
            },
            lengthBucket: '4-6',
            originalLength: 6,
            bbox: [72, 720, 200, 732],
            fontName: 'Arial',
            fontSize: 12,
            flags: { isBold: true },
            spanId: 'span_001',
            pageIndex: 0,
            repetition: {
              repeatCountDoc: 1,
              repeatRateDoc: 1.0,
              repeatPages: 1,
              repeatRateByBand: { header: 0, footer: 0, body: 1.0 },
            },
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
      placeholderCount: 1,
    },
  };

  const mockInput: ProfileProposalInput = {
    abstractTranscript: mockAbstractTranscript,
    docTypeHint: 'spec',
  };

  beforeEach(() => {
    mockFetch.mockClear();
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
    
    // The compiler will throw when trying to call LLM without API key
    await expect(compiler.proposeSpecProfile(mockInput)).rejects.toThrow(/API key not configured/);
  });

  it('should handle LLM API errors gracefully', async () => {
    const compiler = createAPIRulesetCompiler({
      apiKey: 'test-key',
      apiUrl: 'https://api.test.com/v1/chat/completions',
    });

    // Mock fetch to return error
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Unauthorized',
      json: async () => ({ error: 'Unauthorized' }),
      headers: new Headers(),
    } as unknown as Response);

    await expect(compiler.proposeSpecProfile(mockInput)).rejects.toThrow(/LLM API error/);
  });

  it('should parse spec profile from LLM response', async () => {
    const compiler = createAPIRulesetCompiler({
      apiKey: 'test-key',
    });

    const mockLLMResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
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
      headers: new Headers(),
      text: async () => '',
    } as unknown as Response;

    mockFetch.mockResolvedValueOnce(mockLLMResponse);

    // Note: This will fail validation if we don't have original transcript
    // But it tests the parsing logic
    // The test will return with validation issues (no original transcript for validation)
    const result = await compiler.proposeSpecProfile(mockInput);
    
    expect(result).toBeDefined();
    expect(result.profile).toBeDefined();
    expect(result.profile.docType).toBe('spec');
    expect(result.metadata.attempts).toBeGreaterThan(0);
    // Validation will fail without original transcript, but parsing should work
    expect(result.validation.valid).toBe(false);
    expect(result.validation.issues.length).toBeGreaterThan(0);
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
      status: 200,
      statusText: 'OK',
      json: async () => ({
        model: 'gpt-4',
        choices: [{
          message: {
            content: `Here's the profile:\n\`\`\`json\n${JSON.stringify(mockProfile)}\n\`\`\``,
          },
        }],
      }),
      headers: new Headers(),
      text: async () => '',
    } as unknown as Response;

    mockFetch.mockResolvedValueOnce(mockLLMResponse);

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
      status: 200,
      statusText: 'OK',
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
      headers: new Headers(),
      text: async () => '',
    } as unknown as Response;

    mockFetch.mockResolvedValue(mockResponse);

    // Should complete without throwing (will return with validation issues)
    const result = await compiler.proposeSpecProfile(mockInput);
    
    expect(result).toBeDefined();
    expect(result.metadata.attempts).toBeGreaterThan(0);
  });
});

/**
 * Tests for structured prompt builder
 * 
 * Verifies:
 * - Prompt includes summaries (bands, fonts, headings, tables)
 * - Prompt respects size limits
 * - Prompt is deterministic
 */

import { describe, it, expect } from '@jest/globals';
import { createTranscriptExtractor, sanitizeTranscript, PrivacyMode, buildCompilerPrompt } from '@conset-pdf/core';
import type { AbstractTranscript } from '@conset-pdf/core';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Structured Prompt Builder', () => {
  // Use workspace-relative path
  const testPdfPath = path.join(__dirname, '../../../../../..', '.reference', 'LHHS', 'Specifications', '23_MECH_FULL.pdf');
  
  it('should include band summaries in prompt', async () => {
    const extractor = createTranscriptExtractor();
    let transcript;
    
    try {
      transcript = await extractor.extractTranscript(testPdfPath);
    } catch (error: any) {
      if (error.message?.includes('PyMuPDF not installed')) {
        return;
      }
      throw error;
    }
    
    const { abstractTranscript } = sanitizeTranscript(transcript, {
      privacyMode: PrivacyMode.STRICT_STRUCTURE_ONLY,
      sampling: { maxPages: 3 },
    });
    
    const prompt = buildCompilerPrompt(abstractTranscript, transcript, 100000);
    
    // Check prompt includes band information
    expect(prompt).toContain('BAND DEFINITIONS');
    if (abstractTranscript.bands) {
      expect(prompt).toContain('header');
      expect(prompt).toContain('footer');
      expect(prompt).toContain('body');
    }
  });
  
  it('should include font cluster summary in prompt', async () => {
    const extractor = createTranscriptExtractor();
    let transcript;
    
    try {
      transcript = await extractor.extractTranscript(testPdfPath);
    } catch (error: any) {
      if (error.message?.includes('PyMuPDF not installed')) {
        return;
      }
      throw error;
    }
    
    const { abstractTranscript } = sanitizeTranscript(transcript, {
      privacyMode: PrivacyMode.STRICT_STRUCTURE_ONLY,
      sampling: { maxPages: 3 },
    });
    
    const prompt = buildCompilerPrompt(abstractTranscript, transcript, 100000);
    
    // Check prompt includes font cluster summary
    expect(prompt).toContain('FONT CLUSTER SUMMARY');
    expect(prompt).toContain('fontSize');
    expect(prompt).toContain('count');
  });
  
  it('should include heading candidate summary in prompt', async () => {
    const extractor = createTranscriptExtractor();
    let transcript;
    
    try {
      transcript = await extractor.extractTranscript(testPdfPath);
    } catch (error: any) {
      if (error.message?.includes('PyMuPDF not installed')) {
        return;
      }
      throw error;
    }
    
    const { abstractTranscript } = sanitizeTranscript(transcript, {
      privacyMode: PrivacyMode.STRICT_STRUCTURE_ONLY,
      sampling: { maxPages: 3 },
    });
    
    const prompt = buildCompilerPrompt(abstractTranscript, transcript, 100000);
    
    // Check prompt includes heading candidate summary
    expect(prompt).toContain('HEADING CANDIDATE SUMMARY');
    expect(prompt).toContain('total');
    expect(prompt).toContain('perPageDistribution');
  });
  
  it('should include table candidate summary in prompt', async () => {
    const extractor = createTranscriptExtractor();
    let transcript;
    
    try {
      transcript = await extractor.extractTranscript(testPdfPath);
    } catch (error: any) {
      if (error.message?.includes('PyMuPDF not installed')) {
        return;
      }
      throw error;
    }
    
    const { abstractTranscript } = sanitizeTranscript(transcript, {
      privacyMode: PrivacyMode.STRICT_STRUCTURE_ONLY,
      sampling: { maxPages: 3 },
    });
    
    const prompt = buildCompilerPrompt(abstractTranscript, transcript, 100000);
    
    // Check prompt includes table candidate summary
    expect(prompt).toContain('TABLE CANDIDATE SUMMARY');
    expect(prompt).toContain('count');
  });
  
  it('should respect size limits', async () => {
    const extractor = createTranscriptExtractor();
    let transcript;
    
    try {
      transcript = await extractor.extractTranscript(testPdfPath);
    } catch (error: any) {
      if (error.message?.includes('PyMuPDF not installed')) {
        return;
      }
      throw error;
    }
    
    const { abstractTranscript } = sanitizeTranscript(transcript, {
      privacyMode: PrivacyMode.STRICT_STRUCTURE_ONLY,
      sampling: { maxPages: 10 },
    });
    
    const maxBytes = 10000; // 10KB limit
    const prompt = buildCompilerPrompt(abstractTranscript, transcript, maxBytes);
    
    // Prompt should be within limit (with some tolerance)
    expect(prompt.length).toBeLessThanOrEqual(maxBytes * 1.1); // 10% tolerance
  });
  
  it('should be deterministic across runs', async () => {
    const extractor = createTranscriptExtractor();
    let transcript;
    
    try {
      transcript = await extractor.extractTranscript(testPdfPath);
    } catch (error: any) {
      if (error.message?.includes('PyMuPDF not installed')) {
        return;
      }
      throw error;
    }
    
    const { abstractTranscript } = sanitizeTranscript(transcript, {
      privacyMode: PrivacyMode.STRICT_STRUCTURE_ONLY,
      sampling: { maxPages: 3 },
      salt: 'test-salt', // Fixed salt for determinism
    });
    
    const prompt1 = buildCompilerPrompt(abstractTranscript, transcript, 100000);
    const prompt2 = buildCompilerPrompt(abstractTranscript, transcript, 100000);
    
    // Prompts should be identical
    expect(prompt1).toBe(prompt2);
  });
  
  it('should include coordinate system information', async () => {
    const extractor = createTranscriptExtractor();
    let transcript;
    
    try {
      transcript = await extractor.extractTranscript(testPdfPath);
    } catch (error: any) {
      if (error.message?.includes('PyMuPDF not installed')) {
        return;
      }
      throw error;
    }
    
    const { abstractTranscript } = sanitizeTranscript(transcript, {
      privacyMode: PrivacyMode.STRICT_STRUCTURE_ONLY,
      sampling: { maxPages: 1 },
    });
    
    const prompt = buildCompilerPrompt(abstractTranscript, transcript, 100000);
    
    // Check prompt includes coordinate system
    expect(prompt).toContain('COORDINATE SYSTEM');
    expect(prompt).toContain('top-left');
    expect(prompt).toContain('pt');
    expect(prompt).toContain('down');
  });
  
  it('should include sample pages with lines and spans', async () => {
    const extractor = createTranscriptExtractor();
    let transcript;
    
    try {
      transcript = await extractor.extractTranscript(testPdfPath);
    } catch (error: any) {
      if (error.message?.includes('PyMuPDF not installed')) {
        return;
      }
      throw error;
    }
    
    const { abstractTranscript } = sanitizeTranscript(transcript, {
      privacyMode: PrivacyMode.STRICT_STRUCTURE_ONLY,
      sampling: { maxPages: 3 },
    });
    
    const prompt = buildCompilerPrompt(abstractTranscript, transcript, 100000);
    
    // Check prompt includes sample pages
    expect(prompt).toContain('SAMPLE PAGES');
    expect(prompt).toContain('pageNumber');
    expect(prompt).toContain('spanCount');
    expect(prompt).toContain('lineCount');
    expect(prompt).toContain('placeholderId');
    expect(prompt).toContain('tokenShape');
  });
});

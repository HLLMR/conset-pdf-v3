/**
 * Tests for abstract transcript improvements
 * 
 * Verifies:
 * - PlaceholderId stability for identical shapes
 * - Shape features (tokenShape, charClassFlags, lengthBucket)
 * - Repetition metrics with denominators
 * - Line grouping and reading order
 * - Coordinate system metadata
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createTranscriptExtractor, sanitizeTranscript, PrivacyMode } from '@conset-pdf/core';
import type { AbstractTranscript } from '@conset-pdf/core';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use workspace-relative path
const testPdfPath = path.join(__dirname, '../../../../../..', '.reference', 'LHHS', 'Specifications', '23_MECH_FULL.pdf');

describe('Abstract Transcript Improvements', () => {
  it('should generate stable placeholderIds for identical shapes', async () => {
    const extractor = createTranscriptExtractor();
    let transcript;
    
    try {
      transcript = await extractor.extractTranscript(testPdfPath);
    } catch (error: any) {
      if (error.message?.includes('PyMuPDF not installed')) {
        // Skip if PyMuPDF not available
        return;
      }
      throw error;
    }
    
    // Sanitize twice with same options
    const { abstractTranscript: abstract1 } = sanitizeTranscript(transcript, {
      privacyMode: PrivacyMode.STRICT_STRUCTURE_ONLY,
      sampling: { maxPages: 3 },
    });
    
    const { abstractTranscript: abstract2 } = sanitizeTranscript(transcript, {
      privacyMode: PrivacyMode.STRICT_STRUCTURE_ONLY,
      sampling: { maxPages: 3 },
    });
    
    // Collect placeholderIds by shape features
    const shapeMap1 = new Map<string, string>();
    const shapeMap2 = new Map<string, string>();
    
    for (const page of abstract1.pages) {
      for (const span of page.spans) {
        const shapeKey = `${span.tokenClass}-${span.tokenShape}-${span.lengthBucket}-${JSON.stringify(span.charClassFlags)}`;
        shapeMap1.set(shapeKey, span.placeholderId);
      }
    }
    
    for (const page of abstract2.pages) {
      for (const span of page.spans) {
        const shapeKey = `${span.tokenClass}-${span.tokenShape}-${span.lengthBucket}-${JSON.stringify(span.charClassFlags)}`;
        shapeMap2.set(shapeKey, span.placeholderId);
      }
    }
    
    // Identical shapes should have identical placeholderIds
    for (const [shapeKey, placeholderId1] of shapeMap1.entries()) {
      const placeholderId2 = shapeMap2.get(shapeKey);
      if (placeholderId2) {
        expect(placeholderId1).toBe(placeholderId2);
      }
    }
  });
  
  it('should include shape features in all spans', async () => {
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
      sampling: { maxPages: 2 },
    });
    
    // Check all spans have required shape features
    for (const page of abstractTranscript.pages) {
      for (const span of page.spans) {
        expect(span.placeholderId).toBeDefined();
        expect(span.placeholderId).toMatch(/^PLACEHOLDER_[a-f0-9]{12}$/i);
        expect(span.tokenShape).toBeDefined();
        expect(typeof span.tokenShape).toBe('string');
        expect(span.charClassFlags).toBeDefined();
        expect(span.charClassFlags.hasDigit).toBeDefined();
        expect(span.charClassFlags.hasAlpha).toBeDefined();
        expect(span.lengthBucket).toBeDefined();
        expect(['1', '2-3', '4-6', '7-12', '13+']).toContain(span.lengthBucket);
      }
    }
  });
  
  it('should compute repetition metrics with denominators', async () => {
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
      sampling: { maxPages: 5 },
    });
    
    // Check repetition metrics are present and valid
    for (const page of abstractTranscript.pages) {
      for (const span of page.spans) {
        expect(span.repetition).toBeDefined();
        expect(typeof span.repetition.repeatCountDoc).toBe('number');
        expect(span.repetition.repeatCountDoc).toBeGreaterThanOrEqual(0);
        expect(typeof span.repetition.repeatRateDoc).toBe('number');
        expect(span.repetition.repeatRateDoc).toBeGreaterThanOrEqual(0);
        expect(span.repetition.repeatRateDoc).toBeLessThanOrEqual(1);
        expect(typeof span.repetition.repeatPages).toBe('number');
        expect(span.repetition.repeatPages).toBeGreaterThanOrEqual(0);
        expect(span.repetition.repeatRateByBand).toBeDefined();
        expect(typeof span.repetition.repeatRateByBand.header).toBe('number');
        expect(typeof span.repetition.repeatRateByBand.footer).toBe('number');
        expect(typeof span.repetition.repeatRateByBand.body).toBe('number');
      }
    }
    
    // Verify totalPages is present in metadata
    expect(abstractTranscript.metadata.totalPages).toBeDefined();
    expect(typeof abstractTranscript.metadata.totalPages).toBe('number');
  });
  
  it('should include band definitions when available', async () => {
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
    
    if (abstractTranscript.bands) {
      expect(abstractTranscript.bands.header).toBeDefined();
      expect(abstractTranscript.bands.header.yMin).toBeDefined();
      expect(abstractTranscript.bands.header.yMax).toBeDefined();
      expect(abstractTranscript.bands.footer).toBeDefined();
      expect(abstractTranscript.bands.footer.yMin).toBeDefined();
      expect(abstractTranscript.bands.footer.yMax).toBeDefined();
      expect(abstractTranscript.bands.body).toBeDefined();
      expect(abstractTranscript.bands.body.yMin).toBeDefined();
      expect(abstractTranscript.bands.body.yMax).toBeDefined();
    }
  });
  
  it('should include sampling metadata when sampling is used', async () => {
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
    
    expect(abstractTranscript.sampling).toBeDefined();
    expect(abstractTranscript.sampling?.sampledPages).toBe(3);
    expect(abstractTranscript.sampling?.totalPages).toBe(transcript.metadata.totalPages);
    expect(abstractTranscript.sampling?.samplingStrategy).toBeDefined();
    expect(typeof abstractTranscript.sampling?.samplingStrategy).toBe('string');
  });
  
  it('should group spans into lines with reading order', async () => {
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
      sampling: { maxPages: 2 },
    });
    
    // Check lines are present
    for (const page of abstractTranscript.pages) {
      expect(page.lines).toBeDefined();
      if (page.lines && page.lines.length > 0) {
        // Check line structure
        for (const line of page.lines) {
          expect(line.lineId).toBeDefined();
          expect(line.pageIndex).toBe(page.pageIndex);
          expect(line.lineBbox).toBeDefined();
          expect(line.lineBbox.length).toBe(4);
          expect(line.lineIndexWithinPage).toBeDefined();
          expect(typeof line.lineIndexWithinPage).toBe('number');
          expect(line.readingOrderIndex).toBeDefined();
          expect(typeof line.readingOrderIndex).toBe('number');
          expect(line.placeholders).toBeDefined();
          expect(Array.isArray(line.placeholders)).toBe(true);
          
          // Check spans reference lineId
          for (const span of line.placeholders) {
            expect(span.lineId).toBe(line.lineId);
          }
        }
        
        // Check reading order increases monotonically
        const readingOrders = page.lines.map(l => l.readingOrderIndex);
        for (let i = 1; i < readingOrders.length; i++) {
          expect(readingOrders[i]).toBeGreaterThanOrEqual(readingOrders[i - 1]);
        }
      }
    }
  });
  
  it('should include coordinate system metadata', async () => {
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
    
    expect(abstractTranscript.coordinateSystem).toBeDefined();
    expect(abstractTranscript.coordinateSystem.origin).toBe('top-left');
    expect(abstractTranscript.coordinateSystem.units).toBe('pt');
    expect(abstractTranscript.coordinateSystem.yDirection).toBe('down');
    expect(abstractTranscript.coordinateSystem.rotationNormalized).toBe(true);
  });
  
  it('should not leak original text in placeholderIds', async () => {
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
      sampling: { maxPages: 2 },
    });
    
    // Check that placeholderIds don't contain readable text
    const sensitivePatterns = [
      /project/i,
      /client/i,
      /address/i,
      /phone/i,
      /email/i,
    ];
    
    for (const page of abstractTranscript.pages) {
      for (const span of page.spans) {
        // PlaceholderId should be hash-based, not contain original text
        expect(span.placeholderId).toMatch(/^PLACEHOLDER_[a-f0-9]{12}$/i);
        
        // Check no sensitive patterns in placeholderId
        for (const pattern of sensitivePatterns) {
          expect(span.placeholderId).not.toMatch(pattern);
        }
      }
    }
  });
});

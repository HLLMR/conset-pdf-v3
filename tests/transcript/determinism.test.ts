/**
 * Determinism tests for transcript extraction
 * 
 * Verifies that transcript extraction is deterministic:
 * - contentHash identical across extractions
 * - span counts/IDs stable
 * - optional: rendered overlay sanity (bboxes align within tolerance)
 */

import { describe, it, expect } from '@jest/globals';
import { createTranscriptExtractor } from '@conset-pdf/core';
import { PDFDocument } from 'pdf-lib';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Transcript Determinism', () => {
  let testPdfPath: string;
  
  beforeAll(async () => {
    // Create a minimal test PDF
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    page.drawText('Test Document', { x: 72, y: 720, size: 12 });
    page.drawText('This is a test paragraph with some content.', { x: 72, y: 700, size: 10 });
    
    const pdfBytes = await pdfDoc.save();
    testPdfPath = join(tmpdir(), `test-transcript-${Date.now()}.pdf`);
    writeFileSync(testPdfPath, pdfBytes);
  });
  
  afterAll(() => {
    try {
      unlinkSync(testPdfPath);
    } catch {
      // Ignore cleanup errors
    }
  });
  
  it('contentHash is identical across multiple extractions', async () => {
    const extractor = createTranscriptExtractor();
    
    const transcript1 = await extractor.extractTranscript(testPdfPath);
    const transcript2 = await extractor.extractTranscript(testPdfPath);
    
    // contentHash should be identical (excludes extractionDate)
    expect(transcript1.metadata.contentHash).toBeDefined();
    expect(transcript2.metadata.contentHash).toBeDefined();
    expect(transcript1.metadata.contentHash).toBe(transcript2.metadata.contentHash);
    
    // extractionDate should differ (but that's okay, it's excluded from hash)
    expect(transcript1.extractionDate).toBeDefined();
    expect(transcript2.extractionDate).toBeDefined();
  });
  
  it('span counts and IDs are stable', async () => {
    const extractor = createTranscriptExtractor();
    
    const transcript1 = await extractor.extractTranscript(testPdfPath);
    const transcript2 = await extractor.extractTranscript(testPdfPath);
    
    // Same number of pages
    expect(transcript1.pages.length).toBe(transcript2.pages.length);
    expect(transcript1.pages.length).toBeGreaterThan(0);
    
    // Same span counts per page
    transcript1.pages.forEach((page1, idx) => {
      const page2 = transcript2.pages[idx];
      expect(page1.spans.length).toBe(page2.spans.length);
      
      // Same span IDs (after canonicalization, IDs should match)
      const ids1 = page1.spans.map(s => s.spanId).sort();
      const ids2 = page2.spans.map(s => s.spanId).sort();
      expect(ids1).toEqual(ids2);
    });
  });
  
  it('rendered overlay sanity: bboxes align within tolerance', async () => {
    const extractor = createTranscriptExtractor();
    
    const transcript1 = await extractor.extractTranscript(testPdfPath);
    const transcript2 = await extractor.extractTranscript(testPdfPath);
    
    const tolerance = 0.1; // Points
    
    transcript1.pages.forEach((page1, pageIdx) => {
      const page2 = transcript2.pages[pageIdx];
      
      // Sort spans by position for comparison
      const sorted1 = [...page1.spans].sort((a, b) => {
        const yDiff = a.bbox[1] - b.bbox[1];
        if (Math.abs(yDiff) > tolerance) {
          return yDiff;
        }
        return a.bbox[0] - b.bbox[0];
      });
      
      const sorted2 = [...page2.spans].sort((a, b) => {
        const yDiff = a.bbox[1] - b.bbox[1];
        if (Math.abs(yDiff) > tolerance) {
          return yDiff;
        }
        return a.bbox[0] - b.bbox[0];
      });
      
      expect(sorted1.length).toBe(sorted2.length);
      
      sorted1.forEach((span1, spanIdx) => {
        const span2 = sorted2[spanIdx];
        
        // Bboxes should align within tolerance
        for (let i = 0; i < 4; i++) {
          expect(Math.abs(span1.bbox[i] - span2.bbox[i])).toBeLessThan(tolerance);
        }
      });
    });
  });
  
  it('spanHash is stable across extractions', async () => {
    const extractor = createTranscriptExtractor();
    
    const transcript1 = await extractor.extractTranscript(testPdfPath);
    const transcript2 = await extractor.extractTranscript(testPdfPath);
    
    // spanHash should be identical (structure hash)
    expect(transcript1.metadata.spanHash).toBeDefined();
    expect(transcript2.metadata.spanHash).toBeDefined();
    expect(transcript1.metadata.spanHash).toBe(transcript2.metadata.spanHash);
  });
});

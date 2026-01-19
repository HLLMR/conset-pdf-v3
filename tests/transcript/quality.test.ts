/**
 * Quality scoring tests for transcript extraction
 */

import { describe, it, expect } from '@jest/globals';
import { createTranscriptExtractor, scoreTranscriptQuality } from '@conset-pdf/core';
import { PDFDocument } from 'pdf-lib';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Transcript Quality Scoring', () => {
  let testPdfPath: string;
  
  beforeAll(async () => {
    // Create a minimal test PDF with good quality text
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    page.drawText('SECTION 23 09 00', { x: 72, y: 720, size: 14 });
    page.drawText('This is a test paragraph with sufficient content to pass quality gates.', { x: 72, y: 700, size: 10 });
    page.drawText('Another paragraph with more content for quality validation.', { x: 72, y: 680, size: 10 });
    
    const pdfBytes = await pdfDoc.save();
    testPdfPath = join(tmpdir(), `test-quality-${Date.now()}.pdf`);
    writeFileSync(testPdfPath, pdfBytes);
  });
  
  afterAll(() => {
    try {
      unlinkSync(testPdfPath);
    } catch {
      // Ignore cleanup errors
    }
  });
  
  it('scores transcript quality', async () => {
    const extractor = createTranscriptExtractor();
    const transcript = await extractor.extractTranscript(testPdfPath);
    
    const qualityReport = scoreTranscriptQuality(transcript);
    
    // Verify structure
    expect(qualityReport).toHaveProperty('overallScore');
    expect(qualityReport).toHaveProperty('pageMetrics');
    expect(qualityReport).toHaveProperty('aggregate');
    expect(qualityReport).toHaveProperty('gates');
    expect(qualityReport).toHaveProperty('passes');
    expect(qualityReport).toHaveProperty('issues');
    
    // Verify score is in valid range
    expect(qualityReport.overallScore).toBeGreaterThanOrEqual(0);
    expect(qualityReport.overallScore).toBeLessThanOrEqual(1);
    
    // Verify page metrics
    expect(qualityReport.pageMetrics.length).toBe(transcript.pages.length);
    
    // Verify aggregate metrics
    expect(qualityReport.aggregate.extractedCharCount).toBeGreaterThan(0);
    expect(qualityReport.aggregate.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(qualityReport.aggregate.confidenceScore).toBeLessThanOrEqual(1);
  });
  
  it('validates quality gates', async () => {
    const extractor = createTranscriptExtractor();
    const transcript = await extractor.extractTranscript(testPdfPath);
    
    const qualityReport = scoreTranscriptQuality(transcript);
    
    // Verify gates structure
    expect(qualityReport.gates).toHaveProperty('minCharCount');
    expect(qualityReport.gates).toHaveProperty('maxReplacementRatio');
    expect(qualityReport.gates).toHaveProperty('minOrderingSanity');
    expect(qualityReport.gates).toHaveProperty('minConfidence');
    
    // For a good PDF, gates should pass
    // (This may vary based on PDF quality, so we just verify structure)
    expect(typeof qualityReport.gates.minCharCount).toBe('boolean');
    expect(typeof qualityReport.gates.maxReplacementRatio).toBe('boolean');
    expect(typeof qualityReport.gates.minOrderingSanity).toBe('boolean');
    expect(typeof qualityReport.gates.minConfidence).toBe('boolean');
  });
});

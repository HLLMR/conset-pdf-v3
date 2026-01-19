/**
 * Bbox accuracy validation tests
 * 
 * Compares bbox accuracy between PyMuPDF and PDF.js extractors
 */

import { describe, it, expect } from '@jest/globals';
import { PyMuPDFExtractor, PDFjsExtractor, isPyMuPDFAvailable, createTranscriptExtractor } from '@conset-pdf/core';
import { PDFDocument } from 'pdf-lib';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Bbox Accuracy Validation', () => {
  let testPdfPath: string;
  
  beforeAll(async () => {
    // Create a test PDF with text at known positions
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    
    // Add text with known positions (in points)
    // x=72, y=720, size=12 means text starts at (72, 720) and extends down
    page.drawText('Test Text', { x: 72, y: 720, size: 12 });
    page.drawText('Another Line', { x: 72, y: 700, size: 10 });
    
    const pdfBytes = await pdfDoc.save();
    testPdfPath = join(tmpdir(), `test-bbox-${Date.now()}.pdf`);
    writeFileSync(testPdfPath, pdfBytes);
  });
  
  afterAll(() => {
    try {
      unlinkSync(testPdfPath);
    } catch {
      // Ignore cleanup errors
    }
  });
  
  it('should extract bboxes with PyMuPDF', async () => {
    const pymupdfAvailable = await isPyMuPDFAvailable();
    
    if (!pymupdfAvailable) {
      console.log('PyMuPDF not available, skipping test');
      return;
    }
    
    const extractor = new PyMuPDFExtractor();
    const transcript = await extractor.extractTranscript(testPdfPath);
    
    expect(transcript.pages.length).toBeGreaterThan(0);
    
    const firstPage = transcript.pages[0];
    expect(firstPage.spans.length).toBeGreaterThan(0);
    
    // Verify bboxes are valid
    for (const span of firstPage.spans) {
      expect(span.bbox).toBeDefined();
      expect(span.bbox.length).toBe(4);
      
      // Bbox should be in visual space (top-left origin)
      const [x0, y0, x1, y1] = span.bbox;
      expect(x0).toBeLessThan(x1);
      expect(y0).toBeLessThan(y1);
      
      // Bbox should be within page bounds
      expect(x0).toBeGreaterThanOrEqual(0);
      expect(y0).toBeGreaterThanOrEqual(0);
      expect(x1).toBeLessThanOrEqual(firstPage.width);
      expect(y1).toBeLessThanOrEqual(firstPage.height);
    }
  });
  
  it('should extract bboxes with PDF.js', async () => {
    const extractor = new PDFjsExtractor();
    const transcript = await extractor.extractTranscript(testPdfPath);
    
    expect(transcript.pages.length).toBeGreaterThan(0);
    
    const firstPage = transcript.pages[0];
    expect(firstPage.spans.length).toBeGreaterThan(0);
    
    // Verify bboxes are valid
    for (const span of firstPage.spans) {
      expect(span.bbox).toBeDefined();
      expect(span.bbox.length).toBe(4);
      
      const [x0, y0, x1, y1] = span.bbox;
      expect(x0).toBeLessThan(x1);
      expect(y0).toBeLessThan(y1);
    }
  });
  
  it('should compare bbox accuracy between extractors', async () => {
    const pymupdfAvailable = await isPyMuPDFAvailable();
    
    if (!pymupdfAvailable) {
      console.log('PyMuPDF not available, skipping comparison test');
      return;
    }
    
    const pymupdfExtractor = new PyMuPDFExtractor();
    const pdfjsExtractor = new PDFjsExtractor();
    
    const pymupdfTranscript = await pymupdfExtractor.extractTranscript(testPdfPath);
    const pdfjsTranscript = await pdfjsExtractor.extractTranscript(testPdfPath);
    
    // Both should extract the same number of pages
    expect(pymupdfTranscript.pages.length).toBe(pdfjsTranscript.pages.length);
    
    // Compare span counts (PyMuPDF typically extracts more accurately)
    const pymupdfSpans = pymupdfTranscript.pages[0].spans.length;
    const pdfjsSpans = pdfjsTranscript.pages[0].spans.length;
    
    // PyMuPDF should extract at least as many spans as PDF.js
    expect(pymupdfSpans).toBeGreaterThanOrEqual(pdfjsSpans);
    
    // Compare bbox consistency
    // For the same text, bboxes should be roughly similar
    // (allowing for some tolerance due to different extraction methods)
    const tolerance = 10; // points
    
    // Find matching spans by text content
    const pymupdfTextMap = new Map(
      pymupdfTranscript.pages[0].spans.map(s => [s.text.trim(), s])
    );
    const pdfjsTextMap = new Map(
      pdfjsTranscript.pages[0].spans.map(s => [s.text.trim(), s])
    );
    
    let matches = 0;
    for (const [text, pymupdfSpan] of pymupdfTextMap) {
      const pdfjsSpan = pdfjsTextMap.get(text);
      if (pdfjsSpan) {
        matches++;
        
        // Compare bbox positions (with tolerance)
        const [px0, py0, px1, py1] = pymupdfSpan.bbox;
        const [jx0, jy0, jx1, jy1] = pdfjsSpan.bbox;
        
        // X coordinates should be similar
        expect(Math.abs(px0 - jx0)).toBeLessThan(tolerance);
        expect(Math.abs(px1 - jx1)).toBeLessThan(tolerance);
        
        // Y coordinates may differ more due to coordinate system differences
        // But should still be within reasonable tolerance
        expect(Math.abs(py0 - jy0)).toBeLessThan(tolerance * 2);
        expect(Math.abs(py1 - jy1)).toBeLessThan(tolerance * 2);
      }
    }
    
    // Should have at least some matching spans
    expect(matches).toBeGreaterThan(0);
  });
  
  it('should handle rotated pages correctly', async () => {
    // Create a PDF with rotated page
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    page.setRotation(90); // Rotate 90 degrees
    page.drawText('Rotated Text', { x: 72, y: 720, size: 12 });
    
    const pdfBytes = await pdfDoc.save();
    const rotatedPath = join(tmpdir(), `test-rotated-${Date.now()}.pdf`);
    writeFileSync(rotatedPath, pdfBytes);
    
    try {
      const extractor = createTranscriptExtractor();
      const transcript = await extractor.extractTranscript(rotatedPath);
      
      // After canonicalization, rotation should be normalized
      const firstPage = transcript.pages[0];
      expect(firstPage.rotation).toBe(0); // Should be normalized to 0
      
      // Bboxes should still be valid
      for (const span of firstPage.spans) {
        const [x0, y0, x1, y1] = span.bbox;
        expect(x0).toBeLessThan(x1);
        expect(y0).toBeLessThan(y1);
      }
    } finally {
      try {
        unlinkSync(rotatedPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  });
});

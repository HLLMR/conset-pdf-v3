/**
 * Extraction accuracy tests
 * 
 * Tests extraction accuracy across different PDF types and conditions
 */

import { describe, it, expect } from '@jest/globals';
import { createTranscriptExtractor, isPyMuPDFAvailable, isPDFjsAvailable } from '@conset-pdf/core';
import { PDFDocument } from 'pdf-lib';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Transcript Extraction Accuracy', () => {
  let testPdfPath: string;
  
  beforeAll(async () => {
    // Create a test PDF with known content
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    
    // Add text with known positions
    page.drawText('SECTION 23 09 00', { x: 72, y: 720, size: 14 });
    page.drawText('HVAC EQUIPMENT', { x: 72, y: 700, size: 12 });
    page.drawText('This is a test paragraph with multiple lines of content.', { x: 72, y: 680, size: 10 });
    page.drawText('Another paragraph for testing extraction accuracy.', { x: 72, y: 660, size: 10 });
    
    const pdfBytes = await pdfDoc.save();
    testPdfPath = join(tmpdir(), `test-extraction-${Date.now()}.pdf`);
    writeFileSync(testPdfPath, pdfBytes);
  });
  
  afterAll(() => {
    try {
      unlinkSync(testPdfPath);
    } catch {
      // Ignore cleanup errors
    }
  });
  
  it('should extract text content accurately', async () => {
    const extractor = createTranscriptExtractor();
    const transcript = await extractor.extractTranscript(testPdfPath);
    
    // Verify structure
    expect(transcript).toBeDefined();
    expect(transcript.pages.length).toBeGreaterThan(0);
    
    // Verify text extraction
    const firstPage = transcript.pages[0];
    expect(firstPage.spans.length).toBeGreaterThan(0);
    
    // Collect all text
    const extractedText = firstPage.spans.map(s => s.text).join(' ');
    
    // Verify key content is present
    expect(extractedText).toContain('SECTION');
    expect(extractedText).toContain('HVAC');
    expect(extractedText).toContain('EQUIPMENT');
  });
  
  it('should extract bbox coordinates', async () => {
    const extractor = createTranscriptExtractor();
    const transcript = await extractor.extractTranscript(testPdfPath);
    
    const firstPage = transcript.pages[0];
    expect(firstPage.spans.length).toBeGreaterThan(0);
    
    // Verify all spans have valid bboxes
    for (const span of firstPage.spans) {
      expect(span.bbox).toBeDefined();
      expect(span.bbox.length).toBe(4);
      expect(span.bbox[0]).toBeLessThan(span.bbox[2]); // x0 < x1
      expect(span.bbox[1]).toBeLessThan(span.bbox[3]); // y0 < y1
    }
  });
  
  it('should extract font information', async () => {
    const extractor = createTranscriptExtractor();
    const transcript = await extractor.extractTranscript(testPdfPath);
    
    const firstPage = transcript.pages[0];
    expect(firstPage.spans.length).toBeGreaterThan(0);
    
    // Verify font information is present
    for (const span of firstPage.spans) {
      expect(span.fontName).toBeDefined();
      expect(span.fontSize).toBeGreaterThan(0);
    }
  });
  
  it('should handle multi-page documents', async () => {
    // Create multi-page PDF
    const pdfDoc = await PDFDocument.create();
    const page1 = pdfDoc.addPage([612, 792]);
    page1.drawText('Page 1 Content', { x: 72, y: 720, size: 12 });
    
    const page2 = pdfDoc.addPage([612, 792]);
    page2.drawText('Page 2 Content', { x: 72, y: 720, size: 12 });
    
    const pdfBytes = await pdfDoc.save();
    const multiPagePath = join(tmpdir(), `test-multipage-${Date.now()}.pdf`);
    writeFileSync(multiPagePath, pdfBytes);
    
    try {
      const extractor = createTranscriptExtractor();
      const transcript = await extractor.extractTranscript(multiPagePath);
      
      expect(transcript.pages.length).toBe(2);
      expect(transcript.pages[0].pageNumber).toBe(1);
      expect(transcript.pages[1].pageNumber).toBe(2);
      
      // Verify page content
      const page1Text = transcript.pages[0].spans.map(s => s.text).join(' ');
      const page2Text = transcript.pages[1].spans.map(s => s.text).join(' ');
      
      expect(page1Text).toContain('Page 1');
      expect(page2Text).toContain('Page 2');
    } finally {
      try {
        unlinkSync(multiPagePath);
      } catch {
        // Ignore cleanup errors
      }
    }
  });
  
  it('should extract metadata correctly', async () => {
    const extractor = createTranscriptExtractor();
    const transcript = await extractor.extractTranscript(testPdfPath);
    
    // Verify metadata
    expect(transcript.filePath).toBeDefined();
    expect(transcript.extractionEngine).toBeDefined();
    expect(transcript.extractionDate).toBeDefined();
    expect(transcript.metadata).toBeDefined();
    expect(transcript.metadata.totalPages).toBeGreaterThan(0);
  });
  
  it('should use PyMuPDF when available, PDF.js as fallback', async () => {
    const extractor = createTranscriptExtractor();
    const transcript = await extractor.extractTranscript(testPdfPath);
    
    // Should use either PyMuPDF or PDF.js (fallback)
    expect(['pymupdf', 'pdfjs']).toContain(transcript.extractionEngine.split('-')[0]);
    
    if (transcript.extractionEngine.startsWith('pdfjs')) {
      console.log('Using PDF.js fallback (PyMuPDF not available)');
    } else {
      console.log('Using PyMuPDF extractor');
    }
  });
  
  it('should fallback to PDF.js when PyMuPDF unavailable', async () => {
    const pymupdfAvailable = await isPyMuPDFAvailable();
    const pdfjsAvailable = await isPDFjsAvailable();
    
    if (!pymupdfAvailable && pdfjsAvailable) {
      const extractor = createTranscriptExtractor();
      const transcript = await extractor.extractTranscript(testPdfPath);
      
      // Should use PDF.js fallback
      expect(transcript.extractionEngine).toBe('pdfjs');
    } else {
      // Skip test if conditions not met
      console.log('Test conditions not met, skipping');
    }
  });
});

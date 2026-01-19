/**
 * Unit tests for SpecFooterIndexer
 * 
 * Tests token-based parsing using real footer patterns from page-regions-sample.json
 */

import { describe, it, expect } from '@jest/globals';
import { parseFooter, extractSectionIdFromTokens, extractPageNumberFromTokens } from '../specFooterIndexer.js';
import type { TextItemWithPosition } from '../../../utils/pdf.js';

describe('SpecFooterIndexer', () => {
  /**
   * Test with real footer token pattern from page-regions-sample.json page 0
   * 
   * Footer items (sorted by x):
   * - "23" at x: 216.41
   * - "00" at x: 229.25
   * - "0" at x: 242.09
   * - "0" at x: 247.13
   * - "Page" at x: 511.66
   * - "1" at x: 534.1
   * 
   * Expected: sectionId = "23 00 00", pageInSection = 1
   */
  it('should parse real footer pattern from page-regions-sample.json page 0', () => {
    // Real footer items from page 0, sorted by x coordinate
    const footerItems: TextItemWithPosition[] = [
      // Date tokens (before section ID)
      { str: '2025', x: 72.024, y: 753.48, width: 20.308440000000008, height: 9.96 },
      { str: '-', x: 92.544, y: 753.48, width: 3.3166800000000007, height: 9.96 },
      { str: '10', x: 95.904, y: 753.48, width: 10.14000000000001, height: 9.96 },
      { str: '-', x: 106.1, y: 753.48, width: 3.3166800000000007, height: 9.96 },
      { str: '01', x: 109.58, y: 753.48, width: 10.020000000000005, height: 9.96 },
      // Section ID tokens
      { str: '23', x: 216.41, y: 753.48, width: 10.14000000000001, height: 9.96 },
      { str: '00', x: 229.25, y: 753.48, width: 10.14000000000001, height: 9.96 },
      { str: '0', x: 242.09, y: 753.48, width: 4.980000000000001, height: 9.96 },
      { str: '0', x: 247.13, y: 753.48, width: 4.980000000000001, height: 9.96 },
      // Title tokens
      { str: '–', x: 254.93, y: 753.48, width: 4.980000000000001, height: 9.96 },
      { str: 'Heating, Ventilating, and Air Conditioning (HVAC) Work', x: 262.61, y: 753.48, width: 239.68740000000045, height: 9.96 },
      // Page number tokens
      { str: 'Page', x: 511.66, y: 753.48, width: 19.641120000000072, height: 9.96 },
      { str: '1', x: 534.1, y: 753.48, width: 6, height: 12 },
    ];
    
    const pageHeight = 792;
    
    const result = parseFooter(footerItems, pageHeight);
    
    // Verify section ID
    expect(result.sectionId).toBe('23 00 00');
    expect(result.tokenSpans?.sectionId).toBeDefined();
    expect(result.tokenSpans?.sectionId?.length).toBeGreaterThan(0);
    
    // Verify page number
    expect(result.pageInSection).toBe(1);
    expect(result.tokenSpans?.pageNumber).toBeDefined();
    expect(result.tokenSpans?.pageNumber?.length).toBeGreaterThan(0);
    
    // Verify confidence (should be high when both are found)
    expect(result.confidence).toBe('high');
    
    // Verify evidence contains token information
    expect(result.evidence).toContain('sectionId');
    expect(result.evidence).toContain('page');
  });
  
  describe('extractSectionIdFromTokens', () => {
    it('should extract section ID from adjacent numeric tokens', () => {
      const tokens = [
        { str: '23', x: 216.41 },
        { str: '00', x: 229.25 },
        { str: '0', x: 242.09 },
        { str: '0', x: 247.13 },
      ];
      
      const result = extractSectionIdFromTokens(tokens);
      
      expect(result.sectionId).toBe('23 00 00');
      expect(result.tokenSpans).toBeDefined();
      expect(result.tokenSpans?.length).toBe(4); // "23", "00", "0", "0"
    });
    
    it('should handle "00" tokens', () => {
      const tokens = [
        { str: '23', x: 100 },
        { str: '05', x: 120 },
        { str: '00', x: 140 },
      ];
      
      const result = extractSectionIdFromTokens(tokens);
      
      expect(result.sectionId).toBe('23 05 00');
    });
    
    it('should handle single "0" tokens that combine to "00"', () => {
      const tokens = [
        { str: '23', x: 100 },
        { str: '05', x: 120 },
        { str: '0', x: 140 },
        { str: '0', x: 145 },
      ];
      
      const result = extractSectionIdFromTokens(tokens);
      
      expect(result.sectionId).toBe('23 05 00');
    });
    
    it('should ignore non-numeric tokens before collecting digits', () => {
      const tokens = [
        { str: 'Project', x: 50 },
        { str: '23', x: 100 },
        { str: '00', x: 120 },
        { str: '00', x: 140 },
      ];
      
      const result = extractSectionIdFromTokens(tokens);
      
      expect(result.sectionId).toBe('23 00 00');
    });
    
    it('should return null if not enough digits found', () => {
      const tokens = [
        { str: '23', x: 100 },
        { str: '05', x: 120 },
      ];
      
      const result = extractSectionIdFromTokens(tokens);
      
      expect(result.sectionId).toBeNull();
    });
    
    it('should handle tokens with multiple digits', () => {
      const tokens = [
        { str: '23', x: 100 },
        { str: '05', x: 120 },
        { str: '53', x: 140 },
      ];
      
      const result = extractSectionIdFromTokens(tokens);
      
      expect(result.sectionId).toBe('23 05 53');
    });
  });
  
  describe('extractPageNumberFromTokens', () => {
    it('should extract page number after "Page" token', () => {
      const tokens = [
        { str: 'Page', x: 511.66 },
        { str: '1', x: 534.1 },
      ];
      
      const result = extractPageNumberFromTokens(tokens);
      
      expect(result.pageInSection).toBe(1);
      expect(result.tokenSpans).toBeDefined();
      expect(result.tokenSpans?.length).toBe(2); // "Page", "1"
    });
    
    it('should handle "Page:" with colon', () => {
      const tokens = [
        { str: 'Page', x: 500 },
        { str: ':', x: 520 },
        { str: '2', x: 530 },
      ];
      
      const result = extractPageNumberFromTokens(tokens);
      
      expect(result.pageInSection).toBe(2);
    });
    
    it('should handle "P." abbreviation', () => {
      const tokens = [
        { str: 'P.', x: 500 },
        { str: '3', x: 520 },
      ];
      
      const result = extractPageNumberFromTokens(tokens);
      
      expect(result.pageInSection).toBe(3);
    });
    
    it('should return null if "Page" not found', () => {
      const tokens = [
        { str: '23', x: 100 },
        { str: '00', x: 120 },
        { str: '00', x: 140 },
      ];
      
      const result = extractPageNumberFromTokens(tokens);
      
      expect(result.pageInSection).toBeNull();
    });
    
    it('should return null if no number after "Page"', () => {
      const tokens = [
        { str: 'Page', x: 500 },
        { str: 'Title', x: 520 },
      ];
      
      const result = extractPageNumberFromTokens(tokens);
      
      expect(result.pageInSection).toBeNull();
    });
    
    it('should handle multi-digit page numbers', () => {
      const tokens = [
        { str: 'Page', x: 500 },
        { str: '123', x: 520 },
      ];
      
      const result = extractPageNumberFromTokens(tokens);
      
      expect(result.pageInSection).toBe(123);
    });
  });
  
  describe('parseFooter integration', () => {
    it('should parse complete footer with section ID and page number', () => {
      const items: TextItemWithPosition[] = [
        { str: '23', x: 216.41, y: 753.48, width: 10.14, height: 9.96 },
        { str: '00', x: 229.25, y: 753.48, width: 10.14, height: 9.96 },
        { str: '0', x: 242.09, y: 753.48, width: 4.98, height: 9.96 },
        { str: '0', x: 247.13, y: 753.48, width: 4.98, height: 9.96 },
        { str: 'Page', x: 511.66, y: 753.48, width: 19.64, height: 9.96 },
        { str: '1', x: 534.1, y: 753.48, width: 6, height: 12 },
      ];
      
      const result = parseFooter(items, 792);
      
      expect(result.sectionId).toBe('23 00 00');
      expect(result.pageInSection).toBe(1);
      expect(result.confidence).toBe('high');
      expect(result.evidence).toBeTruthy();
    });
    
    it('should handle footer with only section ID', () => {
      const items: TextItemWithPosition[] = [
        { str: '23', x: 216.41, y: 753.48, width: 10.14, height: 9.96 },
        { str: '05', x: 229.25, y: 753.48, width: 10.14, height: 9.96 },
        { str: '53', x: 242.09, y: 753.48, width: 10.14, height: 9.96 },
      ];
      
      const result = parseFooter(items, 792);
      
      expect(result.sectionId).toBe('23 05 53');
      expect(result.pageInSection).toBeNull();
      expect(result.confidence).toBe('medium');
    });
    
    it('should handle footer with only page number', () => {
      const items: TextItemWithPosition[] = [
        { str: 'Page', x: 511.66, y: 753.48, width: 19.64, height: 9.96 },
        { str: '5', x: 534.1, y: 753.48, width: 6, height: 12 },
      ];
      
      const result = parseFooter(items, 792);
      
      expect(result.sectionId).toBeNull();
      expect(result.pageInSection).toBe(5);
      expect(result.confidence).toBe('medium');
    });
    
    it('should return low confidence for empty footer', () => {
      const items: TextItemWithPosition[] = [];
      
      const result = parseFooter(items, 792);
      
      expect(result.sectionId).toBeNull();
      expect(result.pageInSection).toBeNull();
      expect(result.confidence).toBe('low');
      expect(result.evidence).toBe('');
    });
  });
});

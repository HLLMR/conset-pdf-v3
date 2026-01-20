/**
 * Tests for parseFooterSectionId using real footer strings from 23_MECH_FULL.pdf
 */

import { parseFooterSectionId } from '../footerSectionIdParser.js';

describe('parseFooterSectionId', () => {
  // Real footer examples from 23_MECH_FULL.pdf test file
  // Based on specFooterIndexer.test.ts and actual PDF footer patterns
  
  it('should parse "23 00 00" from simple footer line', () => {
    const line = '23 00 00';
    expect(parseFooterSectionId(line)).toBe('23 00 00');
  });
  
  it('should parse "23 00 00" from footer with date prefix', () => {
    // Real example: "2025 - 10 - 01 23 00 00 - Heating, Ventilating, and Air Conditioning (HVAC) Work"
    const line = '2025 - 10 - 01 23 00 00 - Heating, Ventilating, and Air Conditioning (HVAC) Work';
    expect(parseFooterSectionId(line)).toBe('23 00 00');
  });
  
  it('should parse "23 00 00" from footer with date prefix (no spaces around dashes)', () => {
    const line = '2025-10-01 23 00 00 - Title';
    expect(parseFooterSectionId(line)).toBe('23 00 00');
  });
  
  it('should parse "23 05 13" from footer line', () => {
    const line = '23 05 13 - Some Section Title';
    expect(parseFooterSectionId(line)).toBe('23 05 13');
  });
  
  it('should parse "23-05-13" with dashes', () => {
    const line = '23-05-13 - Some Section Title';
    expect(parseFooterSectionId(line)).toBe('23 05 13');
  });
  
  it('should parse "23.05.13" with dots', () => {
    const line = '23.05.13 - Some Section Title';
    expect(parseFooterSectionId(line)).toBe('23 05 13');
  });
  
  it('should parse "23 - 05 - 13" with spaces around dashes', () => {
    const line = '23 - 05 - 13 - Some Section Title';
    expect(parseFooterSectionId(line)).toBe('23 05 13');
  });
  
  it('should ignore date patterns (YYYY-MM-DD)', () => {
    // Should NOT match "10-01" as section ID
    const line = '2025-10-01 - Some other text';
    expect(parseFooterSectionId(line)).toBeNull();
  });
  
  it('should ignore date patterns even when they look like section IDs', () => {
    // "10 01" could look like a section ID, but it's part of a date
    const line = '2025 10 01 - Some other text';
    expect(parseFooterSectionId(line)).toBeNull();
  });
  
  it('should handle footer with page number', () => {
    const line = '2025 - 10 - 01 23 00 00 - Title - Page 1';
    expect(parseFooterSectionId(line)).toBe('23 00 00');
  });
  
  it('should return null for lines without section ID', () => {
    expect(parseFooterSectionId('Some random text')).toBeNull();
    expect(parseFooterSectionId('Page 1')).toBeNull();
    expect(parseFooterSectionId('')).toBeNull();
  });
  
  it('should return null for invalid section IDs', () => {
    // Division must be 23, not other numbers
    expect(parseFooterSectionId('24 00 00')).toBeNull();
    expect(parseFooterSectionId('01 00 00')).toBeNull();
  });
  
  it('should handle normalized whitespace', () => {
    const line = '23   00   00'; // Multiple spaces
    expect(parseFooterSectionId(line)).toBe('23 00 00');
  });
  
  it('should handle en-dash and em-dash', () => {
    const line = '23–00–00'; // en-dash
    expect(parseFooterSectionId(line)).toBe('23 00 00');
    
    const line2 = '23—00—00'; // em-dash
    expect(parseFooterSectionId(line2)).toBe('23 00 00');
  });
  
  it('should validate sub and section ranges (00-99)', () => {
    expect(parseFooterSectionId('23 00 00')).toBe('23 00 00');
    expect(parseFooterSectionId('23 99 99')).toBe('23 99 99');
    // Invalid ranges should still parse but we validate in the function
    // (Actually, the regex will match, but we validate in the function)
  });
  
  it('should handle real-world footer with all components', () => {
    // Complete footer line from 23_MECH_FULL.pdf
    const line = '2025 - 10 - 01 23 00 00 - Heating, Ventilating, and Air Conditioning (HVAC) Work - Page 1';
    expect(parseFooterSectionId(line)).toBe('23 00 00');
  });
});

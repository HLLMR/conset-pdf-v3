/**
 * Unit tests for ROI band slicer
 */

import { describe, it, expect } from '@jest/globals';
import { sliceBand, extractFooterText, getAllBands, STANDARD_BANDS } from '../bandSlicer.js';
import type { TextItemWithPosition } from '../../utils/pdf.js';

describe('ROI Band Slicer', () => {
  const pageHeight = 800;
  
  function createItem(text: string, y: number, height: number = 15): TextItemWithPosition {
    return {
      str: text,
      x: 50,
      y,
      width: text.length * 10,
      height,
    };
  }
  
  describe('sliceBand', () => {
    it('should filter items in header band', () => {
      const items: TextItemWithPosition[] = [
        createItem('Header', 20, 15), // y=20, center=27.5, normalized=0.034 (in header 0-0.12)
        createItem('Body', 400, 15), // y=400, center=407.5, normalized=0.509 (not in header)
        createItem('Footer', 750, 15), // y=750, center=757.5, normalized=0.947 (not in header)
      ];
      
      const headerItems = sliceBand(items, pageHeight, STANDARD_BANDS.header);
      
      expect(headerItems.length).toBe(1);
      expect(headerItems[0].str).toBe('Header');
    });
    
    it('should filter items in footer band', () => {
      const items: TextItemWithPosition[] = [
        createItem('Header', 20, 15),
        createItem('Body', 400, 15),
        createItem('Footer', 750, 15), // y=750, center=757.5, normalized=0.947 (in footer 0.88-1.0)
        createItem('Page 1', 770, 15), // y=770, center=777.5, normalized=0.972 (in footer)
      ];
      
      const footerItems = sliceBand(items, pageHeight, STANDARD_BANDS.footer);
      
      expect(footerItems.length).toBe(2);
      expect(footerItems.map(i => i.str)).toEqual(['Footer', 'Page 1']);
    });
    
    it('should filter items in body band', () => {
      const items: TextItemWithPosition[] = [
        createItem('Header', 20, 15), // Not in body
        createItem('Body 1', 200, 15), // y=200, center=207.5, normalized=0.259 (in body 0.12-0.88)
        createItem('Body 2', 400, 15), // y=400, center=407.5, normalized=0.509 (in body)
        createItem('Footer', 750, 15), // Not in body
      ];
      
      const bodyItems = sliceBand(items, pageHeight, STANDARD_BANDS.body);
      
      expect(bodyItems.length).toBe(2);
      expect(bodyItems.map(i => i.str)).toEqual(['Body 1', 'Body 2']);
    });
  });
  
  describe('extractFooterText', () => {
    it('should join footer items into normalized text', () => {
      const items: TextItemWithPosition[] = [
        createItem('23', 750, 15),
        createItem('05', 750, 15),
        createItem('53', 750, 15),
        createItem('Page', 770, 15),
        createItem('1', 770, 15),
      ];
      
      const text = extractFooterText(items);
      
      expect(text).toBe('23 05 53 Page 1');
    });
    
    it('should handle multi-line footer text', () => {
      const items: TextItemWithPosition[] = [
        createItem('Project', 750, 15),
        createItem('Name', 750, 15),
        createItem('23', 770, 15),
        createItem('05', 770, 15),
        createItem('53', 770, 15),
      ];
      
      const text = extractFooterText(items);
      
      expect(text).toBe('Project Name 23 05 53');
    });
  });
  
  describe('getAllBands', () => {
    it('should slice items into all bands', () => {
      const items: TextItemWithPosition[] = [
        createItem('Header', 20, 15), // y=20, center=27.5, normalized=0.034 (header 0-0.12, heading 0-0.30)
        createItem('Heading', 100, 15), // y=100, center=107.5, normalized=0.134 (heading 0-0.30, body 0.12-0.88)
        createItem('Body', 400, 15), // y=400, center=407.5, normalized=0.509 (body 0.12-0.88)
        createItem('Footer', 750, 15), // y=750, center=757.5, normalized=0.947 (footer 0.88-1.0)
      ];
      
      const bands = getAllBands(items, pageHeight);
      
      expect(bands.header.length).toBe(1);
      expect(bands.header[0].str).toBe('Header');
      expect(bands.heading.length).toBe(2); // Header + Heading (both in heading band)
      expect(bands.body.length).toBe(2); // Heading + Body (both in body band, heading overlaps)
      expect(bands.body.map(i => i.str)).toContain('Heading');
      expect(bands.body.map(i => i.str)).toContain('Body');
      expect(bands.footer.length).toBe(1);
      expect(bands.footer[0].str).toBe('Footer');
    });
  });
});

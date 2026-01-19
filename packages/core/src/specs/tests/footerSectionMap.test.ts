/**
 * Unit tests for footer section code extraction
 */

import { describe, it, expect } from '@jest/globals';
import {
  normalizeFooterText,
  parseSectionCodes,
  buildFooterSectionIndex,
  extractFooterTextItems,
} from '../footerSectionMap.js';
import type { DetectedPageRegions, TextPage } from '../../text/pageRegions.js';

describe('Footer Section Code Extraction', () => {
  describe('normalizeFooterText', () => {
    it('should collapse whitespace', () => {
      expect(normalizeFooterText('23  05  53')).toBe('23 05 53');
      expect(normalizeFooterText('23\t05\n53')).toBe('23 05 53');
    });

    it('should normalize dashes', () => {
      expect(normalizeFooterText('23 05 53 – Title')).toBe('23 05 53 - Title');
      expect(normalizeFooterText('23 05 53—Title')).toBe('23 05 53 - Title');
      expect(normalizeFooterText('23 05 53−Title')).toBe('23 05 53 - Title');
    });

    it('should trim text', () => {
      expect(normalizeFooterText('  23 05 53  ')).toBe('23 05 53');
    });
  });

  describe('parseSectionCodes', () => {
    it('should parse simple section codes', () => {
      expect(parseSectionCodes('23 05 53')).toEqual(['23 05 53']);
      expect(parseSectionCodes('23 02 00')).toEqual(['23 02 00']);
    });

    it('should parse codes with dashes', () => {
      expect(parseSectionCodes('23 05 53 - Title')).toEqual(['23 05 53']);
      expect(parseSectionCodes('23 05 53-Title')).toEqual(['23 05 53']);
      expect(parseSectionCodes('23 05 53 – Title')).toEqual(['23 05 53']);
    });

    it('should handle weird spacing', () => {
      expect(parseSectionCodes('23  05  53')).toEqual(['23 05 53']);
      expect(parseSectionCodes('23\t05\n53')).toEqual(['23 05 53']);
    });

    it('should return canonical form (single spaces)', () => {
      expect(parseSectionCodes('23  05  53')).toEqual(['23 05 53']);
    });

    it('should find multiple codes', () => {
      expect(parseSectionCodes('23 05 53 and 23 07 00')).toEqual(['23 05 53', '23 07 00']);
    });

    it('should return unique codes', () => {
      expect(parseSectionCodes('23 05 53 23 05 53')).toEqual(['23 05 53']);
    });

    it('should not match non-section patterns', () => {
      expect(parseSectionCodes('Page 23 of 53')).toEqual([]);
      expect(parseSectionCodes('2024-01-18')).toEqual([]);
    });
  });

  describe('extractFooterTextItems', () => {
    it('should extract items in footer band', () => {
      const page: TextPage = {
        pageIndex: 0,
        pageWidth: 600,
        pageHeight: 800,
        items: [
          { str: 'Header', x: 50, y: 20, width: 100, height: 15 },
          { str: 'Body', x: 50, y: 400, width: 100, height: 15 },
          { str: 'Page 1', x: 50, y: 750, width: 100, height: 15 },
          { str: '23 05 53', x: 200, y: 770, width: 100, height: 15 },
        ],
      };

      const regions: DetectedPageRegions = {
        header: { name: 'header', yMin: 0, yMax: 0.12 },
        heading: { name: 'heading', yMin: 0, yMax: 0.30 },
        body: { name: 'body', yMin: 0.12, yMax: 0.88 },
        footer: { name: 'footer', yMin: 0.88, yMax: 1.0 },
      };

      const footerItems = extractFooterTextItems(page, regions);

      expect(footerItems.length).toBe(2);
      expect(footerItems[0].str).toBe('Page 1');
      expect(footerItems[1].str).toBe('23 05 53');
    });
  });

  describe('buildFooterSectionIndex', () => {
    it('should map section codes to first page', () => {
      const pages: TextPage[] = [
        {
          pageIndex: 0,
          pageWidth: 600,
          pageHeight: 800,
          items: [
            { str: '23 05 53', x: 200, y: 770, width: 100, height: 15 },
          ],
        },
        {
          pageIndex: 1,
          pageWidth: 600,
          pageHeight: 800,
          items: [
            { str: '23 05 53', x: 200, y: 770, width: 100, height: 15 },
            { str: '23 07 00', x: 300, y: 770, width: 100, height: 15 },
          ],
        },
        {
          pageIndex: 2,
          pageWidth: 600,
          pageHeight: 800,
          items: [
            { str: '23 07 00', x: 200, y: 770, width: 100, height: 15 },
          ],
        },
      ];

      const regions: DetectedPageRegions = {
        header: { name: 'header', yMin: 0, yMax: 0.12 },
        heading: { name: 'heading', yMin: 0, yMax: 0.30 },
        body: { name: 'body', yMin: 0.12, yMax: 0.88 },
        footer: { name: 'footer', yMin: 0.88, yMax: 1.0 },
      };

      const index = buildFooterSectionIndex(pages, regions);

      expect(index.firstPageBySection['23 05 53']).toBe(0);
      expect(index.firstPageBySection['23 07 00']).toBe(1);
      expect(index.occurrences['23 05 53']).toEqual([0, 1]);
      expect(index.occurrences['23 07 00']).toEqual([1, 2]);
    });

    it('should handle pages with no section codes', () => {
      const pages: TextPage[] = [
        {
          pageIndex: 0,
          pageWidth: 600,
          pageHeight: 800,
          items: [
            { str: 'Page 1', x: 200, y: 770, width: 100, height: 15 },
          ],
        },
      ];

      const regions: DetectedPageRegions = {
        header: { name: 'header', yMin: 0, yMax: 0.12 },
        heading: { name: 'heading', yMin: 0, yMax: 0.30 },
        body: { name: 'body', yMin: 0.12, yMax: 0.88 },
        footer: { name: 'footer', yMin: 0.88, yMax: 1.0 },
      };

      const index = buildFooterSectionIndex(pages, regions);

      expect(Object.keys(index.firstPageBySection).length).toBe(0);
      expect(Object.keys(index.occurrences).length).toBe(0);
    });
  });
});

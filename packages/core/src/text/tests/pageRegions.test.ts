/**
 * Unit tests for page region detection
 */

import { describe, it, expect } from '@jest/globals';
import { detectPageRegions, type TextPage } from '../pageRegions.js';

describe('Page Region Detection', () => {
  /**
   * Create a synthetic text page with items at specific y positions
   */
  function createSyntheticPage(
    pageIndex: number,
    pageWidth: number,
    pageHeight: number,
    items: Array<{ text: string; y: number; height: number }>
  ): TextPage {
    return {
      pageIndex,
      pageWidth,
      pageHeight,
      items: items.map((item, i) => ({
        str: item.text,
        x: 50 + (i * 100), // Spread horizontally
        y: item.y,
        width: item.text.length * 10,
        height: item.height,
      })),
    };
  }

  it('should detect default regions for empty page list', () => {
    const regions = detectPageRegions([]);
    
    expect(regions.header.yMin).toBe(0);
    expect(regions.header.yMax).toBe(0.12);
    expect(regions.footer.yMin).toBe(0.88);
    expect(regions.footer.yMax).toBe(1.0);
    expect(regions.heading.yMin).toBe(0);
    expect(regions.heading.yMax).toBe(0.30);
    expect(regions.body.yMin).toBe(0.12);
    expect(regions.body.yMax).toBe(0.88);
  });

  it('should detect header and footer bands from text density', () => {
    const pageHeight = 800;
    const pages: TextPage[] = [
      createSyntheticPage(0, 600, pageHeight, [
        // Header items (top 0-10%)
        { text: 'Project Name', y: 20, height: 15 },
        { text: 'Date: 01/01/2024', y: 40, height: 15 },
        // Body items (middle)
        { text: 'Section content here', y: 200, height: 15 },
        { text: 'More body text', y: 400, height: 15 },
        // Footer items (bottom 10%)
        { text: 'Page 1', y: 750, height: 15 },
        { text: '23 05 53', y: 770, height: 15 },
      ]),
      createSyntheticPage(1, 600, pageHeight, [
        { text: 'Project Name', y: 20, height: 15 },
        { text: 'Date: 01/02/2024', y: 40, height: 15 },
        { text: 'Section content', y: 200, height: 15 },
        { text: 'Page 2', y: 750, height: 15 },
        { text: '23 05 53', y: 770, height: 15 },
      ]),
    ];

    const regions = detectPageRegions(pages);

    // Header should be detected in top region
    expect(regions.header.yMin).toBeLessThan(0.15);
    expect(regions.header.yMax).toBeLessThan(0.15);
    
    // Footer should be detected in bottom region
    expect(regions.footer.yMin).toBeGreaterThan(0.85);
    expect(regions.footer.yMax).toBeGreaterThan(0.90);
    
    // Body should be in middle
    expect(regions.body.yMin).toBeGreaterThan(regions.header.yMax);
    expect(regions.body.yMax).toBeLessThan(regions.footer.yMin);
    
    // Debug info should be present
    expect(regions.debug).toBeDefined();
    expect(regions.debug?.samplePages).toBe(2);
  });

  it('should handle pages with no clear header/footer', () => {
    const pageHeight = 800;
    const pages: TextPage[] = [
      createSyntheticPage(0, 600, pageHeight, [
        // Only body text
        { text: 'Content line 1', y: 200, height: 15 },
        { text: 'Content line 2', y: 400, height: 15 },
        { text: 'Content line 3', y: 600, height: 15 },
      ]),
    ];

    const regions = detectPageRegions(pages);

    // Should still return valid regions (fallback to defaults)
    expect(regions.header.yMin).toBeGreaterThanOrEqual(0);
    expect(regions.header.yMax).toBeLessThanOrEqual(1);
    expect(regions.footer.yMin).toBeGreaterThanOrEqual(0);
    expect(regions.footer.yMax).toBeLessThanOrEqual(1);
    expect(regions.body.yMin).toBeLessThan(regions.body.yMax);
  });

  it('should prevent header/footer overlap', () => {
    const pageHeight = 800;
    const pages: TextPage[] = [
      createSyntheticPage(0, 600, pageHeight, [
        // Dense header
        { text: 'Header 1', y: 10, height: 15 },
        { text: 'Header 2', y: 30, height: 15 },
        { text: 'Header 3', y: 50, height: 15 },
        // Dense footer starting too high
        { text: 'Footer 1', y: 100, height: 15 },
        { text: 'Footer 2', y: 120, height: 15 },
        { text: 'Page 1', y: 750, height: 15 },
      ]),
    ];

    const regions = detectPageRegions(pages);

    // Header and footer should not overlap
    expect(regions.header.yMax).toBeLessThanOrEqual(regions.footer.yMin);
    expect(regions.body.yMin).toBeGreaterThanOrEqual(regions.header.yMax);
    expect(regions.body.yMax).toBeLessThanOrEqual(regions.footer.yMin);
  });
});

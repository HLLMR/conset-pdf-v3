/**
 * PDF renderer for specs PDFs
 * 
 * Renders HTML to PDF using Playwright.
 */

import { chromium } from 'playwright';

/**
 * Render HTML to PDF using Playwright
 */
export async function renderHtmlToPdf(html: string, outputPath: string): Promise<void> {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });
  
  try {
    const page = await browser.newPage({
      viewport: { width: 612, height: 792 }, // Letter size in points
      deviceScaleFactor: 1,
    });
    
    // Load HTML content (wait for DOM ready, not network idle - we're offline)
    await page.setContent(html, { waitUntil: 'load' });
    
    // Explicitly wait for fonts to be ready (for embedded/base64 fonts)
    // Evaluate in browser context where document is available
    await page.evaluate(`
      (async () => {
        if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
        }
      })()
    `);
    
    // Generate PDF
    await page.pdf({
      path: outputPath,
      format: 'Letter',
      margin: { top: '1in', right: '1in', bottom: '1in', left: '1in' },
      printBackground: true,
    });
    
    await page.close();
  } finally {
    await browser.close();
  }
}

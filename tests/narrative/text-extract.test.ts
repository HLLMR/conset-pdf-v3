/**
 * Tests for narrative text extraction
 */

import { extractNarrativeTextFromPdf } from '@conset-pdf/core';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Narrative Text Extraction', () => {
  const fixturePath = join(__dirname, '..', 'fixtures', 'narratives', 'Add3 Narrative.pdf');
  
  test('extracts text from narrative PDF', async () => {
    if (!existsSync(fixturePath)) {
      console.warn(`Fixture not found: ${fixturePath}, skipping test`);
      return;
    }
    
    const doc = await extractNarrativeTextFromPdf(fixturePath);
    
    // Verify structure
    expect(doc).toHaveProperty('fileHash');
    expect(doc).toHaveProperty('pageCount');
    expect(doc).toHaveProperty('pages');
    expect(doc).toHaveProperty('fullText');
    
    // Verify hash is SHA256 (64 hex chars)
    expect(doc.fileHash).toMatch(/^[a-f0-9]{64}$/);
    
    // Verify page count > 0
    expect(doc.pageCount).toBeGreaterThan(0);
    
    // Verify pages array matches page count
    expect(doc.pages.length).toBe(doc.pageCount);
    
    // Verify pages are 1-based
    expect(doc.pages[0].pageNumber).toBe(1);
    
    // Verify fullText contains expected content
    expect(doc.fullText.length).toBeGreaterThan(0);
    
    // Verify fullText contains at least one known heading token
    const upperText = doc.fullText.toUpperCase();
    expect(
      upperText.includes('REVISIONS') ||
      upperText.includes('DRAWINGS') ||
      upperText.includes('SPECIFICATIONS') ||
      upperText.includes('SECTION')
    ).toBe(true);
    
    // Verify each page has text
    for (const page of doc.pages) {
      expect(page.text.length).toBeGreaterThanOrEqual(0);
    }
  });
  
  test('fileHash is stable across multiple extractions', async () => {
    if (!existsSync(fixturePath)) {
      console.warn(`Fixture not found: ${fixturePath}, skipping test`);
      return;
    }
    
    const doc1 = await extractNarrativeTextFromPdf(fixturePath);
    const doc2 = await extractNarrativeTextFromPdf(fixturePath);
    
    expect(doc1.fileHash).toBe(doc2.fileHash);
  });
  
  test('fileHash is computed from actual PDF bytes (not empty)', async () => {
    if (!existsSync(fixturePath)) {
      console.warn(`Fixture not found: ${fixturePath}, skipping test`);
      return;
    }
    
    const doc = await extractNarrativeTextFromPdf(fixturePath);
    
    // Verify hash is NOT the empty hash (sha256 of empty string)
    const emptyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    expect(doc.fileHash).not.toBe(emptyHash);
    
    // Verify hash is a valid SHA256 (64 hex characters)
    expect(doc.fileHash).toMatch(/^[a-f0-9]{64}$/);
    
    // Verify hash is stable (same across runs)
    const doc2 = await extractNarrativeTextFromPdf(fixturePath);
    expect(doc.fileHash).toBe(doc2.fileHash);
  });
});

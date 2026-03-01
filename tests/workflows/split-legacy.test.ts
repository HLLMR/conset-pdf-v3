import { describe, test, expect } from '@jest/globals';
import { splitSet } from '@conset-pdf/core';
import { PDFDocument } from 'pdf-lib';
import { existsSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

async function createPdfWithPages(contents: string[]): Promise<string> {
  const pdfDoc = await PDFDocument.create();

  for (const content of contents) {
    const page = pdfDoc.addPage([612, 792]);
    page.drawText(content, {
      x: 50,
      y: 700,
      size: 12,
    });
  }

  const pdfBytes = await pdfDoc.save();
  const tempPath = join(tmpdir(), `split-legacy-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`);
  writeFileSync(tempPath, pdfBytes);
  return tempPath;
}

describe('splitSet legacy specs support', () => {
  test('groups legacy 5-digit section IDs in section mode', async () => {
    const inputPdfPath = await createPdfWithPages([
      'SECTION 23050 Building Controls Legacy Content',
      'SECTION 23050 Continuation Page',
      'SECTION 23 09 00 Modern Controls Section',
    ]);

    const outputDir = mkdtempSync(join(tmpdir(), 'split-legacy-output-'));

    try {
      const entries = await splitSet({
        inputPdfPath,
        outputDir,
        type: 'specs',
        groupBy: 'section',
      });

      const legacyEntry = entries.find((entry) => entry.key === '23050');
      expect(legacyEntry).toBeDefined();
      expect(legacyEntry?.startPage).toBe(1);
      expect(legacyEntry?.endPage).toBe(2);
      expect(legacyEntry?.fileName).toBe('23050.pdf');
      expect(existsSync(join(outputDir, '23050.pdf'))).toBe(true);

      const modernEntry = entries.find((entry) => entry.key === '23 09 00');
      expect(modernEntry).toBeDefined();
      expect(modernEntry?.startPage).toBe(3);
      expect(modernEntry?.endPage).toBe(3);
      expect(existsSync(join(outputDir, '23 09 00.pdf'))).toBe(true);
    } finally {
      if (existsSync(inputPdfPath)) {
        unlinkSync(inputPdfPath);
      }
      if (existsSync(outputDir)) {
        rmSync(outputDir, { recursive: true, force: true });
      }
    }
  });

  test('maps legacy 5-digit section IDs to modern division in division mode', async () => {
    const inputPdfPath = await createPdfWithPages([
      'SECTION 23050 Legacy Controls',
      'SECTION 26010 Legacy Electrical',
    ]);

    const outputDir = mkdtempSync(join(tmpdir(), 'split-legacy-division-output-'));

    try {
      const entries = await splitSet({
        inputPdfPath,
        outputDir,
        type: 'specs',
        groupBy: 'division',
      });

      const keys = entries.map((entry) => entry.key);
      expect(keys).toContain('23');
      expect(keys).toContain('26');
      expect(existsSync(join(outputDir, '23.pdf'))).toBe(true);
      expect(existsSync(join(outputDir, '26.pdf'))).toBe(true);
    } finally {
      if (existsSync(inputPdfPath)) {
        unlinkSync(inputPdfPath);
      }
      if (existsSync(outputDir)) {
        rmSync(outputDir, { recursive: true, force: true });
      }
    }
  });
});

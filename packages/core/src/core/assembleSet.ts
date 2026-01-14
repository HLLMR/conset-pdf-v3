import type { AssembleSetOptions } from '../index.js';
import { loadPdf, savePdf, copyPages } from '../utils/pdf.js';
import { getPdfFiles, readJson, fileExists } from '../utils/fs.js';
import { naturalSort } from '../utils/sort.js';
import { PDFDocument } from 'pdf-lib';
import * as path from 'path';

interface OrderEntry {
  fileName: string;
  key?: string;
}

/**
 * Assemble subsets into a final ordered set
 */
export async function assembleSet(
  opts: AssembleSetOptions
): Promise<{ totalPages: number }> {
  const verbose = opts.verbose || false;

  if (verbose) {
    console.log(`Assembling ${opts.type} PDFs from: ${opts.inputDir}`);
  }

  // Determine ordering
  let order: OrderEntry[];

  if (opts.orderJsonPath && (await fileExists(opts.orderJsonPath))) {
    // Use provided order JSON
    const orderData = await readJson<{ entries: OrderEntry[] }>(opts.orderJsonPath);
    order = orderData.entries;
    if (verbose) {
      console.log(`Using order from: ${opts.orderJsonPath}`);
    }
  } else {
    // Infer order from filenames
    const pdfFiles = await getPdfFiles(opts.inputDir);
    order = await inferOrder(pdfFiles, opts.type, verbose);
  }

  // Create output PDF
  const outputDoc = await PDFDocument.create();
  let totalPages = 0;

  // Append PDFs in order
  for (const entry of order) {
    const filePath = path.join(opts.inputDir, entry.fileName);
    
    if (!(await fileExists(filePath))) {
      if (verbose) {
        console.warn(`Skipping missing file: ${entry.fileName}`);
      }
      continue;
    }

    const sourceDoc = await loadPdf(filePath);
    const pageCount = sourceDoc.getPageCount();
    const pageIndexes = Array.from({ length: pageCount }, (_, i) => i);
    
    await copyPages(sourceDoc, outputDoc, pageIndexes);
    totalPages += pageCount;

    if (verbose) {
      console.log(`Added ${entry.fileName} (${pageCount} pages)`);
    }
  }

  // Save output
  await savePdf(outputDoc, opts.outputPdfPath);

  if (verbose) {
    console.log(`Assembled PDF saved to: ${opts.outputPdfPath} (${totalPages} total pages)`);
  }

  return { totalPages };
}

async function inferOrder(
  pdfFiles: string[],
  type: string,
  _verbose: boolean
): Promise<OrderEntry[]> {
  const entries: OrderEntry[] = [];

  if (type === 'drawings') {
    // Extract prefix from filename and sort
    const prefixOrder = ['A', 'C', 'E', 'M', 'P', 'S'];
    const prefixGroups = new Map<string, string[]>();

    for (const filePath of pdfFiles) {
      const fileName = path.basename(filePath);
      const prefixMatch = fileName.match(/^([A-Z]+)\s*-/);
      const prefix = prefixMatch ? prefixMatch[1] : '_OTHER';

      if (!prefixGroups.has(prefix)) {
        prefixGroups.set(prefix, []);
      }
      prefixGroups.get(prefix)!.push(fileName);
    }

    // Sort within each prefix group
    for (const prefix of prefixOrder) {
      const files = prefixGroups.get(prefix);
      if (files) {
        const sorted = naturalSort(files);
        for (const fileName of sorted) {
          entries.push({ fileName, key: prefix });
        }
      }
    }

    // Add _OTHER at the end
    const otherFiles = prefixGroups.get('_OTHER');
    if (otherFiles) {
      for (const fileName of otherFiles) {
        entries.push({ fileName, key: '_OTHER' });
      }
    }
  } else {
    // Specs: sort by section ID from filename
    const sectionEntries: Array<{ fileName: string; key: string }> = [];

    for (const filePath of pdfFiles) {
      const fileName = path.basename(filePath);
      // Try to extract section ID from filename (e.g., "23 09 00.pdf")
      const sectionMatch = fileName.match(/^(\d{2}\s+\d{2}\s+\d{2})/);
      if (sectionMatch) {
        sectionEntries.push({
          fileName,
          key: sectionMatch[1],
        });
      } else if (fileName === '_OTHER.pdf') {
        sectionEntries.push({ fileName, key: '_OTHER' });
      }
    }

    // Sort by section ID (numeric)
    sectionEntries.sort((a, b) => {
      if (a.key === '_OTHER') return 1;
      if (b.key === '_OTHER') return -1;
      return naturalSort([a.key, b.key])[0] === a.key ? -1 : 1;
    });

    entries.push(...sectionEntries);
  }

  return entries;
}

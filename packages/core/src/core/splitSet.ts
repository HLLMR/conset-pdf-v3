import type { SplitSetOptions, SplitEntry } from '../index.js';
import { loadPdf, savePdf, copyPages } from '../utils/pdf.js';
import { getBestDrawingsSheetId } from '../parser/drawingsSheetId.js';
import { getBestSpecsSectionId } from '../parser/specsSectionId.js';
import { ensureDir, writeJson } from '../utils/fs.js';
import { naturalSort } from '../utils/sort.js';
import { PDFDocument } from 'pdf-lib';
import * as path from 'path';
import { DocumentContext } from '../analyze/documentContext.js';

/**
 * Split a PDF set into subsets
 */
export async function splitSet(
  opts: SplitSetOptions
): Promise<SplitEntry[]> {
  const type = opts.type;
  const groupBy = opts.groupBy || (type === 'drawings' ? 'prefix' : 'section');
  const verbose = opts.verbose || false;

  if (verbose) {
    console.log(`Splitting ${type} PDF: ${opts.inputPdfPath}`);
    console.log(`Grouping by: ${groupBy}`);
  }

  await ensureDir(opts.outputDir);

  if (type === 'drawings') {
    return await splitDrawings(opts, groupBy, verbose);
  } else {
    return await splitSpecs(opts, groupBy, verbose);
  }
}

async function splitDrawings(
  opts: SplitSetOptions,
  _groupBy: string,
  verbose: boolean
): Promise<SplitEntry[]> {
  // Use DocumentContext for single-load PDF caching
  const docContext = new DocumentContext(opts.inputPdfPath);
  await docContext.initialize();
  
  if (verbose) {
    const instrumentation = docContext.getInstrumentation();
    console.log(`[Instrumentation] PDF loaded once (loadId: ${instrumentation.loadId}, total loads: ${instrumentation.totalLoads})`);
  }
  
  // Extract text for all pages using cached DocumentContext
  const pageCount = docContext.pageCount;
  const allPageIndexes = Array.from({ length: pageCount }, (_, i) => i);
  await docContext.extractTextForPages(allPageIndexes);
  
  const inputDoc: PDFDocument = await loadPdf(opts.inputPdfPath);
  const customPattern = opts.pattern;

  // Parse IDs for each page
  interface PageInfo {
    pageIndex: number;
    id: string | null;
    normalizedId: string | null;
    prefix: string | null;
  }

  const pageInfos: PageInfo[] = [];

  for (let i = 0; i < pageCount; i++) {
    // Get text from cached PageContext
    const pageContext = await docContext.getPageContext(i);
    const pageText = pageContext.getText();
    
    const parsed = getBestDrawingsSheetId(pageText, i, customPattern);
    let prefix: string | null = null;
    let normalizedId: string | null = null;

    if (parsed && parsed.confidence >= 0.5) {
      normalizedId = parsed.normalized;
      // Extract prefix (first letter(s) before numbers)
      const match = normalizedId.match(/^([A-Z]+)/);
      prefix = match ? match[1] : null;
    }

    pageInfos.push({
      pageIndex: i,
      id: parsed?.id || null,
      normalizedId,
      prefix,
    });
  }

  // Group by prefix
  const prefixGroups = new Map<string, PageInfo[]>();
  const allowedPrefixes = opts.prefixes
    ? new Set(opts.prefixes.map((p) => p.toUpperCase()))
    : null;

  for (const pageInfo of pageInfos) {
    const prefix = pageInfo.prefix || '_OTHER';
    const upperPrefix = prefix.toUpperCase();

    if (allowedPrefixes && !allowedPrefixes.has(upperPrefix)) {
      // Put in _OTHER group
      if (!prefixGroups.has('_OTHER')) {
        prefixGroups.set('_OTHER', []);
      }
      prefixGroups.get('_OTHER')!.push(pageInfo);
    } else {
      if (!prefixGroups.has(upperPrefix)) {
        prefixGroups.set(upperPrefix, []);
      }
      prefixGroups.get(upperPrefix)!.push(pageInfo);
    }
  }

  // Create output PDFs
  const entries: SplitEntry[] = [];
  const prefixNames: { [key: string]: string } = {
    M: 'Mechanical',
    E: 'Electrical',
    P: 'Plumbing',
    A: 'Architectural',
    C: 'Civil',
    S: 'Structural',
  };

  for (const [prefix, pages] of prefixGroups.entries()) {
    if (pages.length === 0) continue;

    // Sort pages by ID
    pages.sort((a, b) => {
      if (!a.normalizedId && !b.normalizedId) return 0;
      if (!a.normalizedId) return 1;
      if (!b.normalizedId) return -1;
      return naturalSort([a.normalizedId, b.normalizedId])[0] === a.normalizedId
        ? -1
        : 1;
    });

    const title = prefixNames[prefix] || prefix;
    const fileName = `${prefix} - ${title}.pdf`;
    const outputPath = path.join(opts.outputDir, fileName);

    // Create PDF for this prefix
    const outputDoc = await PDFDocument.create();
    const pageIndexes = pages.map((p) => p.pageIndex);
    await copyPages(inputDoc, outputDoc, pageIndexes);
    await savePdf(outputDoc, outputPath);

    entries.push({
      key: prefix,
      title,
      startPage: pages[0].pageIndex + 1, // 1-based
      endPage: pages[pages.length - 1].pageIndex + 1, // 1-based
      fileName,
    });

    if (verbose) {
      console.log(`Created ${fileName} with ${pages.length} pages`);
    }
  }

  // Write TOC JSON if requested
  if (opts.tocJsonPath) {
    const toc = {
      type: 'drawings',
      entries: entries.map((e) => ({
        key: e.key,
        title: e.title,
        fileName: e.fileName,
        pageRange: {
          start: e.startPage,
          end: e.endPage,
        },
        sheetIds: prefixGroups
          .get(e.key)!
          .filter((p) => p.normalizedId)
          .map((p) => p.normalizedId),
      })),
    };
    await writeJson(opts.tocJsonPath, toc);
  }

  return entries;
}

async function splitSpecs(
  opts: SplitSetOptions,
  groupBy: string,
  verbose: boolean
): Promise<SplitEntry[]> {
  // Use DocumentContext for single-load PDF caching
  const docContext = new DocumentContext(opts.inputPdfPath);
  await docContext.initialize();
  
  if (verbose) {
    const instrumentation = docContext.getInstrumentation();
    console.log(`[Instrumentation] PDF loaded once (loadId: ${instrumentation.loadId}, total loads: ${instrumentation.totalLoads})`);
  }
  
  // Extract text for all pages using cached DocumentContext
  const pageCount = docContext.pageCount;
  const allPageIndexes = Array.from({ length: pageCount }, (_, i) => i);
  await docContext.extractTextForPages(allPageIndexes);
  
  const inputDoc: PDFDocument = await loadPdf(opts.inputPdfPath);
  const customPattern = opts.pattern;

  // Parse section IDs
  interface SectionInfo {
    pageIndex: number;
    sectionId: string | null;
    normalizedId: string | null;
    division: string | null;
    title?: string;
  }

  const sectionInfos: SectionInfo[] = [];

  for (let i = 0; i < pageCount; i++) {
    // Get text from cached PageContext
    const pageContext = await docContext.getPageContext(i);
    const pageText = pageContext.getText();
    
    const parsed = getBestSpecsSectionId(pageText, i, customPattern);
    let normalizedId: string | null = null;
    let division: string | null = null;

    if (parsed && parsed.confidence >= 0.5) {
      normalizedId = parsed.normalized;
      // Extract division (first 2 digits)
      division = normalizedId.substring(0, 2);
    }

    // Try to extract title (text after section ID)
    let title: string | undefined;
    if (parsed) {
      const idIndex = pageText.indexOf(parsed.id);
      if (idIndex !== -1) {
        const afterId = pageText.substring(idIndex + parsed.id.length, idIndex + parsed.id.length + 50);
        const titleMatch = afterId.match(/^\s*[-–—]\s*(.+?)(?:\n|$)/);
        if (titleMatch) {
          title = titleMatch[1].trim();
        }
      }
    }

    sectionInfos.push({
      pageIndex: i,
      sectionId: parsed?.id || null,
      normalizedId,
      division,
      title,
    });
  }

  // Group pages by section or division
  const groups = new Map<string, SectionInfo[]>();
  let currentGroup: string | null = null;
  let currentGroupKey: string | null = null;

  for (const info of sectionInfos) {
    let groupKey: string;

    if (groupBy === 'division') {
      groupKey = info.division || '_OTHER';
    } else {
      // groupBy === 'section'
      groupKey = info.normalizedId || '_OTHER';
    }

    // Start new group if key changed
    if (groupKey !== currentGroupKey) {
      currentGroupKey = groupKey;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      currentGroup = groupKey;
    }

    // Add page to current group
    if (currentGroup) {
      groups.get(currentGroup)!.push(info);
    }
  }

  // Create output PDFs
  const entries: SplitEntry[] = [];

  for (const [groupKey, pages] of groups.entries()) {
    if (pages.length === 0) continue;

    const firstPage = pages[0];
    const title = firstPage.title || (groupBy === 'division' ? `Division ${groupKey}` : `Section ${groupKey}`);
    const fileName = groupKey === '_OTHER' ? '_OTHER.pdf' : `${groupKey}.pdf`;
    const outputPath = path.join(opts.outputDir, fileName);

    // Create PDF for this group
    const outputDoc = await PDFDocument.create();
    const pageIndexes = pages.map((p) => p.pageIndex);
    await copyPages(inputDoc, outputDoc, pageIndexes);
    await savePdf(outputDoc, outputPath);

    entries.push({
      key: groupKey,
      title,
      startPage: pages[0].pageIndex + 1, // 1-based
      endPage: pages[pages.length - 1].pageIndex + 1, // 1-based
      fileName,
    });

    if (verbose) {
      console.log(`Created ${fileName} with ${pages.length} pages`);
    }
  }

  // Write TOC JSON if requested
  if (opts.tocJsonPath) {
    const toc = {
      type: 'specs',
      groupBy,
      entries: entries.map((e) => ({
        key: e.key,
        title: e.title,
        fileName: e.fileName,
        pageRange: {
          start: e.startPage,
          end: e.endPage,
        },
      })),
    };
    await writeJson(opts.tocJsonPath, toc);
  }

  return entries;
}

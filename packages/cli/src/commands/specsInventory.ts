import { Command } from 'commander';
import {
  fileExists,
  DocumentContext,
  detectPageRegions,
  sectionizePages,
  type TextItemWithPosition,
} from '@conset-pdf/core';
import { writeFile } from 'fs/promises';

/**
 * Extract text page data from DocumentContext
 */
async function extractTextPage(
  docContext: DocumentContext,
  pageIndex: number
): Promise<{
  pageIndex: number;
  items: TextItemWithPosition[];
  pageHeight: number;
}> {
  const pageContext = await docContext.getPageContext(pageIndex);
  await docContext.extractTextForPage(pageIndex);
  
  const info = pageContext.getInfo();
  const items = pageContext.getTextItems();
  
  return {
    pageIndex,
    items,
    pageHeight: info.height,
  };
}

export function specsInventoryCommand(program: Command) {
  program
    .command('specs-inventory')
    .description('Generate deterministic spec inventory using footer-first sectionization')
    .requiredOption('--input <path>', 'Path to input PDF')
    .option('--output <path>', 'Path to write JSON output (default: stdout)')
    .option('--verbose', 'Verbose output', false)
    .option('--sample-count <count>', 'Number of pages to sample for region detection', '30')
    .action(async (options) => {
      try {
        // Validate input file exists
        if (!(await fileExists(options.input))) {
          console.error(`Error: Input PDF not found: ${options.input}`);
          process.exit(4);
        }

        const verbose = options.verbose;
        const sampleCount = parseInt(options.sampleCount, 10);
        
        if (verbose) {
          console.log(`Loading PDF: ${options.input}`);
        }

        // Initialize document context
        const docContext = new DocumentContext(options.input);
        await docContext.initialize();
        
        const pageCount = docContext.pageCount;
        if (verbose) {
          console.log(`PDF has ${pageCount} pages`);
        }

        // PASS 1: Sample pages for region detection
        const samplePages: Array<{
          pageIndex: number;
          items: TextItemWithPosition[];
          pageHeight: number;
          pageWidth: number;
        }> = [];
        
        const sampleIndices = new Set<number>();
        
        // Sample first N pages
        for (let i = 0; i < Math.min(sampleCount, pageCount); i++) {
          sampleIndices.add(i);
        }
        
        // Sample evenly spaced pages from remaining
        if (pageCount > sampleCount) {
          const remaining = pageCount - sampleCount;
          const step = Math.max(1, Math.floor(remaining / sampleCount));
          for (let i = sampleCount; i < pageCount; i += step) {
            sampleIndices.add(i);
          }
        }
        
        const sortedSamples = Array.from(sampleIndices).sort((a, b) => a - b);
        
        if (verbose) {
          console.log(`Sampling ${sortedSamples.length} pages for region detection...`);
        }
        
        for (const pageIndex of sortedSamples) {
          const pageData = await extractTextPage(docContext, pageIndex);
          const info = (await docContext.getPageContext(pageIndex)).getInfo();
          samplePages.push({
            ...pageData,
            pageWidth: info.width,
          });
        }
        
        // Detect regions from samples
        const regions = detectPageRegions(samplePages);
        
        if (verbose) {
          console.log(`Detected regions:`);
          console.log(`  Header: ${regions.header.yMin.toFixed(2)}-${regions.header.yMax.toFixed(2)}`);
          console.log(`  Footer: ${regions.footer.yMin.toFixed(2)}-${regions.footer.yMax.toFixed(2)}`);
        }

        // PASS 2: Extract all pages and sectionize
        if (verbose) {
          console.log(`Extracting all pages and sectionizing...`);
        }
        
        const allPages: Array<{
          pageIndex: number;
          items: TextItemWithPosition[];
          pageHeight: number;
        }> = [];
        
        for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
          const pageData = await extractTextPage(docContext, pageIndex);
          allPages.push(pageData);
          
          if (verbose && (pageIndex + 1) % 50 === 0) {
            console.log(`  Processed ${pageIndex + 1}/${pageCount} pages...`);
          }
        }
        
        // Sectionize
        const result = sectionizePages(allPages, {
          regions,
          enableRepair: true,
          verbose,
        });
        
        // Build output
        const output = {
          inputPdf: options.input,
          pageCount,
          regions: {
            header: { yMin: regions.header.yMin, yMax: regions.header.yMax },
            footer: { yMin: regions.footer.yMin, yMax: regions.footer.yMax },
          },
          sectionRuns: result.runs.map(run => ({
            sectionId: run.sectionId,
            startPageIndex: run.startPageIndex,
            endPageIndex: run.endPageIndex,
            pageCount: run.endPageIndex - run.startPageIndex + 1,
            needsCorrection: run.needsCorrection,
            pages: run.pages.map(p => ({
              pageIndex: p.pageIndex,
              pageInSection: p.pageInSection,
              confidence: p.confidence,
              needsCorrection: p.needsCorrection,
            })),
          })),
          auditRecords: result.auditRecords,
          pageAssignments: Array.from(result.pageAssignments.entries()).map(([pageIndex, assignment]) => ({
            pageIndex,
            sectionId: assignment.sectionId,
            pageInSection: assignment.pageInSection,
          })),
          summary: {
            totalRuns: result.runs.length,
            totalPages: pageCount,
            pagesWithSectionId: result.pageAssignments.size,
            pagesNeedingCorrection: result.runs.filter(r => r.needsCorrection).reduce((sum, r) => sum + r.pages.filter(p => p.needsCorrection).length, 0),
            auditRecordCount: result.auditRecords.length,
          },
        };
        
        // Output JSON
        const jsonOutput = JSON.stringify(output, null, 2);
        
        if (options.output) {
          await writeFile(options.output, jsonOutput, 'utf-8');
          if (verbose) {
            console.log(`\nInventory JSON written to: ${options.output}`);
          }
        } else {
          console.log(jsonOutput);
        }
        
        // Print summary
        if (verbose) {
          console.log(`\nSummary:`);
          console.log(`  Section runs: ${output.summary.totalRuns}`);
          console.log(`  Total pages: ${output.summary.totalPages}`);
          console.log(`  Pages with section ID: ${output.summary.pagesWithSectionId}`);
          console.log(`  Pages needing correction: ${output.summary.pagesNeedingCorrection}`);
          console.log(`  Audit records: ${output.summary.auditRecordCount}`);
        }
        
        process.exit(0);
      } catch (error) {
        const err = error as Error;
        console.error(`Error: ${err.message}`);
        if (err.stack && options.verbose) {
          console.error(err.stack);
        }
        process.exit(2);
      }
    });
}

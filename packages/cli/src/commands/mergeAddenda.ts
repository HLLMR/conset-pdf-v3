import { Command } from 'commander';
import {
  mergeAddenda,
  fileExists,
  loadLayoutProfile,
  createInlineLayout,
  RoiSheetLocator,
  LegacyTitleblockLocator,
  CompositeLocator,
  SpecsSectionLocator,
  type SheetLocator,
  type MergeReport,
} from '@conset-pdf/core';

export function mergeAddendaCommand(program: Command) {
  program
    .command('merge-addenda')
    .description('Merge an original PDF with one or more addenda PDFs')
    .requiredOption('--original <path>', 'Path to original PDF')
    .requiredOption('--addenda <paths...>', 'Paths to addendum PDFs (chronological order)')
    .requiredOption('--output <path>', 'Path to output PDF')
    .requiredOption('--type <type>', 'Document type: drawings or specs', (value) => {
      if (value !== 'drawings' && value !== 'specs') {
        throw new Error('Type must be "drawings" or "specs"');
      }
      return value;
    })
    .option('--report <path>', 'Path to write JSON report')
    .option('--mode <mode>', 'Merge mode: replace+insert, replace-only, or append-only', 'replace+insert')
    .option('--strict', 'Fail on pages without IDs', false)
    .option('--dry-run', 'Plan merge without writing output PDF', false)
    .option('--verbose', 'Verbose output', false)
    .option('--bookmark', 'Regenerate bookmarks from detected sheet numbers and titles', false)
    .option('--layout <path>', 'Path to layout profile JSON')
    .option('--sheet-id-roi <roi>', 'Sheet ID ROI: "x,y,width,height" (normalized 0-1)')
    .option('--sheet-title-roi <roi>', 'Sheet title ROI: "x,y,width,height" (normalized 0-1)')
    .option('--auto-layout', 'Auto-detect layout and suggest profile', false)
    .option('--save-layout <path>', 'Save auto-detected layout to file')
    .option('--inventory-dir <path>', 'Directory for inventory JSON files (default: next to source PDFs)')
    .action(async (options) => {
      try {
        // Validate files exist
        if (!(await fileExists(options.original))) {
          console.error(`Error: Original PDF not found: ${options.original}`);
          process.exit(4);
        }

        for (const addendumPath of options.addenda) {
          if (!(await fileExists(addendumPath))) {
            console.error(`Error: Addendum PDF not found: ${addendumPath}`);
            process.exit(4);
          }
        }

        // Validate mode
        if (!['replace+insert', 'replace-only', 'append-only'].includes(options.mode)) {
          console.error(`Error: Invalid mode: ${options.mode}`);
          process.exit(2);
        }

        // Create locator based on type and options
        let locator: SheetLocator;
        
        if (options.type === 'specs') {
          // Specs type: always use SpecsSectionLocator
          locator = new SpecsSectionLocator();
        } else {
          // Drawings type: create locator based on options
          const legacyLocator = new LegacyTitleblockLocator(options.original);
          
          if (options.layout) {
            // Use layout profile with legacy fallback
            const profile = await loadLayoutProfile(options.layout);
            const roiLocator = new RoiSheetLocator(profile);
            locator = new CompositeLocator(roiLocator, legacyLocator);
          } else if (options.sheetIdRoi) {
            // Use inline ROI with legacy fallback
            const profile = createInlineLayout(options.sheetIdRoi, options.sheetTitleRoi);
            const roiLocator = new RoiSheetLocator(profile);
            locator = new CompositeLocator(roiLocator, legacyLocator);
          } else if (options.autoLayout) {
            // Auto-layout: use legacy detection for now
            // Future: propose layout profile from sample pages, then use CompositeLocator
            locator = legacyLocator;
          } else {
            // Default: use legacy only (no ROI provided)
            locator = legacyLocator;
          }
        }
        
        // Run merge
        const report = await mergeAddenda({
          originalPdfPath: options.original,
          addendumPdfPaths: options.addenda,
          outputPdfPath: options.dryRun ? undefined : options.output,
          type: options.type,
          mode: options.mode,
          strict: options.strict,
          dryRun: options.dryRun,
          verbose: options.verbose,
          reportPath: options.report,
          regenerateBookmarks: options.bookmark || false,
          inventoryOutputDir: options.inventoryDir,
          locator: locator as any, // Pass locator through
        });

        // Check for strict mode violations
        if (options.strict && report.appendedUnmatched.length > 0) {
          const unmatchedCount = report.appendedUnmatched.reduce(
            (sum: number, u: MergeReport['appendedUnmatched'][number]) => sum + u.pageIndexes.length,
            0
          );
          console.error(`Error: Strict mode violation: ${unmatchedCount} unmatched pages found`);
          process.exit(3);
        }

        process.exit(0);
      } catch (error) {
        const err = error as Error;
        console.error(`Error: ${err.message}`);
        
        // Determine exit code
        if (err.message.includes('not found') || err.message.includes('I/O')) {
          process.exit(4);
        } else if (err.message.includes('Strict mode') || err.message.includes('ambiguous')) {
          process.exit(3);
        } else {
          process.exit(2);
        }
      }
    });
}

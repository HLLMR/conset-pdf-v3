import { Command } from 'commander';
import {
  fileExists,
  loadLayoutProfile,
  createInlineLayout,
  createBookmarksWorkflowRunner,
  type BookmarksAnalyzeInput,
  type BookmarksExecuteInput,
  type LayoutProfile,
  type BookmarkStyleOptions,
} from '@conset-pdf/core';
import { writeFile } from 'fs/promises';

/**
 * Create layout profile from CLI options
 */
async function createProfileFromOptions(options: {
  layout?: string;
  sheetIdRoi?: string;
  sheetTitleRoi?: string;
}): Promise<LayoutProfile | undefined> {
  if (options.layout) {
    return await loadLayoutProfile(options.layout);
  } else if (options.sheetIdRoi) {
    return createInlineLayout(options.sheetIdRoi, options.sheetTitleRoi);
  }
  return undefined;
}

export function fixBookmarksCommand(program: Command) {
  program
    .command('fix-bookmarks')
    .description('Fix PDF bookmarks: read, validate, repair, and write bookmarks')
    .requiredOption('--input <path>', 'Input PDF path')
    .option('--output <path>', 'Output PDF path (required unless --dry-run)')
    .option('--source <type>', 'Source type for inventory-based fallback: specs, drawings, or auto', 'auto')
    .option('--bookmark-tree <path>', 'Path to BookmarkAnchorTree JSON (from Specs Pipeline)')
    .option('--profile <path>', 'Path to layout profile JSON (for drawings detection)')
    .option('--sheet-id-roi <roi>', 'Sheet ID ROI: "x,y,width,height" (normalized 0-1)')
    .option('--sheet-title-roi <roi>', 'Sheet title ROI: "x,y,width,height" (normalized 0-1)')
    .option('--bookmark-profile <id>', 'Bookmark profile: raw, specs-v1, or specs-v2-detailed (default: specs-v1 if --bookmark-tree and --rebuild, raw otherwise)')
    .option('--max-depth <number>', 'Maximum bookmark depth (overrides profile default)')
    .option('--max-title-length <number>', 'Maximum title length before truncation (overrides profile default)')
    .option('--include-subsections', 'Include subsections (only meaningful for specs-v2-detailed)', false)
    .option('--dry-run', 'Analyze only, output inventory JSON (no PDF write)', false)
    .option('--json-output <path>', 'Path for bookmark tree JSON output')
    .option('--report <path>', 'Path for audit trail JSON')
    .option('--rebuild', 'Full rebuild mode (authoritative tree wins, ignore existing)', false)
    .option('--section-start-strategy <strategy>', 'Section start resolution strategy: footer-first (default when --bookmark-tree provided), heading-only, or hint-only', 'footer-first')
    .option('--allow-invalid-destinations', 'Allow invalid section destinations (override validation gate)')
    .option('--verbose', 'Verbose output', false)
    .action(async (options) => {
      try {
        // Validate input file exists
        if (!(await fileExists(options.input))) {
          console.error(`Error: Input PDF not found: ${options.input}`);
          process.exit(4);
        }

        // Validate output path (unless dry-run)
        if (!options.dryRun && !options.output) {
          console.error('Error: --output is required unless --dry-run is specified');
          process.exit(2);
        }

        // Validate source type
        if (options.source && !['specs', 'drawings', 'auto'].includes(options.source)) {
          console.error(`Error: Invalid source type: ${options.source}`);
          process.exit(2);
        }

        // Load bookmark tree if provided
        let bookmarkTree;
        if (options.bookmarkTree) {
          if (!(await fileExists(options.bookmarkTree))) {
            console.error(`Error: Bookmark tree JSON not found: ${options.bookmarkTree}`);
            process.exit(4);
          }
          const bookmarkTreeData = await import('fs/promises').then(fs => 
            fs.readFile(options.bookmarkTree, 'utf-8')
          ).then(data => JSON.parse(data));
          bookmarkTree = bookmarkTreeData;
        }

        // Create layout profile from options
        const profile = await createProfileFromOptions({
          layout: options.profile,
          sheetIdRoi: options.sheetIdRoi,
          sheetTitleRoi: options.sheetTitleRoi,
        });

        // Determine docType from source
        const docType = options.source === 'auto' ? undefined : (options.source as 'drawings' | 'specs');

        // Create workflow runner
        const runner = createBookmarksWorkflowRunner();

        if (options.dryRun) {
          // Dry-run: analyze and output inventory JSON
          // Build style options from CLI flags
          const styleOptions: BookmarkStyleOptions = {};
          if (options.bookmarkProfile) {
            styleOptions.profile = options.bookmarkProfile as 'raw' | 'specs-v1' | 'specs-v2-detailed';
          }
          if (options.maxDepth !== undefined) {
            styleOptions.maxDepth = parseInt(options.maxDepth, 10);
          }
          if (options.maxTitleLength !== undefined) {
            styleOptions.maxTitleLength = parseInt(options.maxTitleLength, 10);
          }
          if (options.includeSubsections !== undefined) {
            styleOptions.includeSubsections = options.includeSubsections;
          }

          // Parse section start strategy
          let sectionStartStrategy: 'footer' | 'heading' | 'hint' | undefined;
          if (options.sectionStartStrategy) {
            const strategy = options.sectionStartStrategy.toLowerCase();
            if (strategy === 'footer-first' || strategy === 'footer') {
              sectionStartStrategy = 'footer';
            } else if (strategy === 'heading-only' || strategy === 'heading') {
              sectionStartStrategy = 'heading';
            } else if (strategy === 'hint-only' || strategy === 'hint') {
              sectionStartStrategy = 'hint';
            } else {
              console.error(`Error: Invalid section-start-strategy: ${options.sectionStartStrategy}. Must be: footer-first, heading-only, or hint-only`);
              process.exit(2);
            }
          }

          const analyzeInput: BookmarksAnalyzeInput = {
            inputPdfPath: options.input,
            bookmarkTree,
            docType,
            profile,
            options: {
              verbose: options.verbose,
              jsonOutputDir: options.jsonOutput ? undefined : undefined, // TODO: Extract dir from path
              style: Object.keys(styleOptions).length > 0 ? styleOptions : undefined,
              sectionStartStrategy,
            },
          };

          const inventory = await runner.analyze(analyzeInput);

          // Output inventory JSON
          const inventoryJson = JSON.stringify(inventory, null, 2);
          if (options.jsonOutput) {
            await writeFile(options.jsonOutput, inventoryJson);
            console.log(`Inventory JSON written to: ${options.jsonOutput}`);
          } else {
            console.log(inventoryJson);
          }
        } else {
          // Execute: write bookmarks to PDF
          // Build style options from CLI flags (same logic as analyze)
          const styleOptions: BookmarkStyleOptions = {};
          if (options.bookmarkProfile) {
            styleOptions.profile = options.bookmarkProfile as 'raw' | 'specs-v1' | 'specs-v2-detailed';
          }
          if (options.maxDepth !== undefined) {
            styleOptions.maxDepth = parseInt(options.maxDepth, 10);
          }
          if (options.maxTitleLength !== undefined) {
            styleOptions.maxTitleLength = parseInt(options.maxTitleLength, 10);
          }
          if (options.includeSubsections !== undefined) {
            styleOptions.includeSubsections = options.includeSubsections;
          }

          // Parse section start strategy (same logic as analyze)
          let sectionStartStrategy: 'footer' | 'heading' | 'hint' | undefined;
          if (options.sectionStartStrategy) {
            const strategy = options.sectionStartStrategy.toLowerCase();
            if (strategy === 'footer-first' || strategy === 'footer') {
              sectionStartStrategy = 'footer';
            } else if (strategy === 'heading-only' || strategy === 'heading') {
              sectionStartStrategy = 'heading';
            } else if (strategy === 'hint-only' || strategy === 'hint') {
              sectionStartStrategy = 'hint';
            } else {
              console.error(`Error: Invalid section-start-strategy: ${options.sectionStartStrategy}. Must be: footer-first, heading-only, or hint-only`);
              process.exit(2);
            }
          }

          const executeInput: BookmarksExecuteInput = {
            inputPdfPath: options.input,
            outputPdfPath: options.output!,
            bookmarkTree,
            docType,
            profile,
            options: {
              verbose: options.verbose,
              reportPath: options.report,
              jsonOutputPath: options.jsonOutput,
              rebuild: options.rebuild,
              style: Object.keys(styleOptions).length > 0 ? styleOptions : undefined,
              sectionStartStrategy,
              allowInvalidDestinations: options.allowInvalidDestinations,
            },
          };

          const result = await runner.execute(executeInput);

          if (result.summary.success) {
            console.log(`Successfully wrote bookmarks to: ${options.output}`);
            const summary = result.summary as any;
            console.log(`  Bookmarks written: ${summary.bookmarksWritten || 0}`);
            console.log(`  Bookmarks read back: ${summary.bookmarksRead || 0}`);
            console.log(`  Destinations validated: ${summary.destinationsValidated || 0}`);
            if (summary.destinationsInvalid && summary.destinationsInvalid > 0) {
              console.log(`  ⚠️  Invalid destinations: ${summary.destinationsInvalid}`);
            }
          } else {
            console.error('Bookmark writing completed with issues');
            if (result.warnings) {
              result.warnings.forEach((warning: string) => console.error(`  ⚠️  ${warning}`));
            }
            process.exit(1);
          }
        }
      } catch (error: any) {
        console.error(`Error: ${error.message}`);
        if (options.verbose && error.stack) {
          console.error(error.stack);
        }
        process.exit(1);
      }
    });
}

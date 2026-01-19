import { Command } from 'commander';
import {
  fileExists,
  loadLayoutProfile,
  createInlineLayout,
  createMergeWorkflowRunner,
  type MergeAnalyzeInput,
  type MergeExecuteInput,
  type LayoutProfile,
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

export function mergeAddendaCommand(program: Command) {
  program
    .command('merge-addenda')
    .description('Merge an original PDF with one or more addenda PDFs')
    .requiredOption('--original <path>', 'Path to original PDF')
    .requiredOption('--addenda <paths...>', 'Paths to addendum PDFs (chronological order)')
    .requiredOption('--output <path>', 'Path to output PDF (not used in --dry-run mode)')
    .requiredOption('--type <type>', 'Document type: drawings or specs', (value) => {
      if (value !== 'drawings' && value !== 'specs') {
        throw new Error('Type must be "drawings" or "specs"');
      }
      return value;
    })
    .option('--report <path>', 'Path to write JSON report')
    .option('--mode <mode>', 'Merge mode: replace+insert, replace-only, or append-only', 'replace+insert')
    .option('--strict', 'Fail on pages without IDs', false)
    .option('--dry-run', 'Plan merge without writing output PDF (outputs inventory JSON)', false)
    .option('--json-output <path>', 'Path to write dry-run inventory JSON (default: stdout)', undefined)
    .option('--verbose', 'Verbose output', false)
    .option('--bookmark', 'Regenerate bookmarks from detected sheet numbers and titles', false)
    .option('--layout <path>', 'Path to layout profile JSON')
    .option('--sheet-id-roi <roi>', 'Sheet ID ROI: "x,y,width,height" (normalized 0-1)')
    .option('--sheet-title-roi <roi>', 'Sheet title ROI: "x,y,width,height" (normalized 0-1)')
    .option('--auto-layout', 'Auto-detect layout and suggest profile', false)
    .option('--save-layout <path>', 'Save auto-detected layout to file')
    .option('--inventory-dir <path>', 'Directory for inventory JSON files (default: next to source PDFs)')
    .option('--narrative <path>', 'Path to narrative PDF for advisory analysis (optional)')
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

        // Create layout profile from options
        const profile = await createProfileFromOptions({
          layout: options.layout,
          sheetIdRoi: options.sheetIdRoi,
          sheetTitleRoi: options.sheetTitleRoi,
        });

        // Create workflow runner
        const runner = createMergeWorkflowRunner();

        if (options.dryRun) {
          // Dry-run: analyze and output inventory JSON
          const analyzeInput: MergeAnalyzeInput = {
            docType: options.type,
            originalPdfPath: options.original,
            addendumPdfPaths: options.addenda,
            profile,
            options: {
              mode: options.mode,
              strict: options.strict,
              verbose: options.verbose,
              inventoryOutputDir: options.inventoryDir,
            },
            narrativePdfPath: options.narrative,
          };

          const inventory = await runner.analyze(analyzeInput);

          // Output JSON
          const jsonOutput = JSON.stringify(inventory, null, 2);

          if (options.jsonOutput) {
            // Write to file
            await writeFile(options.jsonOutput, jsonOutput, 'utf-8');
            if (options.verbose) {
              console.log(`Inventory JSON written to: ${options.jsonOutput}`);
            }
          } else {
            // Write to stdout
            console.log(jsonOutput);
          }

          process.exit(0);
        } else {
          // Execute: run merge and print summary
          const executeInput: MergeExecuteInput = {
            docType: options.type,
            originalPdfPath: options.original,
            addendumPdfPaths: options.addenda,
            outputPdfPath: options.output,
            profile,
            options: {
              mode: options.mode,
              strict: options.strict,
              verbose: options.verbose,
              reportPath: options.report,
              regenerateBookmarks: options.bookmark || false,
              inventoryOutputDir: options.inventoryDir,
            },
          };

          const result = await runner.execute(executeInput);

          // Print summary
          if (options.verbose) {
            console.log('\nMerge completed successfully!');
            console.log(`Output: ${result.outputs.outputPdfPath}`);
            console.log(`Summary:`);
            console.log(`  Replaced: ${result.summary.replaced}`);
            console.log(`  Inserted: ${result.summary.inserted}`);
            console.log(`  Unmatched: ${result.summary.unmatched}`);
            console.log(`  Final pages: ${result.summary.finalPages}`);
            console.log(`  Parse time: ${result.summary.parseTimeMs}ms`);
            console.log(`  Merge time: ${result.summary.mergeTimeMs}ms`);
          } else {
            console.log(`Merged -> ${result.outputs.outputPdfPath}`);
          }

          // Print warnings if any
          if (result.warnings && result.warnings.length > 0) {
            console.log('\nWarnings:');
            result.warnings.forEach((w: string) => console.log(`  ⚠️  ${w}`));
          }

          // Check for strict mode violations (from execute result summary)
          // Note: unmatched is a number in the summary, but type is unknown for flexibility
          const unmatchedCount = (result.summary.unmatched as number) || 0;
          if (options.strict && unmatchedCount > 0) {
            console.error(`Error: Strict mode violation: ${unmatchedCount} unmatched pages found`);
            process.exit(3);
          }

          process.exit(0);
        }
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

import { Command } from 'commander';
import {
  fileExists,
  createSpecsPatchWorkflowRunner,
  type SpecsPatchAnalyzeInput,
  type SpecsPatchExecuteInput,
} from '@conset-pdf/core';
import { writeFile } from 'fs/promises';

export function specsPatchCommand(program: Command) {
  program
    .command('specs-patch')
    .description('Extract, patch, and render spec PDFs')
    .requiredOption('--input <path>', 'Path to input PDF')
    .option('--output <path>', 'Path to output PDF (required unless --dry-run)')
    .option('--patch <path>', 'Path to patch JSON file')
    .option('--dry-run', 'Analyze only (output inventory JSON)', false)
    .option('--json-output <path>', 'Path to write AST JSON output')
    .option('--report <path>', 'Path to write audit trail JSON report')
    .option('--verbose', 'Verbose output', false)
    .option('--custom-section-pattern <pattern>', 'Custom regex pattern for section ID detection')
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

        // Validate patch file if provided
        if (options.patch && !(await fileExists(options.patch))) {
          console.error(`Error: Patch file not found: ${options.patch}`);
          process.exit(4);
        }

        // Create workflow runner
        const runner = createSpecsPatchWorkflowRunner();

        if (options.dryRun) {
          // Dry-run: analyze and output inventory JSON
          const analyzeInput: SpecsPatchAnalyzeInput = {
            inputPdfPath: options.input,
            customSectionPattern: options.customSectionPattern,
            options: {
              verbose: options.verbose,
              jsonOutputDir: options.jsonOutput ? undefined : undefined, // Not used in analyze
            },
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
          // Execute: extract, patch (if provided), and render
          const executeInput: SpecsPatchExecuteInput = {
            inputPdfPath: options.input,
            outputPdfPath: options.output,
            patchPath: options.patch,
            options: {
              verbose: options.verbose,
              reportPath: options.report,
              jsonOutputPath: options.jsonOutput,
            },
          };

          const result = await runner.execute(executeInput);

          // Print summary
          if (options.verbose) {
            console.log('\nSpecs patch completed successfully!');
            console.log(`Output: ${result.outputs.outputPdfPath}`);
            console.log(`Summary:`);
            console.log(`  Sections extracted: ${result.summary.sectionsExtracted}`);
            console.log(`  Nodes extracted: ${result.summary.nodesExtracted}`);
            console.log(`  Patches applied: ${result.summary.patchesApplied}`);
            console.log(`  Pages rendered: ${result.summary.pagesRendered}`);
            console.log(`  Issues: ${result.summary.issuesCount}`);
            
            if (result.outputs.astJsonPath) {
              console.log(`  AST JSON: ${result.outputs.astJsonPath}`);
            }
            if (result.outputs.reportPath) {
              console.log(`  Report: ${result.outputs.reportPath}`);
            }
          } else {
            console.log(`Patched -> ${result.outputs.outputPdfPath}`);
          }

          // Print warnings if any
          if (result.warnings && result.warnings.length > 0) {
            console.log('\nWarnings:');
            result.warnings.forEach((w: string) => console.log(`  ⚠️  ${w}`));
          }

          // Print errors if any
          if (result.errors && result.errors.length > 0) {
            console.error('\nErrors:');
            result.errors.forEach((e: string) => console.error(`  ❌ ${e}`));
            process.exit(2);
          }

          process.exit(0);
        }
      } catch (error) {
        const err = error as Error;
        console.error(`Error: ${err.message}`);
        
        // Determine exit code
        if (err.message.includes('not found') || err.message.includes('I/O')) {
          process.exit(4);
        } else if (err.message.includes('validation') || err.message.includes('ambiguous')) {
          process.exit(2);
        } else {
          process.exit(2);
        }
      }
    });
}

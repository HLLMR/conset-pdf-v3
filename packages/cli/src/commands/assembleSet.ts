import { Command } from 'commander';
import { assembleSet, fileExists } from '@conset-pdf/core';

export function assembleSetCommand(program: Command) {
  program
    .command('assemble-set')
    .description('Reassemble subsets into a final ordered set')
    .requiredOption('--input-dir <path>', 'Path to input directory containing PDFs')
    .requiredOption('--output <path>', 'Path to output PDF')
    .requiredOption('--type <type>', 'Document type: drawings or specs', (value) => {
      if (value !== 'drawings' && value !== 'specs') {
        throw new Error('Type must be "drawings" or "specs"');
      }
      return value;
    })
    .option('--order-json <path>', 'Path to JSON file specifying assembly order')
    .option('--verbose', 'Verbose output', false)
    .action(async (options) => {
      try {
        // Validate input directory exists
        if (!(await fileExists(options.inputDir))) {
          console.error(`Error: Input directory not found: ${options.inputDir}`);
          process.exit(4);
        }

        // Run assemble
        const result = await assembleSet({
          inputDir: options.inputDir,
          outputPdfPath: options.output,
          type: options.type,
          orderJsonPath: options.orderJson,
          verbose: options.verbose,
        });

        if (options.verbose) {
          console.log(`Assembled ${result.totalPages} pages`);
        }

        process.exit(0);
      } catch (error) {
        const err = error as Error;
        console.error(`Error: ${err.message}`);
        process.exit(2);
      }
    });
}

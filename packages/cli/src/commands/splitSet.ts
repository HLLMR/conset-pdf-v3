import { Command } from 'commander';
import { splitSet, fileExists } from '@conset-pdf/core';

export function splitSetCommand(program: Command) {
  program
    .command('split-set')
    .description('Split a PDF set into subsets')
    .requiredOption('--input <path>', 'Path to input PDF')
    .requiredOption('--output-dir <path>', 'Path to output directory')
    .requiredOption('--type <type>', 'Document type: drawings or specs', (value) => {
      if (value !== 'drawings' && value !== 'specs') {
        throw new Error('Type must be "drawings" or "specs"');
      }
      return value;
    })
    .option('--group-by <method>', 'Grouping method: prefix, section, or division', (value) => {
      if (value && !['prefix', 'section', 'division'].includes(value)) {
        throw new Error('group-by must be "prefix", "section", or "division"');
      }
      return value;
    })
    .option('--prefixes <prefixes...>', 'Allowed prefixes for drawings (e.g., M E P)')
    .option('--toc-json <path>', 'Path to write table of contents JSON')
    .option('--pattern <regex>', 'Custom regex pattern for ID detection')
    .option('--verbose', 'Verbose output', false)
    .action(async (options) => {
      try {
        // Validate input file exists
        if (!(await fileExists(options.input))) {
          console.error(`Error: Input PDF not found: ${options.input}`);
          process.exit(4);
        }

        // Run split
        await splitSet({
          inputPdfPath: options.input,
          outputDir: options.outputDir,
          type: options.type,
          groupBy: options.groupBy,
          prefixes: options.prefixes,
          tocJsonPath: options.tocJson,
          pattern: options.pattern,
          verbose: options.verbose,
        });

        process.exit(0);
      } catch (error) {
        const err = error as Error;
        console.error(`Error: ${err.message}`);
        process.exit(2);
      }
    });
}

import { Command } from 'commander';
import {
  fileExists,
  writeJson,
  DocumentContext,
  loadLayoutProfile,
  createInlineLayout,
  RoiSheetLocator,
  LegacyTitleblockLocator,
  type SheetLocator,
} from '@conset-pdf/core';

export function detectCommand(program: Command) {
  program
    .command('detect')
    .description('Preview sheet ID/title extraction using layout profile')
    .requiredOption('--input <path>', 'Path to input PDF')
    .option('--layout <path>', 'Path to layout profile JSON')
    .option('--sheet-id-roi <roi>', 'Sheet ID ROI: "x,y,width,height" (normalized 0-1)')
    .option('--sheet-title-roi <roi>', 'Sheet title ROI: "x,y,width,height" (normalized 0-1)')
    .option('--pages <pages>', 'Comma-separated page numbers (1-based)', '1,5,10')
    .option('--type <type>', 'Document type: drawings or specs', 'drawings')
    .option('--output-preview <path>', 'Path to write preview JSON')
    .option('--preview-dir <path>', 'Directory for preview JSON (auto-generates filename)')
    .option('--verbose', 'Verbose output', false)
    .action(async (options) => {
      try {
        // Validate input file exists
        if (!(await fileExists(options.input))) {
          console.error(`Error: Input PDF not found: ${options.input}`);
          process.exit(4);
        }

        // Parse page numbers
        const pageNumbers = options.pages.split(',').map((s: string) => {
          const num = parseInt(s.trim(), 10);
          if (isNaN(num) || num < 1) {
            throw new Error(`Invalid page number: ${s}`);
          }
          return num - 1; // Convert to 0-based
        });

        // Create locator
        let locator: SheetLocator | null = null;
        
        if (options.layout) {
          const profile = await loadLayoutProfile(options.layout);
          locator = new RoiSheetLocator(profile);
        } else if (options.sheetIdRoi) {
          const profile = createInlineLayout(options.sheetIdRoi, options.sheetTitleRoi);
          locator = new RoiSheetLocator(profile);
        } else {
          // Use composite (ROI + legacy fallback, but no ROI provided so just legacy)
          const legacyLocator = new LegacyTitleblockLocator(options.input);
          locator = legacyLocator;
        }

        if (options.verbose) {
          console.log(`Using locator: ${locator.getName()}`);
          console.log(`Testing pages: ${pageNumbers.map((p: number) => p + 1).join(', ')}`);
        }

        // Create document context
        const docContext = new DocumentContext(options.input);
        await docContext.initialize();

        // Extract text for pages
        await docContext.extractTextForPages(pageNumbers);

        // Test each page
        const results: Array<{
          pageIndex: number;
          pageNumber: number;
          sheetId?: {
            found: boolean;
            value?: string;
            normalized?: string;
            confidence?: number;
            rawText?: string;
            error?: string;
            failureReason?: string;
            method?: string;
          };
          sheetTitle?: {
            found: boolean;
            value?: string;
            rawText?: string;
            error?: string;
          };
          warnings?: string[];
          context?: string;
        }> = [];

        for (const pageIndex of pageNumbers) {
          if (pageIndex >= docContext.pageCount) {
            console.warn(`Warning: Page ${pageIndex + 1} is beyond document length (${docContext.pageCount} pages)`);
            continue;
          }

          const pageContext = await docContext.getPageContext(pageIndex);
          const result = await locator.locate(pageContext);
          const normalizedId = options.type === 'specs'
            ? (result.sectionIdNormalized || result.id)
            : (result.sheetIdNormalized || result.id);

          // Extract failure reason from warnings/context
          let failureReason: string | undefined;
          if (!result.id) {
            if (result.warnings.length > 0) {
              // Parse failure reason from warnings
              const warningsText = result.warnings.join('; ');
              if (warningsText.includes('ROI_EMPTY') || warningsText.includes('empty')) {
                failureReason = 'ROI_EMPTY';
              } else if (warningsText.includes('ROI_LOW_TEXT_DENSITY') || warningsText.includes('low text density')) {
                failureReason = 'ROI_LOW_TEXT_DENSITY';
              } else if (warningsText.includes('ROI_NO_PATTERN_MATCH') || warningsText.includes('no pattern match')) {
                failureReason = 'ROI_NO_PATTERN_MATCH';
              } else if (warningsText.includes('ROI_PREFIX_REJECTED') || warningsText.includes('prefix rejected')) {
                failureReason = 'ROI_PREFIX_REJECTED';
              } else if (warningsText.includes('multiple matches')) {
                failureReason = 'ROI_MULTIPLE_MATCHES';
              } else if (warningsText.includes('fallback')) {
                failureReason = 'LEGACY_FALLBACK';
              } else {
                failureReason = 'ROI_FAILED';
              }
            } else {
              failureReason = 'NO_MATCH';
            }
          }
          
          results.push({
            pageIndex,
            pageNumber: pageIndex + 1,
            sheetId: result.id
              ? {
                  found: true,
                  value: result.id,
                  normalized: normalizedId,
                  confidence: result.confidence,
                  method: result.method,
                }
              : {
                  found: false,
                  error: result.warnings.length > 0 ? result.warnings.join('; ') : 'No sheet ID found',
                  failureReason,
                  method: result.method,
                },
            sheetTitle: result.title
              ? {
                  found: true,
                  value: result.title,
                }
              : {
                  found: false,
                  error: 'No title found',
                },
            warnings: result.warnings.length > 0 ? result.warnings : undefined,
            context: result.context,
          });

          if (options.verbose) {
            console.log(`\nPage ${pageIndex + 1}:`);
            if (result.id) {
              console.log(`  ✓ Sheet ID: "${result.id}" -> "${normalizedId}" (confidence: ${result.confidence.toFixed(2)}, method: ${result.method})`);
              if (result.title) {
                console.log(`  ✓ Title: "${result.title}"`);
              }
              if (result.warnings.length > 0) {
                result.warnings.forEach((w: string) => console.log(`  ⚠️  ${w}`));
              }
            } else {
              console.log(`  ✗ No sheet ID found`);
              if (result.warnings.length > 0) {
                result.warnings.forEach((w: string) => console.log(`  ⚠️  ${w}`));
              }
            }
          }
        }

        // Generate summary
        const pagesWithId = results.filter(r => r.sheetId?.found).length;
        const pagesWithTitle = results.filter(r => r.sheetTitle?.found).length;
        const successRate = results.length > 0 ? pagesWithId / results.length : 0;

        const preview = {
          profile: options.layout || 'inline-roi',
          locator: locator.getName(),
          pages: results,
          summary: {
            totalPages: results.length,
            pagesWithId,
            pagesWithTitle,
            successRate: Math.round(successRate * 100) / 100,
          },
        };

        // Output results
        let previewPath = options.outputPreview;
        
        // If preview-dir specified but no explicit path, generate filename
        if (options.previewDir && !previewPath) {
          const path = await import('path');
          const fs = await import('fs/promises');
          await fs.mkdir(options.previewDir, { recursive: true });
          const baseName = path.basename(options.input, path.extname(options.input));
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          previewPath = path.join(options.previewDir, `${baseName}-preview-${timestamp}.json`);
        }
        
        if (previewPath) {
          await writeJson(previewPath, preview);
          console.log(`\nPreview written to: ${previewPath}`);
        } else {
          console.log(`\nSummary:`);
          console.log(`  Pages tested: ${results.length}`);
          console.log(`  Pages with ID: ${pagesWithId} (${Math.round(successRate * 100)}%)`);
          console.log(`  Pages with title: ${pagesWithTitle}`);
        }

        process.exit(0);
      } catch (error) {
        const err = error as Error;
        console.error(`Error: ${err.message}`);
        process.exit(2);
      }
    });
}

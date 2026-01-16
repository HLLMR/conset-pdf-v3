import type {
  MergeAddendaOptions,
  MergeReport,
} from '../index.js';
import { planMerge } from './planner.js';
import { applyMergePlan } from './applyPlan.js';
import { generateMergeReport } from './report.js';
import { writeJson } from '../utils/fs.js';
import type { SheetLocator } from '../locators/sheetLocator.js';

/**
 * Merge addenda into an original PDF set
 */
export async function mergeAddenda(
  opts: MergeAddendaOptions
): Promise<MergeReport> {
  const parseStart = Date.now();
  const mode = opts.mode || 'replace+insert';
  const strict = opts.strict || false;
  const dryRun = opts.dryRun || false;
  const verbose = opts.verbose || false;

  if (verbose) {
    console.log(`Parsing original PDF: ${opts.originalPdfPath}`);
    console.log(`Processing ${opts.addendumPdfPaths.length} addendum PDF(s)`);
  }

  // Get locator if provided (from layout profile or inline ROI)
  const locator: SheetLocator | null = opts.locator || null;

  // Plan the merge
  const plan = await planMerge(
    opts.originalPdfPath,
    opts.addendumPdfPaths,
    opts.type,
    mode,
    strict,
    locator,
    verbose,
    true, // Always write inventory files for debugging
    opts.inventoryOutputDir // Optional organized output directory
  );

  const parseTime = Date.now() - parseStart;

  if (verbose) {
    console.log(`Parse complete in ${parseTime}ms`);
    console.log(`Planned: ${plan.pages.length} pages`);
    console.log(`Replacements: ${plan.replaced.length}`);
    console.log(`Insertions: ${plan.inserted.length}`);
    console.log(`Unmatched: ${plan.unmatched.length}`);
  }

  // Apply the plan (unless dry run)
  const mergeStart = Date.now();
  if (!dryRun) {
    if (!opts.outputPdfPath) {
      throw new Error('outputPdfPath is required when not in dry-run mode');
    }

    if (verbose) {
      console.log(`Applying merge plan to: ${opts.outputPdfPath}`);
    }

    await applyMergePlan(plan, opts.outputPdfPath, {
      regenerateBookmarks: opts.regenerateBookmarks || false,
      type: opts.type,
      verbose: verbose,
    });
  }
  const mergeTime = Date.now() - mergeStart;

  // Generate report (pass DocumentContext to avoid re-loading PDF)
  const report = await generateMergeReport(
    plan,
    opts.originalPdfPath,
    opts.addendumPdfPaths,
    opts.outputPdfPath,
    opts.type,
    parseTime,
    mergeTime,
    (plan as any).originalDocContext as any // Pass DocumentContext from plan if available
  );

  // Write report if requested
  if (opts.reportPath) {
    await writeJson(opts.reportPath, report);
    if (verbose) {
      console.log(`Report written to: ${opts.reportPath}`);
    }
  }

  if (!verbose && !dryRun) {
    const summary = `Merged 1 original + ${opts.addendumPdfPaths.length} addenda -> ${opts.outputPdfPath || 'dry-run'} (replaced=${plan.replaced.length}, inserted=${plan.inserted.length}, warnings=${report.warnings.length})`;
    console.log(summary);
  }

  return report;
}

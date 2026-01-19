/**
 * Schedule extraction engine
 * 
 * Extracts tables/schedules from transcripts using geometry-first approach
 * with fallbacks to pdfplumber and camelot.
 */

import type { LayoutTranscript } from '../types.js';
import type { ScheduleTable } from './types.js';
import { buildTableFromGeometry } from './tableBuilder.js';
import { generateCandidates } from '../candidates.js';

/**
 * Extract schedules from transcript
 * 
 * @param transcript Layout transcript
 * @param options Extraction options
 * @returns Array of extracted schedule tables
 */
export async function extractSchedules(
  transcript: LayoutTranscript,
  options: {
    /** Use geometry-based extraction (primary) */
    useGeometry?: boolean;
    /** Use pdfplumber fallback */
    usePdfplumber?: boolean;
    /** Use camelot fallback */
    useCamelot?: boolean;
  } = {}
): Promise<ScheduleTable[]> {
  const tables: ScheduleTable[] = [];
  const candidates = generateCandidates(transcript);
  const tableCandidates = candidates.tableCandidates || [];
  
  // Use geometry-based extraction (primary)
  if (options.useGeometry !== false) {
    for (const candidate of tableCandidates) {
      const page = transcript.pages[candidate.pageIndex];
      if (!page) continue;
      
      const table = buildTableFromGeometry(page, candidate.bbox);
      if (table) {
        tables.push(table);
      }
    }
    
    // Also try building tables from pages with high line density
    for (const page of transcript.pages) {
      if (page.lines && page.lines.length > 10) {
        // High line density suggests tables
        const table = buildTableFromGeometry(page);
        if (table && !tables.some(t => t.pageIndex === table.pageIndex)) {
          tables.push(table);
        }
      }
    }
  }
  
  // TODO: Implement pdfplumber and camelot fallbacks
  // These would require Python sidecar scripts similar to extract-transcript.py
  
  return tables;
}

/**
 * Export schedule table to CSV format
 */
export function exportScheduleToCSV(table: ScheduleTable): string {
  const lines: string[] = [];
  
  // Header row
  const headerCells = table.columns.map(col => col.name || `Column ${col.columnIndex + 1}`);
  lines.push(headerCells.join(','));
  
  // Data rows
  for (const row of table.rows) {
    if (row.isHeader) {
      continue; // Skip header row if already in columns
    }
    
    const cells: string[] = [];
    for (const col of table.columns) {
      const cell = row.cells.find(c => c.columnIndex === col.columnIndex);
      const text = cell?.text || '';
      // Escape CSV: wrap in quotes if contains comma, quote, or newline
      const escaped = text.includes(',') || text.includes('"') || text.includes('\n')
        ? `"${text.replace(/"/g, '""')}"`
        : text;
      cells.push(escaped);
    }
    lines.push(cells.join(','));
  }
  
  return lines.join('\n');
}

/**
 * Export schedule table to JSON format
 */
export function exportScheduleToJSON(table: ScheduleTable): string {
  return JSON.stringify(table, null, 2);
}

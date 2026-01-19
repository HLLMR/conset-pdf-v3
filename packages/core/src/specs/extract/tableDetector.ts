/**
 * Basic table detection for spec extraction
 * 
 * Detects table-like structures in spec documents.
 */

import type { TextItemWithPosition } from '../../utils/pdf.js';
import type { SpecNode } from '../ast/types.js';

/**
 * Detect tables in text items
 * 
 * @param textItems Text items to analyze
 * @param pageIndex Page index
 * @returns Array of table placeholder nodes
 */
export function detectTables(
  textItems: TextItemWithPosition[],
  pageIndex: number
): SpecNode[] {
  const tables: SpecNode[] = [];
  
  // Simple heuristic: look for aligned columns
  // Group items by Y coordinate (rows)
  const rows = groupIntoRows(textItems);
  
  // Check if rows have consistent column structure
  if (rows.length >= 3) {
    // Analyze column alignment
    const columnPositions = detectColumnPositions(rows);
    
    if (columnPositions.length >= 2) {
      // Likely a table - create placeholder
      const tableNode: SpecNode = {
        id: `table-${pageIndex}-${Date.now()}`,
        anchor: null,
        type: 'table-placeholder',
        text: '[Table detected]',
        level: 0,
        page: pageIndex + 1,
        y: rows[0]?.items[0]?.y || 0,
        confidence: 0.7, // Basic detection, lower confidence
        issues: ['Table structure detected but not yet extracted'],
      };
      
      tables.push(tableNode);
    }
  }
  
  return tables;
}

/**
 * Group text items into rows based on Y coordinate
 */
function groupIntoRows(textItems: TextItemWithPosition[]): Array<{ y: number; items: TextItemWithPosition[] }> {
  const rows: Array<{ y: number; items: TextItemWithPosition[] }> = [];
  const yThreshold = 5; // Points
  
  for (const item of textItems) {
    let foundRow = false;
    
    for (const row of rows) {
      if (Math.abs(row.y - item.y) <= yThreshold) {
        row.items.push(item);
        foundRow = true;
        break;
      }
    }
    
    if (!foundRow) {
      rows.push({
        y: item.y,
        items: [item],
      });
    }
  }
  
  // Sort items within each row by X
  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
  }
  
  // Sort rows by Y (top to bottom)
  rows.sort((a, b) => a.y - b.y);
  
  return rows;
}

/**
 * Detect column positions from rows
 */
function detectColumnPositions(
  rows: Array<{ y: number; items: TextItemWithPosition[] }>
): number[] {
  if (rows.length === 0) {
    return [];
  }
  
  // Collect all X positions
  const xPositions = new Set<number>();
  for (const row of rows) {
    for (const item of row.items) {
      xPositions.add(Math.round(item.x / 10) * 10); // Round to nearest 10 points
    }
  }
  
  // Find positions that appear in multiple rows (aligned columns)
  const columnCandidates = new Map<number, number>(); // x -> count
  
  for (const row of rows) {
    const rowXPositions = new Set<number>();
    for (const item of row.items) {
      const roundedX = Math.round(item.x / 10) * 10;
      rowXPositions.add(roundedX);
    }
    
    for (const x of rowXPositions) {
      columnCandidates.set(x, (columnCandidates.get(x) || 0) + 1);
    }
  }
  
  // Filter to positions that appear in at least 50% of rows
  const threshold = Math.ceil(rows.length * 0.5);
  const columns: number[] = [];
  
  for (const [x, count] of columnCandidates.entries()) {
    if (count >= threshold) {
      columns.push(x);
    }
  }
  
  // Sort by X position
  columns.sort((a, b) => a - b);
  
  return columns;
}

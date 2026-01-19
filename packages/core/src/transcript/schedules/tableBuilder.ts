/**
 * Geometry-first table builder
 * 
 * Builds table structure from transcript spans using geometric alignment.
 */

import type { LayoutPage, LayoutSpan } from '../types.js';
import type { ScheduleTable, ScheduleRow, ScheduleColumn } from './types.js';

/**
 * Build table structure from spans using geometry
 * 
 * @param page Page with spans
 * @param bbox Optional bounding box to limit search
 * @returns Schedule table or null if no table detected
 */
export function buildTableFromGeometry(
  page: LayoutPage,
  bbox?: [x0: number, y0: number, x1: number, y1: number]
): ScheduleTable | null {
  // Filter spans to bbox if provided
  let candidateSpans = page.spans;
  if (bbox) {
    const [bx0, by0, bx1, by1] = bbox;
    candidateSpans = page.spans.filter(span => {
      const [sx0, sy0, sx1, sy1] = span.bbox;
      // Check if span overlaps with bbox
      return sx0 < bx1 && sx1 > bx0 && sy0 < by1 && sy1 > by0;
    });
  }
  
  if (candidateSpans.length < 4) {
    return null; // Need at least a few spans for a table
  }
  
  // Detect columns by X coordinate clustering
  const columns = detectColumns(candidateSpans);
  
  if (columns.length < 2) {
    return null; // Need at least 2 columns
  }
  
  // Group spans into rows by Y coordinate
  const rows = groupIntoRows(candidateSpans, columns);
  
  if (rows.length < 2) {
    return null; // Need at least 2 rows (header + data)
  }
  
  // Build table structure
  const tableRows: ScheduleRow[] = rows.map((row, rowIdx) => {
    const cells = row.spans.map(span => {
      // Find which column this span belongs to
      const [sx0, , sx1] = span.bbox;
      const spanCenterX = (sx0 + sx1) / 2;
      
      let columnIndex = 0;
      for (let i = 0; i < columns.length; i++) {
        if (spanCenterX >= columns[i].x && spanCenterX < columns[i].x + columns[i].width) {
          columnIndex = i;
          break;
        }
        // If span is before this column, use previous
        if (spanCenterX < columns[i].x && i > 0) {
          columnIndex = i - 1;
          break;
        }
      }
      
      return {
        columnIndex,
        text: span.text,
        bbox: span.bbox,
      };
    });
    
    return {
      rowIndex: rowIdx,
      cells,
      isHeader: rowIdx === 0, // First row is typically header
    };
  });
  
  // Calculate table bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const span of candidateSpans) {
    const [x0, y0, x1, y1] = span.bbox;
    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
  }
  
  return {
    tableId: `table-${page.pageIndex}-${Date.now()}`,
    pageIndex: page.pageIndex,
    bbox: [minX, minY, maxX, maxY],
    rows: tableRows,
    columns,
    confidence: calculateTableConfidence(columns, rows),
    method: 'geometry',
  };
}

/**
 * Detect columns by X coordinate clustering
 */
function detectColumns(spans: LayoutSpan[]): ScheduleColumn[] {
  // Collect all X positions
  const xPositions = new Map<number, number>(); // x -> count
  
  for (const span of spans) {
    const [x0, , x1] = span.bbox;
    const centerX = (x0 + x1) / 2;
    const roundedX = Math.round(centerX / 5) * 5; // Round to nearest 5 points
    
    xPositions.set(roundedX, (xPositions.get(roundedX) || 0) + 1);
  }
  
  // Find X positions that appear frequently (likely column positions)
  const threshold = Math.max(2, spans.length * 0.1); // At least 10% of spans
  const columnCandidates: number[] = [];
  
  for (const [x, count] of xPositions.entries()) {
    if (count >= threshold) {
      columnCandidates.push(x);
    }
  }
  
  // Sort by X
  columnCandidates.sort((a, b) => a - b);
  
  // Merge nearby columns (within 10 points)
  const columns: ScheduleColumn[] = [];
  for (const x of columnCandidates) {
    // Check if this is close to an existing column
    let merged = false;
    for (const col of columns) {
      if (Math.abs(x - col.x) < 10) {
        // Merge: update column position to average
        col.x = (col.x + x) / 2;
        merged = true;
        break;
      }
    }
    
    if (!merged) {
      // Calculate column width from spans in this column
      const columnSpans = spans.filter(span => {
        const [sx0, , sx1] = span.bbox;
        const centerX = (sx0 + sx1) / 2;
        return Math.abs(centerX - x) < 10;
      });
      
      let maxWidth = 0;
      for (const span of columnSpans) {
        const [, , , width] = span.bbox;
        maxWidth = Math.max(maxWidth, width);
      }
      
      columns.push({
        columnIndex: columns.length,
        name: `Column ${columns.length + 1}`,
        x,
        width: maxWidth || 50, // Default width if no spans found
      });
    }
  }
  
  return columns;
}

/**
 * Group spans into rows by Y coordinate
 */
function groupIntoRows(
  spans: LayoutSpan[],
  _columns: ScheduleColumn[]
): Array<{ y: number; spans: LayoutSpan[] }> {
  const rows: Array<{ y: number; spans: LayoutSpan[] }> = [];
  const yThreshold = 5; // Points
  
  for (const span of spans) {
    const [, y0] = span.bbox;
    const roundedY = Math.round(y0 / 5) * 5; // Round to nearest 5 points
    
    let foundRow = false;
    for (const row of rows) {
      if (Math.abs(row.y - roundedY) <= yThreshold) {
        row.spans.push(span);
        foundRow = true;
        break;
      }
    }
    
    if (!foundRow) {
      rows.push({
        y: roundedY,
        spans: [span],
      });
    }
  }
  
  // Sort rows by Y (top to bottom)
  rows.sort((a, b) => a.y - b.y);
  
  // Sort spans within each row by X
  for (const row of rows) {
    row.spans.sort((a, b) => {
      const [ax0] = a.bbox;
      const [bx0] = b.bbox;
      return ax0 - bx0;
    });
  }
  
  return rows;
}

/**
 * Calculate table confidence based on structure
 */
function calculateTableConfidence(
  columns: ScheduleColumn[],
  rows: Array<{ y: number; spans: LayoutSpan[] }>
): number {
  let confidence = 0.5; // Base confidence
  
  // More columns = higher confidence
  if (columns.length >= 3) {
    confidence += 0.2;
  }
  
  // More rows = higher confidence
  if (rows.length >= 5) {
    confidence += 0.2;
  }
  
  // Check if rows have consistent structure
  const avgSpansPerRow = rows.reduce((sum, row) => sum + row.spans.length, 0) / rows.length;
  const consistentRows = rows.filter(row => 
    Math.abs(row.spans.length - avgSpansPerRow) <= 2
  ).length;
  
  if (consistentRows / rows.length >= 0.8) {
    confidence += 0.1;
  }
  
  return Math.min(1.0, confidence);
}

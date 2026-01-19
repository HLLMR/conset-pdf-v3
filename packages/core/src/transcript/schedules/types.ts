/**
 * Schedule extraction types
 * 
 * Types for table/schedule extraction from PDFs.
 */

/**
 * Schedule table structure
 */
export interface ScheduleTable {
  /** Table identifier */
  tableId: string;
  /** Page index where table appears */
  pageIndex: number;
  /** Bounding box of table */
  bbox: [x0: number, y0: number, x1: number, y1: number];
  /** Table rows */
  rows: ScheduleRow[];
  /** Column definitions */
  columns: ScheduleColumn[];
  /** Extraction confidence (0.0-1.0) */
  confidence: number;
  /** Extraction method used */
  method: 'geometry' | 'pdfplumber' | 'camelot';
  /** Extraction issues */
  issues?: string[];
}

/**
 * Schedule row
 */
export interface ScheduleRow {
  /** Row index (0-based) */
  rowIndex: number;
  /** Cell values */
  cells: Array<{
    /** Column index */
    columnIndex: number;
    /** Cell text */
    text: string;
    /** Cell bounding box */
    bbox?: [x0: number, y0: number, x1: number, y1: number];
  }>;
  /** Whether this is a header row */
  isHeader?: boolean;
}

/**
 * Schedule column definition
 */
export interface ScheduleColumn {
  /** Column index (0-based) */
  columnIndex: number;
  /** Column name/header */
  name: string;
  /** X coordinate of column */
  x: number;
  /** Column width */
  width: number;
  /** Data type hint */
  type?: 'text' | 'number' | 'date';
}

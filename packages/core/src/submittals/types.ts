/**
 * Submittal AST types
 * 
 * Defines the structured representation of equipment submittal documents.
 * 
 * @experimental This module is in early development and its API is subject to change.
 * The submittal parsing functionality is provided as-is and may undergo significant
 * refactoring in future versions. Not recommended for production use at this time.
 */

/**
 * Submittal packet index
 */
export interface SubmittalPacketIndex {
  /** Document metadata */
  meta: {
    sourcePdfPath: string;
    extractedAt: string; // ISO timestamp
    pageCount: number;
    packetCount: number;
  };
  /** Detected packets (units) */
  packets: SubmittalPacket[];
}

/**
 * Submittal packet (unit)
 */
export interface SubmittalPacket {
  /** Packet identifier */
  packetId: string;
  /** Start page (1-based) */
  startPage: number;
  /** End page (1-based, inclusive) */
  endPage: number;
  /** Packet type (e.g., "cover", "unit-report") */
  type: 'cover' | 'unit-report' | 'unknown';
  /** Confidence score (0.0-1.0) */
  confidence: number;
}

/**
 * Submittal fields (key/value pairs)
 */
export interface SubmittalFields {
  /** Packet identifier */
  packetId: string;
  /** Field values */
  fields: {
    [fieldName: string]: {
      /** Field value */
      value: string;
      /** Field confidence */
      confidence: number;
      /** Page where field was found */
      page: number;
    };
  };
}

/**
 * Submittal tables (performance data)
 */
export interface SubmittalTables {
  /** Packet identifier */
  packetId: string;
  /** Extracted tables */
  tables: Array<{
    /** Table identifier */
    tableId: string;
    /** Table type (e.g., "performance", "specifications") */
    type: string;
    /** Page where table appears */
    page: number;
    /** Table data (rows and columns) */
    data: Array<{
      [columnName: string]: string;
    }>;
    /** Confidence score */
    confidence: number;
  }>;
}

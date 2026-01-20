/**
 * Submittal parser
 * 
 * Extracts structured data from equipment submittal PDFs:
 * - Packet segmentation (unit boundaries)
 * - Key/value block extraction
 * - Performance data extraction
 * - Table extraction
 */

import type { LayoutTranscript } from '../../transcript/types.js';
import type { SubmittalPacketIndex, SubmittalPacket, SubmittalFields, SubmittalTables } from '../types.js';
import { extractSchedules } from '../../transcript/schedules/extractor.js';

/**
 * Parse submittal document
 * 
 * @param transcript Layout transcript
 * @param options Parsing options
 * @returns Submittal packet index
 */
export function parseSubmittal(
  transcript: LayoutTranscript,
  options: {
    /** Cover block pattern (regex string) */
    coverBlockPattern?: string;
    /** Unit report pattern (regex string) */
    unitReportPattern?: string;
  } = {}
): SubmittalPacketIndex {
  // Default patterns for common submittal formats
  const coverPatternStr = options.coverBlockPattern || 'COVER|UNIT\\s+\\d+|EQUIPMENT\\s+SUBMITTAL';
  const unitPatternStr = options.unitReportPattern || 'UNIT\\s+REPORT|PERFORMANCE\\s+DATA|SPECIFICATIONS';
  const coverPattern = new RegExp(coverPatternStr, 'i');
  const unitPattern = new RegExp(unitPatternStr, 'i');
  
  // Detect packet boundaries using repeated anchors
  const packets = detectPacketBoundaries(transcript, coverPattern, unitPattern);
  
  return {
    meta: {
      sourcePdfPath: transcript.filePath,
      extractedAt: new Date().toISOString(),
      pageCount: transcript.pages.length,
      packetCount: packets.length,
    },
    packets,
  };
}

/**
 * Extract fields from a submittal packet
 * 
 * Part of the V3 transcript system's submittal parser module. Use this to extract
 * key-value fields from a submittal packet using regex patterns. This is a lower-level
 * API compared to parseSubmittal() - use this when you need fine-grained control over
 * field extraction patterns.
 * 
 * @param transcript Layout transcript (from createTranscriptExtractor())
 * @param packet Submittal packet to extract fields from
 * @param fieldPatterns Field name patterns (regex with optional bbox constraints)
 * @returns Extracted fields with confidence scores
 * @example
 * ```typescript
 * import { parseSubmittal, extractPacketFields } from '@conset-pdf/core';
 * const packets = parseSubmittal(transcript);
 * const fields = extractPacketFields(transcript, packets[0], {
 *   modelNumber: { regex: 'Model[\\s:]+([A-Z0-9-]+)' },
 *   serialNumber: { regex: 'Serial[\\s:]+([A-Z0-9-]+)' }
 * });
 * ```
 */
export function extractPacketFields(
  transcript: LayoutTranscript,
  packet: SubmittalPacket,
  fieldPatterns: { [fieldName: string]: { regex: string; bbox?: [x0: number, y0: number, x1: number, y1: number] } }
): SubmittalFields {
  const fields: SubmittalFields['fields'] = {};
  
  // Extract pages in packet range
  const pages = transcript.pages.filter(page => 
    page.pageNumber >= packet.startPage && page.pageNumber <= packet.endPage
  );
  
  for (const [fieldName, pattern] of Object.entries(fieldPatterns)) {
    const regex = new RegExp(pattern.regex, 'i');
    
    // Search for field in pages
    for (const page of pages) {
      for (const span of page.spans) {
        // Check if span matches field pattern
        if (regex.test(span.text)) {
          // Extract value (text after field name)
          const match = span.text.match(regex);
          if (match && match[1]) {
            fields[fieldName] = {
              value: match[1].trim(),
              confidence: 0.8,
              page: page.pageNumber,
            };
            break; // Found field, move to next
          }
        }
      }
      
      if (fields[fieldName]) {
        break; // Field found, move to next field
      }
    }
  }
  
  return {
    packetId: packet.packetId,
    fields,
  };
}

/**
 * Extract tables from a submittal packet
 * 
 * Part of the V3 transcript system's submittal parser module. Use this to extract
 * performance tables and other structured data from a submittal packet. This is a
 * lower-level API compared to parseSubmittal() - use this when you need direct access
 * to table extraction functionality.
 * 
 * @param transcript Layout transcript (from createTranscriptExtractor())
 * @param packet Submittal packet to extract tables from
 * @returns Extracted tables with column/row structure
 * @example
 * ```typescript
 * import { parseSubmittal, extractPacketTables } from '@conset-pdf/core';
 * const packets = parseSubmittal(transcript);
 * const tables = await extractPacketTables(transcript, packets[0]);
 * ```
 */
export async function extractPacketTables(
  transcript: LayoutTranscript,
  packet: SubmittalPacket
): Promise<SubmittalTables> {
  // Filter transcript to packet pages
  const packetTranscript: LayoutTranscript = {
    ...transcript,
    pages: transcript.pages.filter(page =>
      page.pageNumber >= packet.startPage && page.pageNumber <= packet.endPage
    ),
  };
  
  // Extract schedules using geometry-based extraction
  const scheduleTables = await extractSchedules(packetTranscript, {
    useGeometry: true,
  });
  
  // Convert to submittal table format
  const tables = scheduleTables.map((table, idx) => {
    // Determine table type based on content
    let tableType = 'unknown';
    if (table.rows.length > 0 && table.rows[0].cells.length > 0) {
      const headerText = table.rows[0].cells.map(c => c.text).join(' ').toUpperCase();
      if (headerText.includes('PERFORMANCE') || headerText.includes('CAPACITY')) {
        tableType = 'performance';
      } else if (headerText.includes('SPECIFICATION') || headerText.includes('SPEC')) {
        tableType = 'specifications';
      }
    }
    
    // Convert to row-based format
    const data: Array<{ [columnName: string]: string }> = [];
    
    // Get column names from header row
    const columnNames: string[] = [];
    if (table.rows.length > 0 && table.rows[0].isHeader) {
      for (const col of table.columns) {
        const headerCell = table.rows[0].cells.find(c => c.columnIndex === col.columnIndex);
        columnNames[col.columnIndex] = headerCell?.text || col.name;
      }
    } else {
      // No header row, use column names
      columnNames.push(...table.columns.map(col => col.name));
    }
    
    // Extract data rows
    for (let i = table.rows[0]?.isHeader ? 1 : 0; i < table.rows.length; i++) {
      const row = table.rows[i];
      const rowData: { [columnName: string]: string } = {};
      
      for (const cell of row.cells) {
        const columnName = columnNames[cell.columnIndex] || `Column ${cell.columnIndex + 1}`;
        rowData[columnName] = cell.text;
      }
      
      if (Object.keys(rowData).length > 0) {
        data.push(rowData);
      }
    }
    
    return {
      tableId: `table-${packet.packetId}-${idx}`,
      type: tableType,
      page: table.pageIndex + 1,
      data,
      confidence: table.confidence,
    };
  });
  
  return {
    packetId: packet.packetId,
    tables,
  };
}

/**
 * Detect packet boundaries using repeated anchors
 */
function detectPacketBoundaries(
  transcript: LayoutTranscript,
  coverPattern: RegExp,
  unitPattern: RegExp
): SubmittalPacket[] {
  const packets: SubmittalPacket[] = [];
  let currentPacket: SubmittalPacket | null = null;
  let packetIndex = 0;
  
  for (const page of transcript.pages) {
    // Search for cover block or unit report patterns
    let foundCover = false;
    let foundUnit = false;
    
    for (const span of page.spans) {
      if (coverPattern.test(span.text)) {
        foundCover = true;
      }
      if (unitPattern.test(span.text)) {
        foundUnit = true;
      }
    }
    
    // Start new packet on cover block
    if (foundCover) {
      // Close previous packet if exists
      if (currentPacket) {
        currentPacket.endPage = page.pageNumber - 1;
        packets.push(currentPacket);
      }
      
      // Start new cover packet
      currentPacket = {
        packetId: `packet-${packetIndex}`,
        startPage: page.pageNumber,
        endPage: page.pageNumber,
        type: 'cover',
        confidence: 0.9,
      };
      packetIndex++;
    } else if (foundUnit && currentPacket) {
      // Update packet type to unit-report
      currentPacket.type = 'unit-report';
      currentPacket.confidence = 0.8;
    } else if (currentPacket) {
      // Extend current packet
      currentPacket.endPage = page.pageNumber;
    }
  }
  
  // Close final packet
  if (currentPacket) {
    packets.push(currentPacket);
  }
  
  // If no packets detected, create a single packet for entire document
  if (packets.length === 0) {
    packets.push({
      packetId: 'packet-0',
      startPage: 1,
      endPage: transcript.pages.length,
      type: 'unknown',
      confidence: 0.5,
    });
  }
  
  return packets;
}

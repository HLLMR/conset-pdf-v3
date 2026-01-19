/**
 * Text extraction for specs PDFs
 * 
 * Extracts text items from pages and creates flat node structures.
 * Enhanced with chrome removal, paragraph normalization, and table detection.
 */

import type { DocumentContext } from '../../analyze/documentContext.js';
import type { SpecNode, SpecSection } from '../ast/types.js';
import type { TextItemWithPosition } from '../../utils/pdf.js';
import { detectAnchors } from './anchorDetector.js';
import { detectListItems } from './listDetector.js';
import { buildHierarchy } from './hierarchyBuilder.js';
import { removeChrome } from './chromeRemoval.js';
import { normalizeParagraph } from './paragraphNormalizer.js';
import { detectTables } from './tableDetector.js';
import { createTranscriptExtractor } from '../../transcript/factory.js';

/**
 * Extract text nodes from a section (flat structure, no hierarchy yet)
 * Enhanced with chrome removal and paragraph normalization
 */
export async function extractTextNodes(
  docContext: DocumentContext,
  section: SpecSection
): Promise<SpecNode[]> {
  const nodes: SpecNode[] = [];
  let nodeIndex = 0;
  
  // Get transcript for chrome removal and candidate detection
  // DocumentContext now uses transcripts internally, but we need access to the full transcript
  const transcriptExtractor = createTranscriptExtractor();
  const transcript = await transcriptExtractor.extractTranscript(docContext.pdfPath);
  
  // Extract text from each page in the section
  // IMPORTANT: section.startPage and endPage are 0-based (from sectionDetector)
  // We iterate using 0-based indices directly
  for (let pageIndex = section.startPage; pageIndex <= section.endPage; pageIndex++) {
    const pageContext = await docContext.getPageContext(pageIndex);
    await docContext.extractTextForPage(pageIndex);
    
    let textItems = pageContext.getTextItems();
    const pageHeight = pageContext.pageHeight;
    
    // Remove chrome (header/footer) using candidate detection
    textItems = removeChrome(textItems, pageHeight, transcript, pageIndex);
    
    // Detect tables first (before grouping into paragraphs)
    const tableNodes = detectTables(textItems, pageIndex);
    for (const tableNode of tableNodes) {
      tableNode.id = `${section.id}-node-${nodeIndex}`;
      nodes.push(tableNode);
      nodeIndex++;
    }
    
    // Filter out text items that are part of detected tables
    // (Simple heuristic: exclude items near table nodes)
    const tableYPositions = new Set(tableNodes.map(t => t.y || 0));
    const filteredTextItems = textItems.filter(item => {
      for (const tableY of tableYPositions) {
        if (Math.abs(item.y - tableY) < 50) {
          return false; // Likely part of table
        }
      }
      return true;
    });
    
    // Group remaining text items into lines
    const textLines = groupTextItemsIntoLines(filteredTextItems);
    
    // Group lines into paragraphs (for normalization)
    const paragraphs = groupLinesIntoParagraphs(textLines);
    
    // Create nodes from normalized paragraphs
    for (const paragraph of paragraphs) {
      const nodeId = `${section.id}-node-${nodeIndex}`;
      
      // Normalize paragraph (wrap join + hyphen repair)
      const normalizedText = normalizeParagraph(paragraph.lines);
      
      if (normalizedText.length > 0) {
        nodes.push({
          id: nodeId,
          anchor: null, // Will be populated by anchor detector
          type: 'paragraph', // Default type, will be refined by other detectors
          text: normalizedText,
          level: 0, // Default level, will be refined by hierarchy builder
          page: pageIndex + 1, // Convert 0-based to 1-based for node.page (matches type definition)
          y: paragraph.lines[0]?.y || 0,
          confidence: 1.0,
        });
        nodeIndex++;
      }
    }
  }
  
  // Detect anchors in nodes
  const { nodes: nodesWithAnchors } = detectAnchors(nodes);
  
  // Detect list items
  const nodesWithLists = detectListItems(nodesWithAnchors);
  
  // Build hierarchy (modifies nodes in-place, returns root nodes)
  // We keep all nodes, hierarchy is built via parent-child relationships
  buildHierarchy(nodesWithLists);
  
  return nodesWithLists;
}

/**
 * Group text items into lines based on Y coordinate
 */
interface TextLine {
  y: number;
  items: TextItemWithPosition[];
}

function groupTextItemsIntoLines(
  textItems: TextItemWithPosition[]
): TextLine[] {
  const lineThreshold = 5; // Points - items within this Y distance are on the same line
  const lines: TextLine[] = [];
  const sortedItems = [...textItems].sort((a, b) => {
    // Sort by Y (top to bottom), then X (left to right)
    const yDiff = b.y - a.y; // Higher Y = top of page
    if (Math.abs(yDiff) > lineThreshold) {
      return yDiff;
    }
    return a.x - b.x;
  });
  
  for (const item of sortedItems) {
    // Find existing line with similar Y coordinate
    let foundLine = false;
    for (const line of lines) {
      if (Math.abs(line.y - item.y) <= lineThreshold) {
        line.items.push(item);
        foundLine = true;
        break;
      }
    }
    
    // Create new line if no matching line found
    if (!foundLine) {
      lines.push({
        y: item.y,
        items: [item],
      });
    }
  }
  
  // Sort items within each line by X coordinate
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
  }
  
  return lines;
}

/**
 * Group lines into paragraphs based on spacing and content
 */
interface Paragraph {
  lines: Array<{ y: number; items: TextItemWithPosition[] }>;
}

function groupLinesIntoParagraphs(
  lines: Array<{ y: number; items: TextItemWithPosition[] }>
): Paragraph[] {
  if (lines.length === 0) {
    return [];
  }
  
  const paragraphs: Paragraph[] = [];
  let currentParagraph: Paragraph = { lines: [] };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineText = line.items.map(item => item.str.trim()).join(' ').trim();
    
    // Empty line indicates paragraph break
    if (lineText.length === 0) {
      if (currentParagraph.lines.length > 0) {
        paragraphs.push(currentParagraph);
        currentParagraph = { lines: [] };
      }
      continue;
    }
    
    // Check if this line starts a new paragraph
    // Criteria: large Y gap from previous line OR starts with heading pattern
    if (i > 0 && currentParagraph.lines.length > 0) {
      const prevLine = currentParagraph.lines[currentParagraph.lines.length - 1];
      const yGap = line.y - (prevLine.y + 20); // Approximate line height
      
      // Large gap (more than 1.5 lines) indicates paragraph break
      if (yGap > 30) {
        paragraphs.push(currentParagraph);
        currentParagraph = { lines: [line] };
        continue;
      }
      
      // Check if line looks like a heading (all caps, short, etc.)
      const looksLikeHeading = /^[A-Z][A-Z0-9\s]{0,50}$/.test(lineText) && lineText.length < 60;
      if (looksLikeHeading && currentParagraph.lines.length > 2) {
        paragraphs.push(currentParagraph);
        currentParagraph = { lines: [line] };
        continue;
      }
    }
    
    currentParagraph.lines.push(line);
  }
  
  // Add final paragraph
  if (currentParagraph.lines.length > 0) {
    paragraphs.push(currentParagraph);
  }
  
  return paragraphs;
}

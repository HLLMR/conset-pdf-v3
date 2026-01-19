/**
 * Text extraction for specs PDFs
 * 
 * Extracts text items from pages and creates flat node structures.
 */

import type { DocumentContext } from '../../analyze/documentContext.js';
import type { SpecNode, SpecSection } from '../ast/types.js';
import type { TextItemWithPosition } from '../../utils/pdf.js';
import { detectAnchors } from './anchorDetector.js';
import { detectListItems } from './listDetector.js';
import { buildHierarchy } from './hierarchyBuilder.js';

/**
 * Extract text nodes from a section (flat structure, no hierarchy yet)
 */
export async function extractTextNodes(
  docContext: DocumentContext,
  section: SpecSection
): Promise<SpecNode[]> {
  const nodes: SpecNode[] = [];
  let nodeIndex = 0;
  
  // Extract text from each page in the section
  // IMPORTANT: section.startPage and endPage are 0-based (from sectionDetector)
  // We iterate using 0-based indices directly
  for (let pageIndex = section.startPage; pageIndex <= section.endPage; pageIndex++) {
    const pageContext = await docContext.getPageContext(pageIndex);
    await docContext.extractTextForPage(pageIndex);
    
    const textItems = pageContext.getTextItems();
    
    // Group text items into lines (by Y coordinate)
    const lines = groupTextItemsIntoLines(textItems);
    
    // Create a node for each line
    for (const line of lines) {
      const nodeId = `${section.id}-node-${nodeIndex}`;
      const text = line.items.map(item => item.str).join(' ').trim();
      
      if (text.length > 0) {
        nodes.push({
          id: nodeId,
          anchor: null, // Will be populated by anchor detector
          type: 'paragraph', // Default type, will be refined by other detectors
          text,
          level: 0, // Default level, will be refined by hierarchy builder
          page: pageIndex + 1, // Convert 0-based to 1-based for node.page (matches type definition)
          y: line.y,
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

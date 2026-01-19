/**
 * HTML generator for specs PDFs
 * 
 * Converts SpecDoc AST to semantic HTML with CSS classes.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { SpecDoc, SpecNode } from '../ast/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load CSS template from file
 */
export async function loadCssTemplate(): Promise<string> {
  const cssPath = path.join(__dirname, 'templates', 'specs.css');
  return await fs.readFile(cssPath, 'utf-8');
}

/**
 * Generate HTML from SpecDoc AST
 */
export function generateHtml(ast: SpecDoc, cssTemplate: string): string {
  const sectionsHtml = ast.sections.map(section => generateSectionHtml(section)).join('\n');
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spec Document</title>
  <style>
${cssTemplate}
  </style>
</head>
<body>
${sectionsHtml}
</body>
</html>`;
}

/**
 * Generate HTML for a section
 */
function generateSectionHtml(section: { sectionId: string; title?: string; content: SpecNode[] }): string {
  const contentHtml = section.content.map(node => generateNodeHtml(node, 0)).join('\n');
  
  return `  <section class="spec-section" data-section-id="${section.sectionId}">
    <h1 class="spec-section-header">SECTION ${section.sectionId}${section.title ? ` - ${escapeHtml(section.title)}` : ''}</h1>
${contentHtml}
  </section>`;
}

/**
 * Generate HTML for a node (recursive)
 */
function generateNodeHtml(node: SpecNode, depth: number): string {
  const indent = '    ' + '  '.repeat(depth);
  const anchorAttr = node.anchor ? ` data-anchor="${escapeHtml(node.anchor)}"` : '';
  const levelClass = `level-${node.level}`;
  
  let nodeHtml = '';
  
  switch (node.type) {
    case 'heading':
      nodeHtml = `${indent}<h2 class="spec-heading ${levelClass}"${anchorAttr}>${escapeHtml(node.text || '')}</h2>`;
      break;
    
    case 'list-item':
      const listMarker = node.listMarker || '';
      nodeHtml = `${indent}<div class="spec-list-item ${levelClass}"${anchorAttr}>
${indent}  <span class="list-marker">${escapeHtml(listMarker)}</span>
${indent}  <span class="list-text">${escapeHtml(node.text || '')}</span>
${indent}</div>`;
      break;
    
    case 'paragraph':
      nodeHtml = `${indent}<p class="spec-paragraph ${levelClass}"${anchorAttr}>${escapeHtml(node.text || '')}</p>`;
      break;
    
    case 'table-placeholder':
      nodeHtml = `${indent}<div class="spec-table-placeholder ${levelClass}"${anchorAttr}>[Table placeholder]</div>`;
      break;
    
    case 'section-break':
      nodeHtml = `${indent}<hr class="spec-section-break" />`;
      break;
    
    default:
      nodeHtml = `${indent}<div class="spec-node ${levelClass}"${anchorAttr}>${escapeHtml(node.text || '')}</div>`;
  }
  
  // Add children if present
  if (node.children && node.children.length > 0) {
    const childrenHtml = node.children.map(child => generateNodeHtml(child, depth + 1)).join('\n');
    nodeHtml += '\n' + childrenHtml;
  }
  
  return nodeHtml;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

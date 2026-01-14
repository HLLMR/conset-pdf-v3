/**
 * Architecture Invariant Smoke Tests
 * 
 * These tests verify that the core architecture invariants are maintained:
 * - Only src/analyze/* loads PDFs / reads bytes / creates PDF.js documents
 * - PageContext caching remains intact
 * - Planner stays decoupled from detection (locator seam preserved)
 * 
 * These tests use code search and instrumentation rather than full PDF parsing
 * to keep them fast and CI-friendly.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function getAllTsFiles(dir: string, fileList: string[] = []): string[] {
  const files = readdirSync(dir);
  
  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    
    if (stat.isDirectory() && !file.includes('node_modules') && file !== 'dist') {
      getAllTsFiles(filePath, fileList);
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      fileList.push(filePath);
    }
  }
  
  return fileList;
}

describe('Architecture Invariants', () => {
  const coreSrcDir = join(process.cwd(), 'packages', 'core', 'src');
  const cliSrcDir = join(process.cwd(), 'packages', 'cli', 'src');
  
  /**
   * Test: Only src/analyze/* may call getDocument()
   */
  test('getDocument() calls only in packages/core/src/analyze/*', () => {
    // Find all TypeScript files
    const files = getAllTsFiles(coreSrcDir);
    
    const violations: Array<{ file: string; line: number; content: string }> = [];
    
    for (const filePath of files) {
      let relativePath = filePath.replace(coreSrcDir + '\\', '').replace(coreSrcDir + '/', '');
      // Normalize path separators
      relativePath = relativePath.replace(/\\/g, '/');
      
      // Allow analyze/ (allowed) and utils/pdf.ts (legacy fallback)
      if (relativePath.startsWith('analyze/') || relativePath === 'utils/pdf.ts') {
        continue;
      }
      
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      
      // Check for getDocument calls
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Check for actual getDocument() calls, not just property checks
        if (line.includes('getDocument(')) {
          violations.push({
            file: relativePath,
            line: i + 1,
            content: line.trim(),
          });
        }
      }
    }
    
    if (violations.length > 0) {
      const violationList = violations
        .map(v => `  ${v.file}:${v.line} - ${v.content}`)
        .join('\n');
      throw new Error(
        `Found getDocument() calls outside packages/core/src/analyze/*:\n${violationList}\n` +
        `Only packages/core/src/analyze/* may call pdfjs.getDocument()`
      );
    }
  });
  
  /**
   * Test: Only src/analyze/* may read PDF bytes via fs.readFile
   */
  test('fs.readFile for PDFs only in packages/core/src/analyze/*', () => {
    const files = getAllTsFiles(coreSrcDir);
    
    const violations: Array<{ file: string; line: number; content: string }> = [];
    
    for (const filePath of files) {
      let relativePath = filePath.replace(coreSrcDir + '\\', '').replace(coreSrcDir + '/', '');
      // Normalize path separators
      relativePath = relativePath.replace(/\\/g, '/');
      
      // Allow analyze/ (allowed) and utils/pdf.ts (legacy fallback)
      if (relativePath.startsWith('analyze/') || relativePath === 'utils/pdf.ts') {
        continue;
      }
      
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      
      // Check for fs.readFile with PDF paths
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Look for patterns like: readFile(..., '.pdf') or readFile(pdfPath
        if (
          (line.includes('readFile') && line.includes('.pdf')) ||
          (line.includes('readFile') && line.includes('pdfPath'))
        ) {
          violations.push({
            file: relativePath,
            line: i + 1,
            content: line.trim(),
          });
        }
      }
    }
    
    if (violations.length > 0) {
      const violationList = violations
        .map(v => `  ${v.file}:${v.line} - ${v.content}`)
        .join('\n');
      throw new Error(
        `Found fs.readFile() for PDFs outside packages/core/src/analyze/*:\n${violationList}\n` +
        `Only packages/core/src/analyze/* may read PDF bytes`
      );
    }
  });
  
  /**
   * Test: No path-based detection functions in active merge-addenda path
   */
  test('No (pdfPath, pageIndex) detection in active merge-addenda path', () => {
    const coreFiles = getAllTsFiles(join(coreSrcDir, 'core'));
    const commandFiles = getAllTsFiles(join(cliSrcDir, 'commands'));
    
    const violations: Array<{ file: string; line: number; content: string }> = [];
    
    for (const filePath of [...coreFiles, ...commandFiles]) {
      const relativePath = filePath.replace(coreSrcDir + '\\', '').replace(coreSrcDir + '/', '').replace(cliSrcDir + '\\', '').replace(cliSrcDir + '/', '');
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      
      // Check for path-based detection patterns
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Look for patterns like: findSheetIdWithFullDetection(pdfPath, pageIndex
        if (
          line.includes('findSheetIdWithFullDetection') &&
          line.includes('pdfPath') &&
          !line.includes('docContext')
        ) {
          violations.push({
            file: relativePath,
            line: i + 1,
            content: line.trim(),
          });
        }
      }
    }
    
    if (violations.length > 0) {
      const violationList = violations
        .map(v => `  ${v.file}:${v.line} - ${v.content}`)
        .join('\n');
      throw new Error(
        `Found path-based detection in active merge-addenda path:\n${violationList}\n` +
        `Active path must use DocumentContext/PageContext, not (pdfPath, pageIndex)`
      );
    }
  });
  
  /**
   * Test: Planner uses locators (decoupled from detection)
   */
  test('Planner uses locator seam (not direct detection)', async () => {
    const plannerPath = join(coreSrcDir, 'core', 'planner.ts');
    const content = readFileSync(plannerPath, 'utf-8');
    
    // Planner should use locator.locate(), not direct detection functions
    const hasLocatorUsage = content.includes('locator.locate(');
    const hasDirectDetection = 
      content.includes('findSheetIdWithFullDetection(') ||
      content.includes('getBestDrawingsSheetId(') ||
      content.includes('getBestSpecsSectionId(');
    
    if (!hasLocatorUsage) {
      throw new Error('Planner does not use locator.locate() - planner must use locator seam');
    }
    
    if (hasDirectDetection) {
      // Allow getBestSpecsSectionId in SpecsSectionLocator (it's a text processor, not PDF loader)
      const allowedPattern = /getBestSpecsSectionId\(pageText/;
      if (!allowedPattern.test(content)) {
        throw new Error(
          'Planner contains direct detection calls - planner must use locators only'
        );
      }
    }
  });
});

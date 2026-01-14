#!/usr/bin/env node

/**
 * Verify Architecture Invariants
 * 
 * This script performs automated checks to ensure architecture invariants are maintained:
 * - Only src/analyze/* loads PDFs / reads bytes / creates PDF.js documents
 * - No path-based detection in active merge-addenda path
 * - Planner uses locator seam
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const coreSrcDir = join(projectRoot, 'packages', 'core', 'src');
const cliSrcDir = join(projectRoot, 'packages', 'cli', 'src');

function getAllTsFiles(dir, fileList = []) {
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

function checkGetDocumentCalls() {
  console.log('Checking getDocument() calls...');
  const files = getAllTsFiles(coreSrcDir);
  const violations = [];
  
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
    console.error('❌ VIOLATION: getDocument() calls outside packages/core/src/analyze/*:');
    violations.forEach(v => {
      console.error(`  ${v.file}:${v.line} - ${v.content}`);
    });
    return false;
  }
  
  console.log('✅ All getDocument() calls are in packages/core/src/analyze/*');
  return true;
}

function checkPdfReadFileCalls() {
  console.log('Checking fs.readFile() for PDFs...');
  const files = getAllTsFiles(coreSrcDir);
  const violations = [];
  
  for (const filePath of files) {
    let relativePath = filePath.replace(coreSrcDir + '\\', '').replace(coreSrcDir + '/', '');
    // Normalize path separators
    relativePath = relativePath.replace(/\\/g, '/');
    
    // Allow analyze/ and utils/pdf.ts (legacy fallback)
    if (relativePath.startsWith('analyze/') || relativePath === 'utils/pdf.ts') {
      continue;
    }
    
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (
        (line.includes('readFile') && (line.includes('.pdf') || line.includes('pdfPath')))
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
    console.error('❌ VIOLATION: fs.readFile() for PDFs outside packages/core/src/analyze/*:');
    violations.forEach(v => {
      console.error(`  ${v.file}:${v.line} - ${v.content}`);
    });
    return false;
  }
  
  console.log('✅ All fs.readFile() for PDFs are in packages/core/src/analyze/* or utils/pdf.ts (legacy)');
  return true;
}

function checkPathBasedDetection() {
  console.log('Checking for path-based detection in active merge-addenda path...');
  const coreFiles = getAllTsFiles(join(coreSrcDir, 'core'));
  const commandFiles = getAllTsFiles(join(cliSrcDir, 'commands'));
  const violations = [];
  
  for (const filePath of [...coreFiles, ...commandFiles]) {
    const relativePath = filePath.replace(coreSrcDir + '\\', '').replace(coreSrcDir + '/', '').replace(cliSrcDir + '\\', '').replace(cliSrcDir + '/', '');
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
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
    console.error('❌ VIOLATION: Path-based detection in active merge-addenda path:');
    violations.forEach(v => {
      console.error(`  ${v.file}:${v.line} - ${v.content}`);
    });
    return false;
  }
  
  console.log('✅ No path-based detection in active merge-addenda path');
  return true;
}

function checkLocatorSeam() {
  console.log('Checking planner uses locator seam...');
  const plannerPath = join(coreSrcDir, 'core', 'planner.ts');
  const content = readFileSync(plannerPath, 'utf-8');
  
  const hasLocatorUsage = content.includes('locator.locate(');
  const hasDirectDetection = 
    content.includes('findSheetIdWithFullDetection(') ||
    (content.includes('getBestDrawingsSheetId(') && !content.includes('getBestSpecsSectionId(pageText'));
  
  if (!hasLocatorUsage) {
    console.error('❌ VIOLATION: Planner does not use locator.locate()');
    return false;
  }
  
  if (hasDirectDetection) {
    console.error('❌ VIOLATION: Planner contains direct detection calls');
    return false;
  }
  
  console.log('✅ Planner uses locator seam correctly');
  return true;
}

// Run all checks
console.log('🔍 Verifying architecture invariants...\n');

const results = [
  checkGetDocumentCalls(),
  checkPdfReadFileCalls(),
  checkPathBasedDetection(),
  checkLocatorSeam(),
];

const allPassed = results.every(r => r === true);

console.log('\n' + '='.repeat(60));
if (allPassed) {
  console.log('✅ All architecture invariant checks passed!');
  process.exit(0);
} else {
  console.error('❌ Architecture invariant checks failed!');
  process.exit(1);
}

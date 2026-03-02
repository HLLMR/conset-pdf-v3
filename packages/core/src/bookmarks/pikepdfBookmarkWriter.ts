/**
 * PikepdfBookmarkWriter - Sidecar-based bookmark writer
 * 
 * Uses Python sidecar (pikepdf) for reliable cross-viewer bookmark writing.
 * 
 * Note: This implementation works with file paths rather than PDFDocument
 * in memory, since the sidecar operates on files.
 */

import type { BookmarkEntry } from '../utils/bookmarkWriter.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs/promises';
import * as os from 'os';

const execFileAsync = promisify(execFile);

/**
 * Find Python executable
 */
async function findPython(): Promise<string> {
  const candidates = ['python3', 'python', 'py'];
  
  for (const cmd of candidates) {
    try {
      await execFileAsync(cmd, ['--version']);
      return cmd;
    } catch (e) {
      // Try next candidate
      continue;
    }
  }
  
  throw new Error(
    'Python runtime not found. Please install Python 3.8+ from python.org ' +
    'or via your system package manager. Required for bookmark writing.'
  );
}

/**
 * Write bookmarks to PDF using sidecar (file-based)
 * 
 * This function works with file paths rather than PDFDocument in memory.
 * The execute phase should use this directly.
 */
export async function writeBookmarksViaSidecar(
  inputPdfPath: string,
  outputPdfPath: string,
  bookmarks: BookmarkEntry[],
  verbose: boolean = false
): Promise<void> {
  if (bookmarks.length === 0) {
    if (verbose) {
      console.log('  No bookmarks to create');
    }
    return;
  }
  
  // Find Python
  const pythonCmd = await findPython();
  
  // Get script path
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const scriptPath = path.join(__dirname, 'sidecar', 'bookmark-writer.py');
  
  // Create temporary file for bookmarks JSON
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'conset-pdf-bookmarks-'));
  const bookmarksJsonPath = path.join(tempDir, 'bookmarks.json');
  
  try {
    // Convert bookmarks to sidecar JSON format
    const sidecarBookmarks = convertToSidecarFormat(bookmarks);
    await fs.writeFile(bookmarksJsonPath, JSON.stringify({ bookmarks: sidecarBookmarks }, null, 2));
    
    // Invoke Python sidecar
    if (verbose) {
      console.log(`  Invoking Python sidecar: ${pythonCmd} ${scriptPath}`);
    }
    
    try {
      await execFileAsync(pythonCmd, [
        scriptPath,
        '--input', inputPdfPath,
        '--output', outputPdfPath,
        '--bookmarks-json', bookmarksJsonPath,
      ]);
    } catch (error: any) {
      // Check if it's a pikepdf import error
      if (error.stderr && error.stderr.includes('pikepdf')) {
        throw new Error(
          'pikepdf not installed. Run: pip install pikepdf>=8.0.0'
        );
      }
      const stderr = (error.stderr || '').toString().trim();
      throw new Error(`Sidecar execution failed: ${error.message}${stderr ? `\n${stderr}` : ''}`);
    }

    // Ensure sidecar actually created output file
    try {
      await fs.access(outputPdfPath);
    } catch {
      throw new Error(`Sidecar did not produce output PDF: ${outputPdfPath}`);
    }
    
    // Verify destinations are viewer-compatible using verifier script
    const verifierScriptPath = path.join(__dirname, 'sidecar', 'verify_outline_destinations.py');
    try {
      await fs.access(verifierScriptPath);
    } catch {
      if (verbose) {
        console.log(`  Warning: Verifier script not found, skipping viewer compatibility check`);
      }
      return;
    }

    try {
      const { stdout, stderr } = await execFileAsync(pythonCmd, [
        verifierScriptPath,
        outputPdfPath,
      ]);
      
      if (stderr) {
        if (verbose) {
          console.log(`  Verifier stderr: ${stderr}`);
        }
      }
      
      const verification = JSON.parse(stdout);
      if (verification.itemsInvalid > 0) {
        const issues = verification.issues.slice(0, 5).join('; ');
        throw new Error(
          `Viewer compatibility check failed: ${verification.itemsInvalid} item(s) have invalid destinations. ` +
          `First issues: ${issues}${verification.issues.length > 5 ? '...' : ''}`
        );
      }
      
      if (verbose && verification.issues.length > 0) {
        console.log(`  Viewer compatibility warnings: ${verification.issues.length} item(s) missing /A GoTo (recommended but not required)`);
      }
    } catch (error: any) {
      // Re-throw verification errors as they indicate broken output/destinations
      const stderr = (error.stderr || '').toString().trim();
      throw new Error(`Viewer compatibility verification failed: ${error.message}${stderr ? `\n${stderr}` : ''}`);
    }
    
    if (verbose) {
      console.log(`  Successfully wrote ${bookmarks.length} bookmark(s) via sidecar`);
    }
  } finally {
    // Cleanup temp files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}
  
/**
 * Convert BookmarkEntry[] to sidecar JSON format
 */
function convertToSidecarFormat(bookmarks: BookmarkEntry[]): Array<{
    title: string;
    level: number;
    pageIndex: number;
    fitType: 'XYZ' | 'Fit' | 'FitH' | null;
    top?: number | null;
    left?: number | null;
    zoom?: number | null;
    children: Array<unknown>;
  }> {
    // Convert to sidecar format with level information
    // Level is inferred from BookmarkEntry if available, otherwise determined by position
    // For now, we'll use a simple heuristic: if BookmarkEntry has level, use it
    return bookmarks.map((bookmark) => {
      // Try to infer level from bookmark structure
      // If bookmark has a level property, use it; otherwise default to 0
      const level = (bookmark as any).level ?? 0;
      
      return {
        title: bookmark.title,
        level,
        pageIndex: bookmark.pageIndex,
        fitType: 'Fit', // Use /Fit for maximum viewer compatibility (avoids /XYZ with null zoom)
        top: null,
        left: null,
        zoom: null,
        children: [],
      };
    });
  }

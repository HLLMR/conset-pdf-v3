/**
 * PyMuPDF extractor implementation
 * 
 * Uses Python sidecar (PyMuPDF) for high-fidelity layout transcript extraction.
 * Follows the same pattern as pikepdfBookmarkWriter.ts.
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import * as os from 'os';
import type { TranscriptExtractor, ExtractOptions, EngineInfo } from '../interfaces.js';
import type { LayoutTranscript } from '../types.js';

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
    'or via your system package manager. Required for transcript extraction.'
  );
}

/**
 * PyMuPDF extractor implementation
 * 
 * **Advanced/Expert API**: Direct access to the PyMuPDF extractor implementation.
 * For most use cases, use createTranscriptExtractor() which automatically selects
 * the best available extractor (PyMuPDF primary, PDF.js fallback).
 * 
 * Use this class directly when you need:
 * - Explicit control over which extractor to use
 * - Access to PyMuPDF-specific features
 * - Custom extractor configuration
 * 
 * **Requirements**: Python 3.8+ and PyMuPDF installed
 * 
 * @example
 * ```typescript
 * import { PyMuPDFExtractor, createTranscriptExtractor } from '@conset-pdf/core';
 * // Recommended: use factory
 * const extractor = createTranscriptExtractor();
 * // Advanced: use directly
 * const pymupdfExtractor = new PyMuPDFExtractor();
 * ```
 */
export class PyMuPDFExtractor implements TranscriptExtractor {
  async extractTranscript(
    pdfPath: string,
    options?: ExtractOptions
  ): Promise<LayoutTranscript> {
    const pythonCmd = await findPython();
    const scriptPath = this.getScriptPath();
    
    // Create temp file for output
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'conset-transcript-'));
    const outputPath = path.join(tempDir, 'transcript.json');
    
    try {
      const args = [
        scriptPath,
        '--input', pdfPath,
        '--output', outputPath,
      ];
      
      if (options?.pages) {
        args.push('--pages', options.pages.join(','));
      }
      
      if (options?.includeLines) {
        args.push('--include-lines');
      }
      
      try {
        await execFileAsync(pythonCmd, args);
      } catch (error: any) {
        // Check if it's a PyMuPDF import error
        if (error.stderr && error.stderr.includes('PyMuPDF')) {
          throw new Error(
            'PyMuPDF not installed. Run: pip install pymupdf>=1.24.0'
          );
        }
        throw new Error(`Extraction failed: ${error.message}`);
      }
      
      const transcriptJson = await fs.readFile(outputPath, 'utf-8');
      return JSON.parse(transcriptJson) as LayoutTranscript;
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }
  
  getEngineInfo(): EngineInfo {
    return {
      name: 'pymupdf',
      version: '1.24.0+', // Will be determined at runtime from Python script
      capabilities: ['text', 'bbox', 'fonts', 'tables', 'lines'],
    };
  }
  
  supportsFeature(feature: string): boolean {
    return ['text', 'bbox', 'fonts', 'tables', 'lines'].includes(feature);
  }
  
  private getScriptPath(): string {
    // Try dist first (production), then src (development)
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const distPath = path.join(__dirname, '..', 'sidecar', 'extract-transcript.py');
    
    // If running from src (development), look in src
    if (!existsSync(distPath)) {
      const srcPath = path.join(__dirname, '..', '..', '..', 'src', 'transcript', 'sidecar', 'extract-transcript.py');
      if (existsSync(srcPath)) {
        return srcPath;
      }
    }
    
    return distPath;
  }
}

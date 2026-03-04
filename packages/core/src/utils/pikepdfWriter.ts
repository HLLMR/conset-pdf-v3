/**
 * Pikepdf PDF Writer - Unified PDF write pathway via pikepdf sidecar
 * 
 * Provides a single, reliable PDF output mechanism backed by the pikepdf sidecar.
 * Uses atomic writes (temp + rename) for safety.
 * 
 * Supports multiple operation modes:
 * - passthrough: Safely write PDF via pikepdf (for deterministic output)
 * - bookmarks: Write bookmarks to PDF via pikepdf
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs/promises';
import * as os from 'os';
import { PDFDocument } from 'pdf-lib';

const execFileAsync = promisify(execFile);

/**
 * Find Python executable (same logic as in pikepdfBookmarkWriter)
 */
async function findPython(): Promise<string> {
  const candidates = process.platform === 'win32'
    ? ['python', 'py', 'python3']
    : ['python3', 'python', 'py'];
  
  for (const cmd of candidates) {
    try {
      await execFileAsync(cmd, ['--version']);
      return cmd;
    } catch (e) {
      continue;
    }
  }
  
  throw new Error(
    'Python runtime not found. Please install Python 3.8+ from python.org ' +
    'or via your system package manager. Required for PDF writing.'
  );
}

export interface PikepdfWriteError extends Error {
  exitCode?: number;
  stderr?: string;
  stdout?: string;
  context?: Record<string, any>;
}

/**
 * Create a PikepdfWriteError with context
 */
function createPikepdfError(
  message: string,
  exitCode?: number,
  stderr?: string,
  stdout?: string,
  context?: Record<string, any>
): PikepdfWriteError {
  const error = new Error(message) as PikepdfWriteError;
  error.name = 'PikepdfWriteError';
  error.exitCode = exitCode;
  error.stderr = stderr;
  error.stdout = stdout;
  error.context = context || {};
  return error;
}

export interface WritePdfOptions {
  verbose?: boolean;
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Additional context for error reporting */
  context?: Record<string, any>;
}

/**
 * Write a PDF document using the pikepdf sidecar
 * 
 * This is the primary PDF write pathway for merge and other operations.
 * Uses atomic writes (write to temp, rename) for data safety.
 * 
 * @param pdfDoc - PDF document to write (will be saved to temp first)
 * @param outputPath - Final output path
 * @param options - Write options
 * @throws PikepdfWriteError - If sidecar fails (includes code, stderr, context)
 */
export async function writePdfWithPikepdf(
  pdfDoc: PDFDocument,
  outputPath: string,
  options: WritePdfOptions = {}
): Promise<void> {
  const verbose = options.verbose || false;
  const timeout = options.timeout || 60000;
  const errorContext = options.context || {};

  // Step 1: Save PDFDocument to temp file
  let tempInputPath: string | null = null;
  try {
    if (verbose) {
      console.log(`  [pikepdfWriter] Saving PDF to temp file before sidecar`);
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'conset-pdf-write-'));
    tempInputPath = path.join(tempDir, 'input.pdf');

    const bytes = await pdfDoc.save();
    await fs.writeFile(tempInputPath, bytes);

    if (verbose) {
      console.log(`  [pikepdfWriter] Temp input: ${tempInputPath}`);
    }
  } catch (error: any) {
    throw createPikepdfError(
      `Failed to save PDF to temp file: ${error?.message || String(error)}`,
      undefined,
      undefined,
      undefined,
      { ...errorContext, phase: 'temp-save' }
    );
  }

  // Step 2: Write temp output path
  const tempDir = path.dirname(tempInputPath);
  const tempOutputPath = path.join(tempDir, 'output.pdf');

  try {
    // Find Python
    const pythonCmd = await findPython();

    // Get script path
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    let scriptPath = path.join(__dirname, '../bookmarks/sidecar', 'bookmark-writer.py');

    // Handle ASAR unpacking in Electron
    if (scriptPath.includes('.asar') && !scriptPath.includes('.asar.unpacked')) {
      scriptPath = scriptPath.replace(/\.asar[\\\/]/, '.asar.unpacked' + path.sep);
    }

    if (verbose) {
      console.log(`  [pikepdfWriter] Invoking sidecar: ${pythonCmd} ${scriptPath}`);
    }

    try {
      const { stderr, stdout } = await execFileAsync(pythonCmd, [
        scriptPath,
        '--input', tempInputPath,
        '--output', tempOutputPath,
        '--mode', 'passthrough',  // New mode: just write PDF via pikepdf without modifications
      ], { timeout });

      if (stderr) {
        if (verbose) {
          console.log(`  [pikepdfWriter] Sidecar stderr: ${stderr}`);
        }
      }

      // Ensure output was created
      try {
        await fs.access(tempOutputPath);
      } catch {
        throw createPikepdfError(
          `Sidecar did not produce output PDF: ${tempOutputPath}`,
          undefined,
          stderr,
          stdout,
          { ...errorContext, phase: 'sidecar', missingOutput: true }
        );
      }

      if (verbose) {
        console.log(`  [pikepdfWriter] Sidecar completed successfully`);
      }
    } catch (error: any) {
      // Check for known error conditions
      if (error.stderr && error.stderr.includes('pikepdf')) {
        throw createPikepdfError(
          'pikepdf not installed. Run: pip install pikepdf>=8.0.0',
          error.code,
          error.stderr,
          error.stdout,
          { ...errorContext, phase: 'sidecar', missingDependency: true }
        );
      }

      const stderr = (error.stderr || '').toString().trim();
      const stdout = (error.stdout || '').toString().trim();
      
      throw createPikepdfError(
        `Sidecar execution failed: ${error.message}`,
        error.code,
        stderr,
        stdout,
        { ...errorContext, phase: 'sidecar' }
      );
    }

    // Step 3: Atomically rename temp output to final output
    try {
      if (verbose) {
        console.log(`  [pikepdfWriter] Moving ${tempOutputPath} → ${outputPath}`);
      }

      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      await fs.mkdir(outputDir, { recursive: true });

      // Atomic rename (overwrites existing file)
      await fs.rename(tempOutputPath, outputPath);

      if (verbose) {
        console.log(`  [pikepdfWriter] Successfully wrote PDF: ${outputPath}`);
      }
    } catch (error: any) {
      throw createPikepdfError(
        `Failed to write output PDF: ${error?.message || String(error)}`,
        undefined,
        undefined,
        undefined,
        { ...errorContext, phase: 'atomic-rename', outputPath }
      );
    }
  } finally {
    // Cleanup temp directory
    try {
      if (tempInputPath) {
        const tempDir = path.dirname(tempInputPath);
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    } catch (e) {
      // Ignore cleanup errors
      if (verbose) {
        console.log(`  [pikepdfWriter] Warning: Could not clean temp directory: ${e}`);
      }
    }
  }
}

/**
 * Alternative: Write PDF from file path without loading into memory
 * Useful for operations that already have temp files
 * 
 * @param inputPath - Path to input PDF to passthrough
 * @param outputPath - Final output path
 * @param options - Write options
 * @throws PikepdfWriteError - If sidecar fails
 */
export async function writePdfFileThroughPikepdf(
  inputPath: string,
  outputPath: string,
  options: WritePdfOptions = {}
): Promise<void> {
  const verbose = options.verbose || false;
  const timeout = options.timeout || 60000;
  const errorContext = options.context || {};

  // Create temp output path
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'conset-pdf-passthrough-'));
  const tempOutputPath = path.join(tempDir, 'output.pdf');

  try {
    // Find Python
    const pythonCmd = await findPython();

    // Get script path
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    let scriptPath = path.join(__dirname, '../bookmarks/sidecar', 'bookmark-writer.py');

    // Handle ASAR unpacking in Electron
    if (scriptPath.includes('.asar') && !scriptPath.includes('.asar.unpacked')) {
      scriptPath = scriptPath.replace(/\.asar[\\\/]/, '.asar.unpacked' + path.sep);
    }

    if (verbose) {
      console.log(`  [pikepdfWriter] Invoking sidecar (passthrough): ${pythonCmd} ${scriptPath}`);
    }

    try {
      const { stderr, stdout } = await execFileAsync(pythonCmd, [
        scriptPath,
        '--input', inputPath,
        '--output', tempOutputPath,
        '--mode', 'passthrough',
      ], { timeout });

      if (stderr) {
        if (verbose) {
          console.log(`  [pikepdfWriter] Sidecar stderr: ${stderr}`);
        }
      }

      // Ensure output was created
      try {
        await fs.access(tempOutputPath);
      } catch {
        throw createPikepdfError(
          `Sidecar did not produce output PDF`,
          undefined,
          stderr,
          stdout,
          { ...errorContext, phase: 'sidecar', missingOutput: true }
        );
      }
    } catch (error: any) {
      if (error.stderr && error.stderr.includes('pikepdf')) {
        throw createPikepdfError(
          'pikepdf not installed. Run: pip install pikepdf>=8.0.0',
          error.code,
          error.stderr,
          error.stdout,
          { ...errorContext, missingDependency: true }
        );
      }

      const stderr = (error.stderr || '').toString().trim();
      const stdout = (error.stdout || '').toString().trim();
      
      throw createPikepdfError(
        `Sidecar execution failed: ${error.message}`,
        error.code,
        stderr,
        stdout,
        { ...errorContext, phase: 'sidecar' }
      );
    }

    // Atomically rename temp output to final output
    try {
      if (verbose) {
        console.log(`  [pikepdfWriter] Moving ${tempOutputPath} → ${outputPath}`);
      }

      const outputDir = path.dirname(outputPath);
      await fs.mkdir(outputDir, { recursive: true });
      await fs.rename(tempOutputPath, outputPath);

      if (verbose) {
        console.log(`  [pikepdfWriter] Successfully wrote PDF: ${outputPath}`);
      }
    } catch (error: any) {
      throw createPikepdfError(
        `Failed to write output PDF: ${error?.message || String(error)}`,
        undefined,
        undefined,
        undefined,
        { ...errorContext, phase: 'atomic-rename', outputPath }
      );
    }
  } finally {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      if (verbose) {
        console.log(`  [pikepdfWriter] Warning: Could not clean temp directory: ${e}`);
      }
    }
  }
}

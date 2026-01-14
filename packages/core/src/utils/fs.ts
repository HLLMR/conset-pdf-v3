import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Ensure a directory exists, creating it if necessary
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a JSON file
 */
export async function readJson<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

/**
 * Write a JSON file
 */
export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Get all PDF files in a directory
 */
export async function getPdfFiles(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const pdfFiles: string[] = [];

  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      pdfFiles.push(path.join(dirPath, entry.name));
    }
  }

  return pdfFiles.sort();
}

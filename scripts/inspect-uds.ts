/**
 * Quick script to list sheets in UDS.xlsx
 */

import XLSX from 'xlsx';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const udsPath = path.join(__dirname, '..', '..', '.reference', 'UDS.xlsx');
const workbook = XLSX.readFile(udsPath);

console.log('Sheets in UDS.xlsx:');
console.log(workbook.SheetNames);

// Show first few rows of each sheet
workbook.SheetNames.forEach(sheetName => {
  console.log(`\n=== Sheet: "${sheetName}" ===`);
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  console.log('Headers:', data[0]);
  console.log('Row count:', data.length);
});

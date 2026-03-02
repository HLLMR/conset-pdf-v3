import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const copies = [
  {
    from: path.join(rootDir, 'src', 'bookmarks', 'sidecar'),
    to: path.join(rootDir, 'dist', 'bookmarks', 'sidecar'),
  },
  {
    from: path.join(rootDir, 'src', 'transcript', 'sidecar'),
    to: path.join(rootDir, 'dist', 'transcript', 'sidecar'),
  },
];

await Promise.all(
  copies.map(async ({ from, to }) => {
    await mkdir(path.dirname(to), { recursive: true });
    await cp(from, to, { recursive: true });
  })
);

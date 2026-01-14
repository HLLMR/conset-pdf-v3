#!/usr/bin/env node

(async () => {
  try {
    await import('../dist/cli.js');
  } catch (error) {
    console.error('Error loading conset-pdf:', error);
    process.exit(1);
  }
})();

#!/usr/bin/env node

import { Command } from 'commander';
import { mergeAddendaCommand } from './commands/mergeAddenda.js';
import { splitSetCommand } from './commands/splitSet.js';
import { assembleSetCommand } from './commands/assembleSet.js';
import { detectCommand } from './commands/detect.js';
import { specsPatchCommand } from './commands/specsPatch.js';
import { fixBookmarksCommand } from './commands/fixBookmarks.js';
import { specsInventoryCommand } from './commands/specsInventory.js';
import { debugWalkthroughCommand } from './commands/debugWalkthrough.js';

const program = new Command();

program
  .name('conset-pdf')
  .description('CLI for merging addenda and managing construction document sets')
  .version('1.0.0');

// Add subcommands
mergeAddendaCommand(program);
splitSetCommand(program);
assembleSetCommand(program);
detectCommand(program);
specsPatchCommand(program);
fixBookmarksCommand(program);
specsInventoryCommand(program);
debugWalkthroughCommand(program);

// Parse arguments
program.parse();

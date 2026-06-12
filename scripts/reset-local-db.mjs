#!/usr/bin/env node
// Reset the local D1 sqlite database by removing the .wrangler state directory.
// Use this when migrations need to be re-run from scratch.

import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const stateDir = join(process.cwd(), '.wrangler', 'state');

if (!existsSync(stateDir)) {
  console.log('No local state to reset (.wrangler/state does not exist).');
  process.exit(0);
}

rmSync(stateDir, { recursive: true, force: true });
console.log(`Removed ${stateDir}.`);
console.log('Run `npm run db:migrate:local` to recreate.');

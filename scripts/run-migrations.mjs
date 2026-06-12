#!/usr/bin/env node
// Run all migration files in ./migrations in order.
// Usage:
//   node scripts/run-migrations.mjs           # production
//   node scripts/run-migrations.mjs --local   # local sqlite

import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const isLocal = process.argv.includes('--local');
const dbName = 'carwash-booking-db';
const migrationsDir = join(process.cwd(), 'migrations');

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql') && !f.startsWith('seed'))
  .sort();

if (files.length === 0) {
  console.error('No migration files found in', migrationsDir);
  process.exit(1);
}

console.log(`Running ${files.length} migration(s) against ${dbName} ${isLocal ? '(LOCAL)' : '(PROD)'}\n`);

let failed = 0;
for (const file of files) {
  const fullPath = join('./migrations', file);
  const args = ['wrangler', 'd1', 'execute', dbName];
  args.push(isLocal ? '--local' : '--remote');
  args.push('--file', fullPath);

  console.log(`-> ${file}`);
  const result = spawnSync('npx', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    console.error(`   FAILED (exit ${result.status})`);
    failed++;
    if (!isLocal) {
      console.error('Production migration failed — STOPPING. Inspect state before re-running.');
      process.exit(1);
    }
  } else {
    console.log('   ok');
  }
}

if (failed > 0) {
  console.error(`\n${failed} migration(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${files.length} migration(s) applied successfully.`);

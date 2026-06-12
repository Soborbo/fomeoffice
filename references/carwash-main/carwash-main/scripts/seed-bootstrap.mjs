#!/usr/bin/env node
// One-time bootstrap: seed a super_admin and a worker into D1.
// Uses Web Crypto (Node 22+) — same PBKDF2 params as src/lib/auth/password.ts.
//
// Usage:
//   node scripts/seed-bootstrap.mjs                       # local sqlite
//   node scripts/seed-bootstrap.mjs --remote              # production D1
//
// Env (override defaults):
//   SEED_SUPER_ADMIN_NAME        (default: 'Laszlo')
//   SEED_SUPER_ADMIN_EMAIL       (default: 'admin@bristolcarwash.co.uk')
//   SEED_SUPER_ADMIN_PASSWORD    (default: 'changeme123' — CHANGE ME)
//   SEED_WORKER_NAME             (default: 'Default Worker')
//   SEED_WORKER_PIN              (default: '1234' — CHANGE ME)

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { webcrypto } from 'node:crypto';

const subtle = webcrypto.subtle;
const ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

const isRemote = process.argv.includes('--remote');
const dbName = 'carwash-booking-db';

const superName = process.env.SEED_SUPER_ADMIN_NAME ?? 'Laszlo';
const superEmail = (process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@bristolcarwash.co.uk').toLowerCase();
const superPassword = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'changeme123';
const workerName = process.env.SEED_WORKER_NAME ?? 'Default Worker';
const workerPin = process.env.SEED_WORKER_PIN ?? '1234';

if (!/^\d{4,8}$/.test(workerPin)) {
  console.error('SEED_WORKER_PIN must be 4-8 digits');
  process.exit(1);
}

const superCreds = await hash(superPassword);
const workerCreds = await hash(workerPin);

const sql = `-- Bootstrap seed (idempotent)
INSERT OR IGNORE INTO workers (name, role, email, password_hash, password_salt, hired_at)
VALUES (
  '${escapeSql(superName)}',
  'super_admin',
  '${escapeSql(superEmail)}',
  '${escapeSql(superCreds.hash)}',
  '${escapeSql(superCreds.salt)}',
  date('now')
);

UPDATE workers
SET password_hash = '${escapeSql(superCreds.hash)}',
    password_salt = '${escapeSql(superCreds.salt)}',
    role = 'super_admin',
    name = '${escapeSql(superName)}',
    active = 1
WHERE email = '${escapeSql(superEmail)}' AND deleted_at IS NULL;

INSERT OR IGNORE INTO workers (name, role, pin_hash, pin_salt, hired_at)
VALUES (
  '${escapeSql(workerName)}',
  'worker',
  '${escapeSql(workerCreds.hash)}',
  '${escapeSql(workerCreds.salt)}',
  date('now')
);

UPDATE workers
SET pin_hash = '${escapeSql(workerCreds.hash)}',
    pin_salt = '${escapeSql(workerCreds.salt)}',
    active = 1
WHERE name = '${escapeSql(workerName)}' AND role = 'worker' AND deleted_at IS NULL;
`;

const tmpDir = mkdtempSync(join(tmpdir(), 'carwash-seed-'));
const tmpFile = join(tmpDir, 'seed.sql');
writeFileSync(tmpFile, sql, 'utf8');

const args = ['wrangler', 'd1', 'execute', dbName];
args.push(isRemote ? '--remote' : '--local');
args.push('--file', tmpFile);

console.log(`Seeding ${dbName} ${isRemote ? '(REMOTE)' : '(LOCAL)'}`);
console.log(`  super_admin: ${superEmail}`);
console.log(`  worker:      ${workerName} (PIN ${workerPin.length} digits)`);

const result = spawnSync('npx', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

try {
  rmSync(tmpDir, { recursive: true, force: true });
} catch {}

if (result.status !== 0) {
  console.error(`Seed failed (exit ${result.status})`);
  process.exit(1);
}

console.log('\nDone. Sign in at /login with the super admin email + password.');
console.log('Tablet PIN unlock at /board uses the worker PIN.');

// ---------------------------------------------------------------------------

async function hash(secret) {
  const salt = webcrypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    KEY_LENGTH * 8,
  );
  return {
    hash: bytesToBase64(new Uint8Array(bits)),
    salt: bytesToBase64(salt),
  };
}

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

// Worker PIN verification for /board.
// Workers authenticate per request — no sessions for the tablet flow.
// PINs are stored as PBKDF2 hash + salt in the workers table.

import type { DB } from '../db';
import type { WorkerRole } from '../../env';
import { verifySecret } from './password';

export interface VerifiedWorker {
  id: number;
  name: string;
  role: WorkerRole;
}

interface WorkerPinRow {
  id: number;
  name: string;
  role: WorkerRole;
  pin_hash: string;
  pin_salt: string;
}

// Sweep all active workers and try each one's PIN. PBKDF2 is slow (100K iters
// per check) so this is O(N × 100K hashes); fine for a small staff (~5-15 ppl)
// behind a /board unlock. Add rate limiting once we observe abuse.
export async function verifyWorkerPin(
  db: DB,
  pin: string,
): Promise<VerifiedWorker | null> {
  const cleaned = pin.trim();
  if (!/^\d{4,8}$/.test(cleaned)) return null;

  const result = await db
    .prepare(
      `SELECT id, name, role, pin_hash, pin_salt
       FROM live_workers
       WHERE active = 1 AND pin_hash IS NOT NULL AND pin_salt IS NOT NULL`,
    )
    .all<WorkerPinRow>();

  for (const row of result.results ?? []) {
    if (await verifySecret(cleaned, row.pin_hash, row.pin_salt)) {
      return { id: row.id, name: row.name, role: row.role };
    }
  }
  return null;
}

// Check the single legacy BOARD_PIN env var. Used as a fallback during the
// per-worker PIN cutover. Returns true if it matches.
// Setting `board_pin_legacy_fallback=0` in the settings table disables it.
export async function isLegacyFallbackEnabled(db: DB): Promise<boolean> {
  const row = await db
    .prepare(`SELECT value FROM settings WHERE key = 'board_pin_legacy_fallback'`)
    .first<{ value: string }>();
  return row?.value === '1';
}

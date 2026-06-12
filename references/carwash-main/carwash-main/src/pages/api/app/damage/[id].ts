// GET / PATCH / DELETE /api/app/damage/[id]

export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import {
  getDamageReport,
  parsePhotoKeys,
  softDeleteDamageReport,
  updateDamageReport,
} from '../../../../lib/db/damage';
import { getWorkerById } from '../../../../lib/db/staff';
import { auditLog } from '../../../../lib/audit/log';
import { UpdateDamageSchema } from '../../../../lib/validation/damage';

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'Invalid id' }, 400);

  const db = getDb();
  const row = await getDamageReport(db, id);
  if (!row) return json({ error: 'Not found' }, 404);
  return json({ report: row, photo_keys: parsePhotoKeys(row.photo_r2_keys) });
};

export const PATCH: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);
  const user = locals.user;
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'Invalid id' }, 400);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const parsed = UpdateDamageSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid input', issues: parsed.error.flatten() }, 400);
  }
  const input = parsed.data;

  const db = getDb();
  const before = await getDamageReport(db, id);
  if (!before) return json({ error: 'Not found' }, 404);

  if (input.worker_responsible) {
    const w = await getWorkerById(db, input.worker_responsible);
    if (!w) return json({ error: 'Unknown worker_responsible' }, 400);
  }

  await updateDamageReport(db, id, {
    resolution: input.resolution !== undefined ? (input.resolution || null) : undefined,
    resolution_status: input.resolution_status,
    compensation_amount: input.compensation_amount ?? undefined,
    worker_responsible: input.worker_responsible ?? undefined,
    resolved_by: input.resolution_status === 'resolved' ? user.id : null,
  });

  const after = await getDamageReport(db, id);

  await auditLog(db, {
    performedBy: user.id,
    action: 'damage.update',
    entityType: 'damage_report',
    entityId: id,
    before: {
      resolution_status: before.resolution_status,
      resolution: before.resolution,
      compensation_amount: before.compensation_amount,
      worker_responsible: before.worker_responsible,
    },
    after: after
      ? {
          resolution_status: after.resolution_status,
          resolution: after.resolution,
          compensation_amount: after.compensation_amount,
          worker_responsible: after.worker_responsible,
        }
      : null,
    request,
  });

  return json({ success: true, report: after });
};

export const DELETE: APIRoute = async ({ request, params, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, 401);
  if (locals.user.role !== 'super_admin') {
    return json({ error: 'Super admin only' }, 403);
  }
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'Invalid id' }, 400);

  const db = getDb();
  const before = await getDamageReport(db, id);
  if (!before) return json({ error: 'Not found' }, 404);

  const deleted = await softDeleteDamageReport(db, id, locals.user.id);
  if (!deleted) return json({ error: 'Not found' }, 404);

  await auditLog(db, {
    performedBy: locals.user.id,
    action: 'damage.delete',
    entityType: 'damage_report',
    entityId: id,
    before: {
      resolution_status: before.resolution_status,
      category: before.category,
      occurred_at: before.occurred_at,
    },
    request,
  });

  return json({ success: true });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

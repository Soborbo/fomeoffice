export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import {
  buildClearSessionCookie,
  deleteSession,
  readSessionCookie,
} from '../../../lib/auth/session';
import { auditLog } from '../../../lib/audit/log';

export const POST: APIRoute = async ({ request, locals }) => {
  const token = readSessionCookie(request);
  if (token) {
    const db = getDb();
    if (locals.user) {
      await auditLog(db, {
        performedBy: locals.user.id,
        action: 'auth.logout',
        entityType: 'worker',
        entityId: locals.user.id,
        request,
      });
    }
    await deleteSession(db, token);
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': buildClearSessionCookie(),
    },
  });
};

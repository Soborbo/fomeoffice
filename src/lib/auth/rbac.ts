// Role-based access control helpers.

import type { WorkerRole } from '../../env';

export const ROLE_HIERARCHY: Record<WorkerRole, number> = {
  worker: 1,
  admin: 2,
  super_admin: 3,
};

export function hasRoleAtLeast(actual: WorkerRole, required: WorkerRole): boolean {
  return ROLE_HIERARCHY[actual] >= ROLE_HIERARCHY[required];
}

// Returns the minimum role required for a given pathname, or null if public.
// /admin/* requires super_admin (settings, audit log, staff payments, dashboards).
// /app/* requires admin minimum (daily form, expenses, damage reports).
// /board is publicly served HTML; the API enforces PIN auth separately.
export function getRequiredRoleForPath(pathname: string): WorkerRole | null {
  if (pathname.startsWith('/admin')) return 'super_admin';
  if (pathname.startsWith('/app/expenses')) return 'admin';
  if (pathname.startsWith('/app/staff/manage')) return 'admin';
  if (pathname.startsWith('/app/daily')) return 'admin';
  if (pathname.startsWith('/app/damage')) return 'admin';
  if (pathname.startsWith('/app/cash-deposits')) return 'admin';
  if (pathname.startsWith('/app')) return 'worker';
  if (pathname.startsWith('/api/admin')) return 'super_admin';
  if (pathname.startsWith('/api/app/staff/me')) return 'worker';
  if (pathname.startsWith('/api/app')) return 'admin';
  return null;
}

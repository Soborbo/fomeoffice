// Astro middleware: paraglide i18n + session-based auth + RBAC.
// Workers do NOT use sessions — /board enforces PIN per API request.
// /login, /board, /, marketing pages, public APIs are unprotected.

import { defineMiddleware, sequence } from 'astro:middleware';
import { paraglideMiddleware } from './paraglide/server.js';
import { getDb } from './lib/db';
import {
  getSessionUser,
  readSessionCookie,
  buildClearSessionCookie,
  SESSION_COOKIE_NAME,
} from './lib/auth/session';
import { getRequiredRoleForPath, hasRoleAtLeast } from './lib/auth/rbac';

const PUBLIC_PATH_PREFIXES = [
  '/_image',
  '/_actions',
  '/api/booking',
  '/api/bookings',
  '/api/contact',
  '/api/auth',
  '/api/cron',
  '/api/locale',
  '/board',
  '/login',
  '/images',
  '/favicon',
];

const PUBLIC_EXACT = new Set<string>([
  '/',
  '/sitemap.xml',
  '/sitemap-0.xml',
  '/robots.txt',
]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }
  // Marketing service pages live at top-level slugs (eg. /car-wash-bristol).
  // CRM routes always start with /admin or /app.
  if (
    !pathname.startsWith('/admin') &&
    !pathname.startsWith('/app') &&
    !pathname.startsWith('/api/admin') &&
    !pathname.startsWith('/api/app')
  ) {
    return true;
  }
  return false;
}

const i18nMiddleware = defineMiddleware((context, next) => {
  return paraglideMiddleware(context.request, ({ request }) => next(request));
});

const authMiddleware = defineMiddleware(async (context, next) => {
  const { url, locals, request, cookies } = context;

  if (isPublicPath(url.pathname)) {
    return next();
  }

  const required = getRequiredRoleForPath(url.pathname);
  if (!required) {
    return next();
  }

  const token = readSessionCookie(request);
  if (!token) {
    return redirectToLogin(url);
  }

  let user;
  try {
    const db = getDb();
    user = await getSessionUser(db, token);
  } catch (err) {
    console.error('[middleware] session lookup failed:', err);
    return new Response('Internal error', { status: 500 });
  }

  if (!user) {
    cookies.set(SESSION_COOKIE_NAME, '', { path: '/', maxAge: 0 });
    const res = redirectToLogin(url);
    res.headers.append('set-cookie', buildClearSessionCookie());
    return res;
  }

  if (!hasRoleAtLeast(user.role, required)) {
    return new Response('Forbidden', { status: 403 });
  }

  locals.user = user;
  return next();
});

export const onRequest = sequence(i18nMiddleware, authMiddleware);

function redirectToLogin(url: URL): Response {
  // Worker self-service has its own PIN keypad login. Send unauthenticated
  // visitors there directly so they don't have to bounce off the
  // email+password form first.
  const isWorkerPath = url.pathname.startsWith('/app/staff/me');
  const loginPath = isWorkerPath ? '/staff/login' : '/login';
  const target = new URL(loginPath, url);
  if (url.pathname !== loginPath) {
    target.searchParams.set('next', url.pathname + url.search);
  }
  return new Response(null, { status: 302, headers: { location: target.toString() } });
}

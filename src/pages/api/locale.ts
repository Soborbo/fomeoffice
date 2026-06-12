// POST /api/locale — set the PARAGLIDE_LOCALE cookie + redirect back.
//
// Public route (no auth). The cookie name and max-age come from the paraglide
// runtime config so they stay in sync if the locale settings change.

export const prerender = false;

import type { APIRoute } from 'astro';
import { cookieName, cookieMaxAge, locales, type Locale } from '../../paraglide/runtime.js';

export const POST: APIRoute = async ({ request, redirect, cookies }) => {
  let locale: string | null = null;
  let returnTo = '/';

  const ct = request.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try {
      const body = (await request.json()) as { locale?: string; return_to?: string };
      locale = body.locale ?? null;
      if (typeof body.return_to === 'string') returnTo = body.return_to;
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } else {
    const form = await request.formData();
    locale = (form.get('locale') as string) || null;
    returnTo = (form.get('return_to') as string) || '/';
  }

  if (!locale || !locales.includes(locale as Locale)) {
    return new Response(JSON.stringify({ error: 'Invalid locale' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Trust-boundary: only allow same-origin paths in return_to (defense
  // against open-redirect via /api/locale?return_to=https://evil/).
  if (!returnTo.startsWith('/') || returnTo.startsWith('//')) {
    returnTo = '/';
  }

  cookies.set(cookieName, locale, {
    path: '/',
    maxAge: cookieMaxAge,
    httpOnly: false, // paraglide reads this on both server and client
    sameSite: 'lax',
    secure: new URL(request.url).protocol === 'https:',
  });

  // Form posts redirect; JSON posts return the locale (so the client can reload).
  if (ct.includes('application/json')) {
    return new Response(JSON.stringify({ success: true, locale }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return redirect(returnTo, 303);
};

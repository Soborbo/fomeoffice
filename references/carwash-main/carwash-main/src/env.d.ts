/// <reference path="../.astro/types.d.ts" />
/// <reference types="@cloudflare/workers-types" />

export type WorkerRole = 'worker' | 'admin' | 'super_admin';

export interface AuthUser {
  id: number;
  name: string;
  role: WorkerRole;
  email: string | null;
}

declare global {
  interface Env {
    // Bindings
    DB: D1Database;
    R2_BUCKET: R2Bucket;

    // Vars
    R2_BUCKET_NAME: string;
    SITE_URL: string;

    // Secrets — set via `wrangler secret put` (or .dev.vars locally)
    RESEND_API_KEY: string;
    TURNSTILE_SECRET_KEY: string;
    TURNSTILE_SITE_KEY: string;
    GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
    GOOGLE_PRIVATE_KEY: string;
    GOOGLE_SPREADSHEET_ID: string;
    BOARD_PIN: string;
    R2_ACCOUNT_ID: string;
    R2_ACCESS_KEY_ID: string;
    R2_SECRET_ACCESS_KEY: string;
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
    STRIPE_PUBLIC_KEY: string;
    ADMIN_SESSION_SECRET: string;
    CRON_SECRET: string;
    ANTHROPIC_API_KEY: string;
    // Convenience env-fallback for the admin login. When set, /api/auth/login
    // accepts ADMIN_EMAIL+ADMIN_PASSWORD even if the workers table lookup fails.
    // The matching workers row is auto-created/updated as super_admin so the
    // session + audit log have a stable worker_id to attach to.
    ADMIN_EMAIL: string;
    ADMIN_PASSWORD: string;
  }

  type Runtime = import('@astrojs/cloudflare').Runtime<Env>;

  namespace App {
    interface Locals extends Runtime {
      user?: AuthUser;
    }
  }
}

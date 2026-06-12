// Cron-pinger Worker — fires the CRM's scheduled email tasks.
//
// The main app (an Astro/Cloudflare worker) can't export a `scheduled`
// handler, so this tiny companion worker owns the cron triggers and POSTs
// to the app's token-authenticated /api/cron/run endpoint.
//
// Deploy:   npm run deploy:cron
// Secret:   wrangler secret put CRON_SECRET -c wrangler-cron.json
//           (must match the CRON_SECRET set on the main app worker)
//
// Cron triggers run in UTC. The shop closes at 19:00 UK time, so the
// reminder slots below fire 5/20 minutes after close in winter (GMT) and
// an hour later during BST — both tasks no-op once the daily form is
// filled, so the drift is harmless.

const TASK_BY_CRON = {
  '5 19 * * *': 'close-reminder', // nudge admin if daily form missing
  '20 19 * * *': 'super-escalation', // escalate to super_admin
  '0 22 * * *': 'daily-summary', // end-of-day rollup email
};

export default {
  async scheduled(controller, env) {
    const task = TASK_BY_CRON[controller.cron] ?? 'all';
    const url = `${env.SITE_URL}/api/cron/run?task=${task}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'x-cron-secret': env.CRON_SECRET ?? '' },
    });

    const body = await res.text();
    if (!res.ok) {
      // Throw so the run shows as failed in Cloudflare's cron metrics.
      throw new Error(`cron task ${task} failed: HTTP ${res.status} ${body}`);
    }
    console.log(`cron task ${task} ok: ${body}`);
  },
};

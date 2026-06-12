// Cron task orchestrator. Public surface used by /api/cron/run.

import type { DB } from '../db';
import { runDailySummary, type DailySummaryResult } from './daily-summary';
import { runCloseReminder, type ReminderResult } from './close-reminder';

export type CronTask =
  | 'daily-summary'
  | 'close-reminder'
  | 'super-escalation'
  | 'all';

export type CronRunResult =
  | { task: 'daily-summary'; result: DailySummaryResult }
  | { task: 'close-reminder'; result: ReminderResult }
  | { task: 'super-escalation'; result: ReminderResult };

export interface RunCronOptions {
  db: DB;
  resendApiKey: string;
  task: CronTask;
}

export async function runCron(opts: RunCronOptions): Promise<CronRunResult[]> {
  const { db, resendApiKey, task } = opts;

  const tasks: Exclude<CronTask, 'all'>[] =
    task === 'all' ? ['close-reminder', 'super-escalation', 'daily-summary'] : [task];

  const out: CronRunResult[] = [];
  for (const t of tasks) {
    if (t === 'daily-summary') {
      const r = await runDailySummary({ db, resendApiKey });
      out.push({ task: 'daily-summary', result: r });
    } else if (t === 'close-reminder') {
      const r = await runCloseReminder({ db, resendApiKey, level: 'admin' });
      out.push({ task: 'close-reminder', result: r });
    } else if (t === 'super-escalation') {
      const r = await runCloseReminder({ db, resendApiKey, level: 'super_admin' });
      out.push({ task: 'super-escalation', result: r });
    }
  }
  return out;
}

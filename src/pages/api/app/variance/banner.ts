// Variance banner data feed.
// GET /api/app/variance/banner → today + week + pattern flag.

export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import {
  computeExpectedTotals,
  detectShortPattern,
  getDailySummary,
  getRecentSummaries,
  getSettingsBatch,
} from '../../../../lib/db/daily';
import { todayInTimezone } from '../../../../lib/db/walkins';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const db = getDb();
  const today = todayInTimezone();

  const [summary, expected, recent, settings] = await Promise.all([
    getDailySummary(db, today),
    computeExpectedTotals(db, today),
    getRecentSummaries(db, today, 7),
    getSettingsBatch(db, [
      'cash_variance_threshold',
      'cash_variance_pattern_days',
      'currency',
    ]),
  ]);

  const threshold = parseInt(settings.cash_variance_threshold ?? '500', 10);
  const patternDays = parseInt(
    settings.cash_variance_pattern_days ?? '4',
    10,
  );

  const pattern = detectShortPattern(recent, patternDays, threshold);

  // Today: if no summary yet, return the live expected totals only (filled=false).
  // If submitted, return actual + variance.
  const todayPayload = summary
    ? {
        date: today,
        filled: true,
        is_locked: summary.is_locked === 1,
        expected_cash: summary.expected_cash ?? 0,
        expected_card: summary.expected_card ?? 0,
        cash_total: summary.cash_total,
        card_total: summary.card_total,
        cash_variance: summary.cash_variance ?? 0,
        card_variance: summary.card_variance ?? 0,
      }
    : {
        date: today,
        filled: false,
        is_locked: false,
        expected_cash: expected.expected_cash,
        expected_card: expected.expected_card,
        cash_total: 0,
        card_total: 0,
        cash_variance: 0,
        card_variance: 0,
      };

  // Week: aggregate variance over recent rows.
  const weekVariance = recent.reduce(
    (acc, r) => acc + (r.cash_variance ?? 0),
    0,
  );

  return json({
    today: todayPayload,
    week: {
      days: recent.length,
      cash_variance: weekVariance,
      rows: recent.map((r) => ({
        date: r.date,
        cash_variance: r.cash_variance ?? 0,
      })),
    },
    pattern: {
      triggered: pattern.triggered,
      consecutive_short_days: pattern.consecutiveShortDays,
      total_shortfall: pattern.totalShortfall,
      threshold_days: patternDays,
    },
    settings: {
      cash_variance_threshold: threshold,
      currency: settings.currency ?? 'GBP',
    },
  });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

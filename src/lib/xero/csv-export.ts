// Xero-friendly CSV export. Goal: produce a clean CSV that maps cleanly in
// Xero's import wizard for either UK Sales (revenue) or UK Purchases
// (expenses). Format intentionally generic so the user can pick the right
// account codes during import; we don't bake account codes into the export.

import type { DB } from '../db';

export type XeroExportType = 'invoices' | 'expenses';

export interface XeroExportRow {
  date: string;          // YYYY-MM-DD
  contact_name: string;
  contact_email?: string | null;
  reference: string;     // INV number / booking id / expense id
  description: string;
  amount_pence: number;  // gross
  vat_pence: number;     // 0 if not VAT registered
  net_pence: number;     // amount - vat (computed if not provided)
  payment_method: string;
  source: string;        // 'booking' | 'walkin' | 'expense' | category for expenses
}

// ============================================================================
// SALES (invoices) — bookings done + walkin_transactions
// ============================================================================
export async function fetchSalesRows(
  db: DB,
  from: string,
  to: string,
): Promise<XeroExportRow[]> {
  const [bookings, walkins] = await db.batch<{
    date: string;
    contact_name: string;
    email: string | null;
    reference: string;
    description: string;
    amount_pence: number;
    payment_method: string | null;
  }>([
    db
      .prepare(
        `SELECT
           b.date AS date,
           TRIM(b.first_name || ' ' || b.last_name) AS contact_name,
           b.email AS email,
           CAST(b.id AS TEXT) AS reference,
           (b.vehicle_label || ' - ' || b.service_label) AS description,
           b.price AS amount_pence,
           b.payment_method AS payment_method
         FROM live_bookings b
         WHERE b.date >= ? AND b.date <= ?
           AND b.status = 'done' AND b.payment_method IS NOT NULL
         ORDER BY b.date ASC, b.id ASC`,
      )
      .bind(from, to),
    db
      .prepare(
        `SELECT
           w.date AS date,
           COALESCE(c.first_name || ' ' || c.last_name, 'Walk-in customer') AS contact_name,
           w.customer_email AS email,
           ('WI-' || CAST(w.id AS TEXT)) AS reference,
           (UPPER(SUBSTR(w.car_size, 1, 1)) || SUBSTR(w.car_size, 2) || ' car wash (' ||
             CASE w.service_type
               WHEN 'inside_only'        THEN 'inside only'
               WHEN 'outside_only'       THEN 'outside only'
               WHEN 'inside_and_outside' THEN 'inside & outside'
               ELSE w.service_type
             END || ')') AS description,
           w.price AS amount_pence,
           w.payment_method AS payment_method
         FROM live_walkin_transactions w
         LEFT JOIN customers c ON c.id = w.customer_id
         WHERE w.date >= ? AND w.date <= ?
         ORDER BY w.date ASC, w.id ASC`,
      )
      .bind(from, to),
  ]);

  const out: XeroExportRow[] = [];
  for (const b of bookings.results ?? []) {
    out.push(toXeroRow(b, 'booking'));
  }
  for (const w of walkins.results ?? []) {
    out.push(toXeroRow(w, 'walkin'));
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

function toXeroRow(
  src: {
    date: string;
    contact_name: string;
    email: string | null;
    reference: string;
    description: string;
    amount_pence: number;
    payment_method: string | null;
  },
  source: 'booking' | 'walkin',
): XeroExportRow {
  return {
    date: src.date,
    contact_name: src.contact_name || (source === 'walkin' ? 'Walk-in customer' : 'Customer'),
    contact_email: src.email,
    reference: src.reference,
    description: src.description,
    amount_pence: src.amount_pence,
    vat_pence: 0,           // computed at render time if VAT registered
    net_pence: src.amount_pence,
    payment_method: src.payment_method ?? '',
    source,
  };
}

// ============================================================================
// PURCHASES (expenses) — live_expenses joined to vendor + linked staff payment
// ============================================================================
export async function fetchExpenseRows(
  db: DB,
  from: string,
  to: string,
): Promise<XeroExportRow[]> {
  const result = await db
    .prepare(
      `SELECT
         e.date AS date,
         COALESCE(NULLIF(e.vendor, ''), w.name, 'Expense') AS contact_name,
         CAST(e.id AS TEXT) AS reference,
         COALESCE(NULLIF(e.description, ''), e.category) AS description,
         e.amount AS amount_pence,
         e.vat_amount AS vat_pence,
         e.method AS payment_method,
         e.category AS category
       FROM live_expenses e
       LEFT JOIN live_staff_payments sp ON sp.id = e.staff_payment_id
       LEFT JOIN workers w ON w.id = sp.worker_id
       WHERE e.date >= ? AND e.date <= ?
       ORDER BY e.date ASC, e.id ASC`,
    )
    .bind(from, to)
    .all<{
      date: string;
      contact_name: string;
      reference: string;
      description: string;
      amount_pence: number;
      vat_pence: number;
      payment_method: string;
      category: string;
    }>();

  return (result.results ?? []).map((e) => ({
    date: e.date,
    contact_name: e.contact_name,
    contact_email: null,
    reference: e.reference,
    description: e.description,
    amount_pence: e.amount_pence,
    vat_pence: e.vat_pence ?? 0,
    net_pence: (e.amount_pence ?? 0) - (e.vat_pence ?? 0),
    payment_method: e.payment_method,
    source: e.category,
  }));
}

// ============================================================================
// CSV serialisation — RFC 4180-ish, money rendered as "12.34" (pounds with
// 2 decimals), header row first.
// ============================================================================
const SALES_HEADERS = [
  'Date',
  'ContactName',
  'EmailAddress',
  'Reference',
  'Description',
  'Amount',
  'VAT',
  'Net',
  'PaymentMethod',
  'Source',
];

const PURCHASES_HEADERS = [
  'Date',
  'ContactName',
  'Reference',
  'Description',
  'Amount',
  'VAT',
  'Net',
  'PaymentMethod',
  'Category',
];

export function rowsToCsv(rows: XeroExportRow[], type: XeroExportType): string {
  const headers = type === 'invoices' ? SALES_HEADERS : PURCHASES_HEADERS;
  const lines: string[] = [headers.join(',')];

  for (const r of rows) {
    const cols =
      type === 'invoices'
        ? [
            r.date,
            r.contact_name,
            r.contact_email ?? '',
            r.reference,
            r.description,
            penceToPounds(r.amount_pence),
            penceToPounds(r.vat_pence),
            penceToPounds(r.net_pence),
            r.payment_method,
            r.source,
          ]
        : [
            r.date,
            r.contact_name,
            r.reference,
            r.description,
            penceToPounds(r.amount_pence),
            penceToPounds(r.vat_pence),
            penceToPounds(r.net_pence),
            r.payment_method,
            r.source,
          ];
    lines.push(cols.map(csvEscape).join(','));
  }
  return lines.join('\n') + '\n';
}

function penceToPounds(pence: number): string {
  if (!Number.isFinite(pence)) return '0.00';
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(pence);
  const pounds = Math.floor(abs / 100);
  const pennies = abs % 100;
  return sign + pounds + '.' + (pennies < 10 ? '0' + pennies : pennies);
}

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  // Excel/Sheets execute cells starting with = + - @ (or tab/CR) as formulas,
  // so user-controlled text (vendor names, descriptions, customer names) could
  // run code on the accountant's machine. Prefix a single quote — except for
  // plain numbers, where a leading '-' is a legitimate negative amount.
  const formulaRisk = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s);
  const guarded = formulaRisk ? "'" + s : s;
  if (guarded.includes(',') || guarded.includes('"') || guarded.includes('\n') || guarded.includes('\r')) {
    return '"' + guarded.replace(/"/g, '""') + '"';
  }
  return guarded;
}

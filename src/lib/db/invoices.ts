// Invoice helpers — number generation, insert, list, mark sent/failed,
// customer_visits insertion (loyalty schema preparation).
//
// Number format: INV-<YYYY>-<NNNN> where YYYY is the calendar year at the
// moment of issue and NNNN is the zero-padded global counter from settings.
// The counter is monotonically increasing across years (no annual reset),
// which keeps numbers unique forever and avoids cross-year collision races.

import type { DB } from './index';

export type InvoiceSendStatus = 'pending' | 'sent' | 'failed' | 'bounced';

// ============================================================================
// ATOMIC NUMBER GENERATION
// ============================================================================
export interface IssuedInvoiceNumber {
  invoice_number: string;
  counter: number;
}

export async function issueInvoiceNumber(
  db: DB,
  prefix: string,
): Promise<IssuedInvoiceNumber> {
  // UPDATE ... RETURNING gives us the new value atomically. SQLite/D1 wraps
  // the read+write in a single statement, so two concurrent issuers cannot
  // both observe the same pre-increment value.
  const row = await db
    .prepare(
      `UPDATE settings
         SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)
       WHERE key = 'invoice_number_counter'
       RETURNING value`,
    )
    .first<{ value: string }>();

  if (!row) throw new Error('invoice_number_counter setting missing');
  const counter = parseInt(row.value, 10);
  const year = new Date().getUTCFullYear();
  const padded = String(counter).padStart(4, '0');
  return {
    invoice_number: `${prefix}-${year}-${padded}`,
    counter,
  };
}

// ============================================================================
// LINE ITEM SHAPE — what we serialise into items_json
// ============================================================================
export interface InvoiceLineItem {
  description: string;
  qty: number;
  unit_price: number; // pence
  total: number;      // pence
}

// ============================================================================
// INSERT — does NOT send the email; caller does that and then calls
// markInvoiceSent / markInvoiceFailed.
// ============================================================================
export interface InsertInvoiceInput {
  invoice_number: string;
  booking_id?: number | null;
  walkin_id?: number | null;
  customer_id?: number | null;
  customer_email: string;
  customer_name?: string | null;
  amount: number;
  vat_amount?: number;
  items: InvoiceLineItem[];
  marketing_opt_in?: boolean;
}

export async function insertInvoice(
  db: DB,
  input: InsertInvoiceInput,
): Promise<number> {
  if (!input.booking_id && !input.walkin_id) {
    throw new Error('Invoice must reference either a booking or a walkin');
  }
  const result = await db
    .prepare(
      `INSERT INTO invoices
         (invoice_number, booking_id, walkin_id, customer_id,
          customer_email, customer_name,
          amount, vat_amount, items_json, marketing_opt_in,
          send_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
    )
    .bind(
      input.invoice_number,
      input.booking_id ?? null,
      input.walkin_id ?? null,
      input.customer_id ?? null,
      input.customer_email.toLowerCase(),
      input.customer_name ?? null,
      input.amount,
      input.vat_amount ?? 0,
      JSON.stringify(input.items),
      input.marketing_opt_in ? 1 : 0,
    )
    .run();
  return Number(result.meta.last_row_id);
}

export async function markInvoiceSent(
  db: DB,
  id: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE invoices
         SET send_status = 'sent',
             sent_at = CURRENT_TIMESTAMP,
             send_error = NULL
       WHERE id = ?`,
    )
    .bind(id)
    .run();
}

export async function markInvoiceFailed(
  db: DB,
  id: number,
  error: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE invoices
         SET send_status = 'failed',
             send_error = ?
       WHERE id = ?`,
    )
    .bind(error.slice(0, 500), id)
    .run();
}

// ============================================================================
// CUSTOMER VISITS — loyalty schema. Triggered alongside invoice insert.
// trg_customer_visit_insert in 0006 bumps customers.total_spent + visit_count.
// ============================================================================
export async function insertCustomerVisit(
  db: DB,
  customerId: number,
  visitDate: string,
  amountSpent: number,
  bookingId: number | null,
  walkinId: number | null,
  packageUsed: string | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO customer_visits
         (customer_id, visit_date, booking_id, walkin_id, amount_spent, package_used)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(customerId, visitDate, bookingId, walkinId, amountSpent, packageUsed)
    .run();
}

// ============================================================================
// ROW SHAPES + LIST
// ============================================================================
export interface InvoiceRow {
  id: number;
  invoice_number: string;
  booking_id: number | null;
  walkin_id: number | null;
  customer_id: number | null;
  customer_email: string;
  customer_name: string | null;
  amount: number;
  vat_amount: number;
  net_amount: number;
  items_json: string;
  marketing_opt_in: number;
  sent_at: string | null;
  send_status: InvoiceSendStatus;
  send_error: string | null;
  created_at: string;
}

export interface ListInvoicesFilter {
  from?: string;
  to?: string;
  status?: InvoiceSendStatus;
  limit?: number;
}

export async function listInvoices(
  db: DB,
  filter: ListInvoicesFilter,
): Promise<InvoiceRow[]> {
  const conditions: string[] = [];
  const args: unknown[] = [];
  if (filter.from) {
    conditions.push("date(created_at) >= ?");
    args.push(filter.from);
  }
  if (filter.to) {
    conditions.push("date(created_at) <= ?");
    args.push(filter.to);
  }
  if (filter.status) {
    conditions.push('send_status = ?');
    args.push(filter.status);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 1000);
  args.push(limit);

  const result = await db
    .prepare(
      `SELECT * FROM live_invoices ${where} ORDER BY id DESC LIMIT ?`,
    )
    .bind(...args)
    .all<InvoiceRow>();
  return result.results ?? [];
}

export async function getInvoice(
  db: DB,
  id: number,
): Promise<InvoiceRow | null> {
  return db
    .prepare(`SELECT * FROM live_invoices WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<InvoiceRow>();
}

// ============================================================================
// PARSE LINE ITEMS — defensive parser for items_json
// ============================================================================
export function parseLineItems(json: string | null): InvoiceLineItem[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is InvoiceLineItem =>
        typeof x === 'object' &&
        x !== null &&
        typeof x.description === 'string' &&
        typeof x.qty === 'number' &&
        typeof x.unit_price === 'number' &&
        typeof x.total === 'number',
    );
  } catch {
    return [];
  }
}

// Booking + customer dedup helpers. All reads MUST go through live_* views.

import type { DB } from './index';

export type BookingStatus =
  | 'pending'
  | 'in_progress'
  | 'done'
  | 'no_show'
  | 'cancelled';

const BOARD_STATUS_TO_DB: Record<string, BookingStatus> = {
  '': 'pending',
  Done: 'done',
  'No Show': 'no_show',
};

const DB_STATUS_TO_BOARD: Record<BookingStatus, string> = {
  pending: '',
  in_progress: '',
  done: 'Done',
  no_show: 'No Show',
  cancelled: '',
};

export function boardStatusToDb(value: string | null | undefined): BookingStatus {
  const v = (value ?? '').trim();
  return BOARD_STATUS_TO_DB[v] ?? 'pending';
}

export function dbStatusToBoard(status: BookingStatus): string {
  return DB_STATUS_TO_BOARD[status] ?? '';
}

// "£12.50" / "£12" / "£12 - £15" / "" -> integer pence (lowest if range)
export function priceStringToPence(input: string | null | undefined): number {
  if (!input) return 0;
  const cleaned = String(input).replace(/[£,]/g, '').trim();
  if (!cleaned) return 0;
  // Take the first number found (handles "20-25" or "from 20")
  const match = cleaned.match(/(\d+)(?:\.(\d{1,2}))?/);
  if (!match) return 0;
  const pounds = parseInt(match[1], 10);
  const pennies = match[2] ? parseInt(match[2].padEnd(2, '0').slice(0, 2), 10) : 0;
  return pounds * 100 + pennies;
}

export function penceToPriceString(pence: number): string {
  if (!Number.isFinite(pence)) return '';
  if (pence % 100 === 0) return `£${Math.floor(pence / 100)}`;
  const pounds = Math.floor(pence / 100);
  const remainder = pence % 100;
  return `£${pounds}.${String(remainder).padStart(2, '0')}`;
}

export interface InsertBookingInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  vehicleType: 'car' | 'suv' | 'van' | 'caravan' | 'motorhome' | 'supercar';
  vehicleLabel: string;
  serviceCode: string;
  serviceLabel: string;
  pricePence: number;
  date: string; // ISO YYYY-MM-DD
  time: string | null; // 'HH:MM' or null
  source?: 'website' | 'walk_in' | 'admin' | 'phone';
  customerId?: number | null;
  customerNote?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
}

export async function insertBooking(db: DB, input: InsertBookingInput): Promise<number> {
  const startsAt =
    input.time && /^\d{2}:\d{2}$/.test(input.time)
      ? `${input.date}T${input.time}:00`
      : null;

  const result = await db
    .prepare(
      `INSERT INTO bookings
        (customer_id, first_name, last_name, email, phone,
         service_code, service_label, vehicle_type, vehicle_label,
         price, date, time, starts_at, status, source,
         customer_note,
         gclid, fbclid, utm_source, utm_medium, utm_campaign, utm_term, utm_content)
       VALUES (?, ?, ?, ?, ?,
               ?, ?, ?, ?,
               ?, ?, ?, ?, 'pending', ?,
               ?,
               ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.customerId ?? null,
      input.firstName,
      input.lastName,
      input.email.toLowerCase(),
      input.phone,
      input.serviceCode,
      input.serviceLabel,
      input.vehicleType,
      input.vehicleLabel,
      input.pricePence,
      input.date,
      input.time,
      startsAt,
      input.source ?? 'website',
      input.customerNote ?? null,
      input.gclid ?? null,
      input.fbclid ?? null,
      input.utmSource ?? null,
      input.utmMedium ?? null,
      input.utmCampaign ?? null,
      input.utmTerm ?? null,
      input.utmContent ?? null,
    )
    .run();

  return Number(result.meta.last_row_id);
}

export async function setBookingSheetRow(
  db: DB,
  bookingId: number,
  sheetRow: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE bookings
       SET sheet_row = ?, sheet_synced_at = datetime('now')
       WHERE id = ?`,
    )
    .bind(sheetRow, bookingId)
    .run();
}

export async function findOrCreateCustomerByEmail(
  db: DB,
  email: string,
  fallback: { firstName: string; lastName: string; phone: string | null },
): Promise<number> {
  const lc = email.toLowerCase();
  const existing = await db
    .prepare(`SELECT id FROM live_customers WHERE email = ? LIMIT 1`)
    .bind(lc)
    .first<{ id: number }>();
  if (existing) return existing.id;

  // Two concurrent bookings for the same brand-new email would both pass the
  // existence check and race to INSERT. The unique index on customers(email)
  // makes the loser throw; INSERT OR IGNORE + re-select returns the winner's
  // id cleanly.
  const fullName = `${fallback.firstName} ${fallback.lastName}`.trim() || lc;
  await db
    .prepare(
      `INSERT OR IGNORE INTO customers (name, first_name, last_name, email, phone)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(fullName, fallback.firstName, fallback.lastName, lc, fallback.phone)
    .run();

  const row = await db
    .prepare(`SELECT id FROM live_customers WHERE email = ? LIMIT 1`)
    .bind(lc)
    .first<{ id: number }>();
  if (!row) {
    throw new Error('Failed to find or insert customer for ' + lc);
  }
  return row.id;
}

export interface BoardBookingRow {
  row: number; // D1 booking id (kept name for /board frontend compatibility)
  submitted: string;
  firstName: string;
  lastName: string;
  vehicle: string;
  service: string;
  price: string;
  phone: string;
  email: string;
  date: string;
  time: string;
  status: string;
}

interface BookingDbRow {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  service_label: string;
  vehicle_label: string;
  price: number;
  date: string;
  time: string | null;
  status: BookingStatus;
  created_at: string;
}

export async function listBoardBookings(db: DB, limit = 500): Promise<BoardBookingRow[]> {
  const result = await db
    .prepare(
      `SELECT id, first_name, last_name, email, phone,
              service_label, vehicle_label, price,
              date, time, status, created_at
       FROM live_bookings
       WHERE status != 'cancelled'
       ORDER BY date DESC, time DESC, id DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<BookingDbRow>();

  return (result.results ?? []).map((r) => ({
    row: r.id,
    submitted: formatSubmittedTimestamp(r.created_at),
    firstName: r.first_name,
    lastName: r.last_name,
    vehicle: r.vehicle_label,
    service: r.service_label,
    price: penceToPriceString(r.price),
    phone: r.phone ?? '',
    email: r.email,
    date: formatDateLabel(r.date),
    time: r.time ? formatTimeLabel(r.time) : '',
    status: dbStatusToBoard(r.status),
  }));
}

// CRM list row — everything an admin needs without opening a detail page.
export interface CrmBookingRow {
  id: number;
  created_at: string;
  date: string;
  time: string | null;
  status: BookingStatus;
  payment_method: 'cash' | 'card' | 'bank_transfer' | null;
  source: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  vehicle_label: string;
  service_label: string;
  price: number;
  customer_id: number | null;
  has_invoice: number;
}

export interface ListBookingsFilter {
  from?: string;
  to?: string;
  status?: BookingStatus;
  search?: string;
  limit?: number;
}

export async function listBookingsForCrm(
  db: DB,
  f: ListBookingsFilter,
): Promise<CrmBookingRow[]> {
  const where: string[] = [];
  const binds: (string | number)[] = [];

  if (f.from) { where.push('b.date >= ?'); binds.push(f.from); }
  if (f.to) { where.push('b.date <= ?'); binds.push(f.to); }
  if (f.status) { where.push('b.status = ?'); binds.push(f.status); }
  if (f.search) {
    // Case-insensitive substring on name/email/phone. Phone normalization
    // would be nice but a LIKE catches "07977" / "977" / "@gmail" equally.
    const needle = `%${f.search.toLowerCase()}%`;
    where.push(
      `(LOWER(b.first_name) LIKE ? OR LOWER(b.last_name) LIKE ? OR LOWER(b.email) LIKE ? OR LOWER(COALESCE(b.phone, '')) LIKE ?)`,
    );
    binds.push(needle, needle, needle, needle);
  }

  const limit = Math.min(Math.max(f.limit ?? 200, 1), 1000);
  binds.push(limit);

  const sql = `SELECT
       b.id, b.created_at, b.date, b.time, b.status, b.payment_method, b.source,
       b.first_name, b.last_name, b.email, b.phone,
       b.vehicle_label, b.service_label, b.price, b.customer_id,
       CASE WHEN i.id IS NULL THEN 0 ELSE 1 END AS has_invoice
     FROM live_bookings b
     LEFT JOIN live_invoices i ON i.booking_id = b.id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY b.created_at DESC, b.id DESC
     LIMIT ?`;

  const result = await db.prepare(sql).bind(...binds).all<CrmBookingRow>();
  return result.results ?? [];
}

export interface BookingForUpdate {
  id: number;
  status: BookingStatus;
  payment_method: 'cash' | 'card' | 'bank_transfer' | null;
  sheet_row: number | null;
}

export async function getBookingForUpdate(
  db: DB,
  id: number,
): Promise<BookingForUpdate | null> {
  return db
    .prepare(
      `SELECT id, status, payment_method, sheet_row FROM live_bookings WHERE id = ? LIMIT 1`,
    )
    .bind(id)
    .first<BookingForUpdate>();
}

export async function updateBookingStatus(
  db: DB,
  id: number,
  newStatus: BookingStatus,
  paymentMethod: 'cash' | 'card' | 'bank_transfer' | null = null,
): Promise<void> {
  // deleted_at filter so we can never resurrect or mutate a soft-deleted row.
  await db
    .prepare(
      `UPDATE bookings
       SET status = ?, payment_method = ?
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(newStatus, paymentMethod, id)
    .run();
}

export interface BookingForInvoice {
  id: number;
  customer_id: number | null;
  first_name: string;
  last_name: string;
  email: string;
  service_label: string;
  vehicle_label: string;
  price: number;
  payment_method: string | null;
  date: string;
}

export async function getBookingForInvoice(
  db: DB,
  id: number,
): Promise<BookingForInvoice | null> {
  return db
    .prepare(
      `SELECT id, customer_id, first_name, last_name, email,
              service_label, vehicle_label, price, payment_method, date
       FROM live_bookings
       WHERE id = ?
       LIMIT 1`,
    )
    .bind(id)
    .first<BookingForInvoice>();
}

export async function bookingHasInvoice(
  db: DB,
  bookingId: number,
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS x FROM live_invoices WHERE booking_id = ? LIMIT 1`)
    .bind(bookingId)
    .first<{ x: number }>();
  return !!row;
}

export async function walkinHasInvoice(
  db: DB,
  walkinId: number,
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 AS x FROM live_invoices WHERE walkin_id = ? LIMIT 1`)
    .bind(walkinId)
    .first<{ x: number }>();
  return !!row;
}

// Format helpers — keep Sheets-style display strings so /board frontend
// continues to work without changes.

function formatSubmittedTimestamp(iso: string): string {
  // SQLite returns 'YYYY-MM-DD HH:MM:SS' (UTC). Convert to UK display.
  const [datePart, timePart] = iso.split(/[T ]/);
  if (!datePart || !timePart) return iso;
  const [yyyy, mm, dd] = datePart.split('-');
  const [hh, min] = timePart.split(':');
  return `${dd}/${mm}/${yyyy}, ${hh}:${min}`;
}

function formatDateLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatTimeLabel(time: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return time;
  const h = parseInt(m[1], 10);
  const min = m[2];
  const suffix = h < 12 ? 'am' : 'pm';
  const display = h === 0 ? 12 : h <= 12 ? h : h - 12;
  return `${display}:${min}${suffix}`;
}

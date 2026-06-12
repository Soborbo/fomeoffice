# Bristol Car Wash CRM — User Guide

This guide covers everything you can do behind the `/login` screen: the daily
reconciliation, expenses, damage reports, invoices, cash deposits, staff
management, and the admin dashboards. The public booking site and the in-store
`/board` tablet are described only where they intersect with the CRM.

---

## 1. Who can sign in?

The CRM has three roles. Each role builds on the one below it.

| Role | Sign-in URL | What they can do |
| --- | --- | --- |
| **worker** | `/staff/login` (PIN keypad) | View their own page (`/app/staff/me`), use the in-store board. |
| **admin** | `/login` (email + password) | Everything under `/app` — daily reconciliation, expenses, damage, invoices, cash deposits. |
| **super_admin** | `/login` (email + password) | Everything an admin can do, plus `/admin` (KPIs, charts, staff payments, coupons, Xero export). |

If you forget which URL to use: visit `/login` and click "Staff PIN sign-in →"
at the bottom; visit `/staff/login` and click "Admin sign-in →".

Sessions last 30 days from the moment you log in. If a super-admin disables
your account or deletes you, your session stops working immediately.

---

## 2. The two-step order flow

Read this section first — it explains why a booking shows up in some places
and not others.

1. **A customer books on the website.** Their booking lands in D1 with
   `status='pending'` and no payment method. The customer gets a confirmation
   email; the office gets a notification email. The row also appears in the
   Google Sheets mirror.
2. **The customer arrives.** A worker unlocks `/board` with their PIN.
3. **The worker marks the booking Done.** A small modal pops up asking *Cash
   or Card?* Once the worker taps one, the booking transitions to
   `status='done'` with the chosen `payment_method`. **This is the moment
   the booking starts counting toward CRM revenue, daily reconciliation,
   and the admin dashboard.** It also triggers an invoice email to the
   customer.
4. **If the customer is a no-show.** The worker taps "No Show". The booking
   does *not* count toward revenue, but it does stay on the board (greyed
   out) for record-keeping.

Walk-in customers (drive-ups who didn't book online) are logged via the
"+ Add walk-in" button on `/board`. That flow already asks for cash or card,
so walk-ins always count toward revenue.

> **If a "Done" booking ever shows up as missing from the daily form**, it's
> because the row in D1 has `status='done'` but the payment method was never
> recorded. The CRM treats those legacy rows as **cash** by default so they
> remain visible — but new bookings always capture the explicit choice on the
> board now, so this only affects historical data.

---

## 3. `/app` — admin landing page

After signing in, an admin lands on `/app`. The page lists shortcuts to the
sections they have access to:

- **Bookings** (`/app/bookings`)
- **Daily reconciliation** (`/app/daily`)
- **Expenses** (`/app/expenses`)
- **Damage reports** (`/app/damage`)
- **Invoices** (`/app/invoices`)
- **Cash deposits** (`/app/cash-deposits`)
- **Board** (`/board` — the in-store tablet view, PIN required)
- **Admin** (`/admin` — super-admin only)

At the top of every page is a **variance banner**. It shows today's expected
cash (live from the board) and, once you submit the daily form, the
variance (counted minus expected). The pill turns:

- **grey** — the day hasn't been reconciled yet.
- **green** — counted cash matches expected exactly.
- **yellow** — variance is within the threshold (default £5).
- **red** — variance is above the threshold; notes are required when saving.

A red "Pattern alert" appears if you've been short on cash for several days in
a row. That's a cue to investigate (staff, machine, or counting error).

---

## 4. `/app/bookings` — Bookings list

This is the page that shows every website booking the moment it arrives —
before anyone touches `/board`.

### What you see

- **Filters**: date range (defaults to last 30 days), status, and a search
  box that matches first name, last name, email, or phone (substring).
- **Summary line**: total count in the current filter, how many are still
  pending, and the sum of "done" revenue.
- **Table** (newest first):

  | Column | What it means |
  | --- | --- |
  | Received | When the booking arrived (UK time). |
  | Visit date | The date and optional time the customer chose. |
  | Customer | Full name + email + phone. |
  | Vehicle / service | Vehicle label + service label. |
  | Price | Estimated price in pounds. |
  | Status | Pending / In progress / Done / No show / Cancelled. |
  | Payment | Cash / Card if marked Done; "—" otherwise. |
  | Source | Where the booking came from (`website`, `walk_in`, `admin`, `phone`). |

### What the statuses mean

- **Pending** — the customer booked online; nobody has marked them done yet.
- **In progress** — reserved for an in-store flow that's not wired up
  client-side yet (no UI sets this today).
- **Done** — a worker tapped Done on `/board` and chose Cash or Card.
  Counts toward CRM revenue.
- **No show** — the customer never arrived. Doesn't count toward revenue.
- **Cancelled** — administratively cancelled (no UI for this yet, but
  the schema supports it).

To actually mark a booking as Done, head to `/board` — the bookings page
is read-only.

## 5. `/app/daily` — Daily reconciliation

This is the form you fill at the end of every trading day. It's the single
source of truth for "what came in" versus "what we expected".

### What the form shows

- **Expected (auto-calculated).** Sums every booking on `/board` that the
  staff marked Done today (split by Cash and Card), plus every walk-in. You
  cannot edit this — it's pulled live from D1.
- **Actual count.** Three numeric fields:
  - *Cash counted* — what's in the till at close.
  - *Card total* — the day-end total from the card machine.
  - *Cars washed inside / outside* — staff headcount split for the day.
  - *Notes* — required when variance is over the threshold (default £5).
- **Attendance.** Tick every worker who was on shift today. For each one,
  pick *Full*, *Half*, or *Overtime*. Pay is locked from each worker's
  profile and snapshotted into the daily summary so retroactive pay-rate
  changes don't rewrite history.

### Saving

Hit **Save**. The server re-computes expected totals server-side (you can't
fake variance by passing client values). The form turns into Update mode
once a summary exists for that date. You can keep updating until a
super-admin **locks** the day from `/admin`.

A locked day shows an amber banner and disables every input.

### Backfilling earlier days

Use the date picker in the top-right. You can't pick a future date. If the
day already has a summary, the form pre-fills with the saved values and the
button reads "Update".

---

## 6. `/app/expenses` — Expenses & staff payments

Two flows go through the same form, distinguished by category.

### Non-staff expenses

`/app/expenses/new`. Pick a category (supplies, utilities, rent, etc.),
enter the amount, optionally upload a receipt photo (R2 storage; OCR runs on
upload and pre-fills vendor + amount when it can). VAT is auto-calculated
from the gross amount if the business is VAT-registered.

### Staff payments

Pick category **Staff**, then choose a worker. The form atomically inserts
two rows:

1. A `staff_payments` row attached to the worker (tracked for the lifetime
   owed counter).
2. A linked `expenses` row in the regular books.

If either insert fails, neither is committed.

Specify *covers period* if the payment is "this is for last week" — that
helps reporting later.

### Filtering & totals

`/app/expenses` shows a date range filter, a category filter, and a totals
strip (per-category and grand total). Click any row to drill into it.

---

## 7. `/app/damage` — Damage reports

Open a new report from `/app/damage/new`. Fill in:

- **Occurred at** (date + time).
- **Category** — scratch, dent, mirror, paint, wheel, interior, glass, other.
- **Worker responsible** — optional; only fill if you have evidence.
- **Description** — what happened.
- **Customer name / phone / vehicle reg** — optional but recommended.
- **Photos** — up to a few JPGs/WEBPs (5 MB each, R2-stored).
- **Resolution status** — open / in progress / resolved / escalated /
  cancelled.
- **Compensation amount** — optional.

When you save, the configured `damage_notification_emails` recipients get a
Resend email summary. Click any row to edit, add resolution notes, or close
it out.

---

## 8. `/app/invoices` — Invoice log

Invoices are generated automatically when:

- a booking transitions to **Done** on `/board` (and the customer has an
  email);
- a **walk-in** is recorded with an email.

`/app/invoices` is the audit log: invoice number, customer, amount,
status, and a link to the HTML version. Click a row to inspect line
items, VAT breakdown, and the Resend message id.

### Draft mode

By default this deployment has **`invoice_auto_send='0'`** — every newly
generated invoice lands in D1 as a draft and is **not** emailed to the
customer until you click **Send email** on its detail page. The
detail page also has **View invoice** (opens the HTML in a new tab) and
**Download invoice** (saves it as `INV-…-…html`).

To switch auto-send back on, update the setting:

```sql
INSERT OR REPLACE INTO settings (key, value) VALUES ('invoice_auto_send', '1');
```

After that, new walk-ins and Done bookings will email the customer
immediately — same as before.

### Statuses

- **Draft** (only shown when auto-send is off) — `send_status='pending'`;
  not yet emailed.
- **Pending** — auto-send is on but the send is queued / in flight.
- **Sent** — Resend accepted the email.
- **Failed** — Resend or the SMTP downstream returned an error. The
  detail page shows the error message and a **Resend email** button.
- **Bounced** — Resend webhook reported a hard bounce. Same recovery
  path as "Failed".

---

## 9. `/app/cash-deposits` — Cash deposits

When cash leaves the safe and goes to the bank, log it here. Fields:

- **Date** of the deposit.
- **Amount** (pence; the UI shows pounds).
- **Reference** (the bank slip number; optional but recommended).
- **Note** (optional).

### Draft mode

Every new deposit lands as a **Draft** — visible in the list, with its
amount summed in a separate "Draft (unconfirmed)" KPI card, but **not
counted** toward the *Deposited* total or the *Cash on hand* number.
Click **Confirm** on the row when you've actually paid it in and the
slip is on file. Once confirmed it's locked in.

The admin dashboard's **Cash reconciliation** card uses the same logic:
*collected − deposited (confirmed) = on hand*. If "on hand" stays
positive for too long, money is sitting in the safe; if it goes
negative, you've over-deposited (or someone forgot to log a cash
count).

---

## 10. `/app/staff/me` — Worker self-service

A worker (PIN role) can sign in at `/staff/login` and view only this page:
their own name, photo, recent attendance, and the lifetime "owed to me"
balance. It doesn't expose pay rates, other workers, or any aggregate data.

---

## 11. `/admin` — Super-admin dashboard

The `/admin` landing page is a single-call KPI dashboard. From left to
right:

- **Today / This week / This month — revenue, expense, profit**. Pulled
  from completed bookings + walk-ins minus live expenses.
- **Revenue vs expense (last 30 days)** — bar chart.
- **Expected vs actual cash (last 14 days)** — line chart, pulled from the
  daily reconciliation form.
- **Cash reconciliation (this month)** — collected, deposited, on hand.
- **Staff costs (this month)** — earned, paid, and lifetime owed. Click a
  row to drill into the worker's detail page.
- **Open damage reports** — top 5 unresolved.

The **Month** picker in the top-right re-scopes everything to a different
month.

### `/admin/staff`

The full staff list with monthly earned / paid / owed columns. Click
**+ Add staff** to onboard a new worker (name, role, email, phone, pay
rates, optional PIN). Click a row to drill into the profile and recent
attendance / payments.

### `/admin/staff/matrix`

Super-admin-only spreadsheet view of who worked when. Pick a date range
(or use the *Today / This week / This month* presets). Each row is a
worker; each column is a day in the range. Cells show:

- **F** — full day
- **H** — half day
- **O** — overtime
- **—** — didn't work

To the right of the days you get three money columns:

- **Earned** — sum of `pay_amount` for that worker in the selected
  range.
- **Paid** — sum of `staff_payments.amount` for that worker in the
  same range.
- **Owed (lifetime)** — lifetime earned minus lifetime paid. Red when
  positive (the business owes them); grey otherwise.

The last column has a **Pay** button. Clicking it opens a modal pre-
filled with the lifetime owed amount and **Cash** as the default
method (which reduces *Cash on hand* via the linked expense row).
Switch to *Bank transfer* or *Cheque* if you're paying outside the
till. The modal records:

1. a `staff_payments` row (the canonical record of the wage payment);
2. a linked `expenses` row with `category='staff'` — this is what
   the daily form sees as a cash outflow.

Both rows reference each other and audit-log entries are written for
both.

### `/admin/coupons`

Generate or revoke discount coupons. Loyalty coupons are issued
automatically by the engine after the configured number of customer visits.

### `/admin/xero`

Download a CSV that's safe to import into Xero. The export only includes
rows with an explicit `payment_method` (so the books and the CRM agree on
what counts as cash vs card). Choose a date range and click Export.

---

## 12. Signing out & locking

Click your name in the header (or "Sign out" on mobile). The server-side
session is deleted and the cookie cleared. To "lock" the in-store tablet
without ending the session, tap **Lock** in the top-right of `/board` —
that clears the PIN from `sessionStorage` and brings the keypad back.

---

## 13. Troubleshooting

| Symptom | Where to look |
| --- | --- |
| Booking appears on `/board` but not on daily form | The booking shows up on `/app/bookings` the moment it arrives, but it only counts toward the daily form once a worker marks it **Done** and chooses Cash/Card on `/board`. "Done" without a payment method is rejected, so this can't happen for new bookings. |
| Website orders aren't showing up anywhere | Open `/app/bookings`. Every booking is there, regardless of status. If the list is empty, check the date filter (defaults to last 30 days) and clear any status filter. |
| Daily form shows "—" for expected cash | No bookings have been marked Done today, and no walk-ins were logged. Once the first sale lands, the number will update. |
| Variance banner is stuck on grey | Today's daily form hasn't been submitted yet. Submit it (even with zeros) to switch to a coloured pill. |
| Locked day can't be edited | Only a super-admin can unlock it (from `/admin` → daily detail). |
| Invoice never arrived | Open `/app/invoices`, find the row, click into the detail. If `send_status` is `failed`, hit **Resend**. If the customer never gave an email, no invoice was issued. |
| Staff payment shows up as an "expense" | That's by design — every staff payment also creates an expense entry so the books stay balanced. Filter by category `staff` to see them on their own. |
| Wrong worker logged in on `/staff/login` | The legacy `BOARD_PIN` env var still maps to the first active worker. Disable it by clearing `BOARD_PIN` and setting `settings.board_pin_legacy_fallback='0'`. Per-worker PINs are the recommended path. |

---

## 14. Reference: data flow at a glance

```
website booking      walk-in                manual staff actions
      │                │                              │
      ▼                ▼                              ▼
  POST /api/booking   POST /api/walkins      POST /api/app/...
      │                │                              │
      ▼                ▼                              ▼
       bookings         walkin_transactions          expenses, damage_reports,
       (D1)             (D1)                          staff_payments, etc.
      │                │                              │
      └──────┬─────────┘                              │
             │                                        │
             ▼                                        │
     /board "Done" + payment method                    │
             │                                        │
             ▼                                        │
       bookings.status='done'                          │
       bookings.payment_method='cash' or 'card'        │
             │                                        │
             ▼                                        ▼
   issueInvoice() → invoices table, Resend, loyalty
             │
             ▼
   live_bookings + live_walkin_transactions
             │
             ▼
   Daily reconciliation, dashboards, charts, Xero export
```

All read paths go through `live_*` views, which strip soft-deleted rows.
Every write paths logs to `booking_log` or `crm_audit_log`. You can audit
any change after the fact from those tables.

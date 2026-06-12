# Car Wash CRM — Tervezési Dokumentum

> **Projekt**: bristolcarwash.co.uk komplett operációs CRM
> **Alap**: a meglévő booking system (`/board`) kibővítése
> **Verzió**: v1.1 — Laszlo feedback alapján frissítve
> **Nyelv**: UI **angol + egyiptomi arab** (RTL), kód angol
> **Kísérő dokumentumok**: `CRM-MIGRATIONS.md` (DDL), `CRM-PATTERNS.md` (implementációs minták)

---

## Változások v1.0 → v1.1

- **Astro 5 → Astro 6** (Laszlo döntés)
- **Cash variance felemelve a dashboard tetejére** — minden látogatáskor látszik az eltérés a várt és tényleges bevétel között
- **Stripe integráció** — felépítve, de feature flag-gel kikapcsolva; env vars készen, csak hozzáadod őket a Cloudflare-be → és bekapcsolható
- **Image compression** — minden feltöltött kép kliens oldalon WebP-re tömörítve (~150-400KB/kép, OCR-olvashatóság megőrizve)
- **Tip tracking, Petty cash float, Worker performance metrics** — kihúzva (Laszlo döntés)
- **Service price snapshot** — kötelezőként megerősítve (#4 a régi listából)
- **Backup egyszerűsítve** — csak Resend napi summary email, R2 export kihagyva
- **Soft delete + audit log** — megerősítve (a Hard Rules-ban már bent volt)

---

## 0. TL;DR — mit építünk

A meglévő Astro + Cloudflare D1 booking systemre **rá-építünk**, nem mellé. Egyetlen kódbázis, egyetlen DB, egyetlen Cloudflare Workers deploy. A `/board` marad, mellé jön:

- **Walk-in entry** a board-ra (utcáról bejövő autók logolása)
- **Daily reconciliation** form (cash/card/számolás)
- **Staff CRM** (regisztráció, profile sheet, fizetések)
- **Expenditure tracking** (R2-re feltöltött nyugtákkal)
- **Damage reports** (fotóval, email super adminnak)
- **Dashboard** (income/outcome/profit, heatmap, KPI-ok)
- **Invoice + marketing email capture**
- **Loyalty schema előkészítés** (Stage 2-re)

---

## 1. Nyitott kérdések megválaszolva

A transcriptből kigyűjtve, mindegyikre döntés:

| # | Kérdés | Döntés | Indoklás |
|---|---|---|---|
| 1 | Auth: külön szintek vagy nincs auth? | **3 szint, mindenkinek auth** | Worker = PIN (már van), Admin = email + password, Super admin = email + password + 2FA opcionális |
| 2 | Worker-ek látják-e egymás staff sheetjét? | **Csak a sajátjukat** | RBAC: `worker.read:self` |
| 3 | Photo upload kell-e? | **Igen, R2-re** | Nyugtákhoz és damage reportokhoz; mobilon készül a fotó, közvetlen R2 presigned URL |
| 4 | D1 vs Supabase? | **D1** | Már megy, ingyenes, ugyanaz a Workers env, nincs új provider |
| 5 | Walk-in autók logolása | **Igen, board-on keresztül** | Worker tabletről ikonokkal: méret + csomag + inside/outside; nem kell írnia |
| 6 | Mit logoljunk az autóról? | **Csak car size + package + price + timestamp** | Rendszámot nem fognak beírni |
| 7 | Kell-e Arabic? | **Igen, EG dialektus, RTL** | `lang=ar-EG`, `dir=rtl` |
| 8 | Ikon vs szöveg? | **Mindenhol SVG ikon + opcionális label** | Touch-friendly, low literacy-friendly |
| 9 | Email provider? | **Resend** | Már a stackben, olcsó, jó deliverability |
| 10 | Damage report → Super admin értesítés | **Email Resend-en + opcionálisan Telegram** | Telegram bot ingyenes, instant push |
| 11 | Késő daily summary értesítés | **Cron Worker** + Resend | 5 perccel zárás után → admin reminder, 20 perccel → super admin warning |
| 12 | Xero integráció | **Stage 2** | Most CSV export elég, Xero API-ra később |
| 13 | Loyalty rendszer | **Schema előkészítés most, logika Stage 2** | `customer_visits` táblát létrehozzuk, de az engedélyek/akciók később |
| 14 | Discount logika | **Stage 2** | Most csak email capture, marketing automatizálás később |
| 15 | Receipt → customer email | **Igen, opt-in checkboxszal** | GDPR-compliant, marketing consent külön opt-in |
| 16 | Stripe online payment | **Build now, hidden** | Kód kész, env vars, schema mezők, feature flag `stripe_enabled='0'` |
| 17 | Image compression | **Kliens-oldali WebP @ 0.85, max 1600px** | OCR-olvashatóság + ~85% méret-megtakarítás |

---

## 2. Stack — végleges

| Réteg | Eszköz | Indoklás |
|---|---|---|
| Framework | **Astro 6** + React islands | Már a stackben |
| Adatbázis | **Cloudflare D1** | Már a stackben |
| Object storage | **Cloudflare R2** | Receipt + damage fotók |
| Hosting | **Cloudflare Pages + Workers** | Már a stackben |
| UI | **Tailwind + shadcn/ui** | Már a stackben |
| Validation | **Zod** | Már a stackben |
| Auth (workers) | **PIN + session cookie (PBKDF2)** | Már megvan, kibővítjük |
| Auth (admin) | **Email + PBKDF2 + session cookie + Turnstile** | Új réteg (NEM bcrypt — Workers-incompat) |
| Email | **Resend** | Transactional + marketing + napi summary |
| i18n | **paraglide-js** | Type-safe, tree-shakeable, Astro 6-kompat |
| Charts | **Recharts** | React island a dashboardon |
| File upload | **R2 + presigned URLs + kliens-oldali WebP komprimálás** | Direct from browser, 150-400KB/kép |
| OCR (opcionális) | **Anthropic Vision API** | Receipt → összeg auto-fill |
| Push (opcionális) | **Telegram Bot** | Ingyenes, instant |
| Cron | **Cloudflare Cron Triggers** | Daily reminder, end-of-day rollup, Stripe webhook timeout retry |
| **Payment (hidden)** | **Stripe** | Feature-flagged, env-ready, deploy-kor kikapcsolva |

> **NEM HASZNÁLUNK**: Vercel, Supabase, Next.js, MongoDB, Firebase, külső auth provider (Clerk/Auth0).

---

## 3. Architektúra

### Domain szerkezet

```
bristolcarwash.co.uk           → marketing site (külön repo, statikus)
bristolcarwash.co.uk/board     → JELENLEGI booking system + walk-in entry
bristolcarwash.co.uk/app       → ÚJ — daily form, expenses, staff (worker + admin)
bristolcarwash.co.uk/admin     → ÚJ — dashboard, reports (admin + super admin)
```

**Egy repo, egy deploy** — Astro multi-page, route-szintű auth middleware-rel.

### Roles & permissions mátrix

| Funkció | Worker | Admin | Super Admin |
|---|:---:|:---:|:---:|
| Board megtekintés | ✅ | ✅ | ✅ |
| Booking státusz módosítás | ✅ | ✅ | ✅ |
| Walk-in entry hozzáadás | ✅ | ✅ | ✅ |
| Daily form kitöltés (cash/card/cars) | ❌ | ✅ | ✅ |
| Saját staff sheet megtekintés | ✅ | ✅ | ✅ |
| Más staff sheet megtekintés | ❌ | ✅ | ✅ |
| Expenditure form kitöltés | ❌ | ✅ | ✅ |
| Új staff regisztráció | ❌ | ✅ | ✅ |
| Staff törlés | ❌ | ❌ | ✅ |
| Damage report létrehozás | ❌ | ✅ | ✅ |
| Damage report törlés | ❌ | ❌ | ✅ |
| Profit/loss megtekintés | ❌ | ❌ | ✅ |
| Staff fizetés "paid" jelölés | ❌ | ❌ | ✅ |
| Settings (árak, csomagok) | ❌ | ❌ | ✅ |
| Audit log megtekintés | ❌ | ❌ | ✅ |

---

## 4. Adatbázis schema — bővítések

A meglévő táblák (`bookings`, `customers`, `workers`, `services`, `bays`, `booking_log`) **maradnak**. Ezeket adjuk hozzá:

### 4.1 Worker bővítés (staff CRM)

```sql
-- A meglévő `workers` tábla bővítése
ALTER TABLE workers ADD COLUMN role TEXT DEFAULT 'worker';
   -- 'worker' | 'admin' | 'super_admin'
ALTER TABLE workers ADD COLUMN email TEXT;
ALTER TABLE workers ADD COLUMN phone TEXT;
ALTER TABLE workers ADD COLUMN address TEXT;
ALTER TABLE workers ADD COLUMN ni_number TEXT;
ALTER TABLE workers ADD COLUMN full_day_pay INTEGER DEFAULT 10000;  -- pence-ben (£100)
ALTER TABLE workers ADD COLUMN half_day_pay INTEGER DEFAULT 5000;
ALTER TABLE workers ADD COLUMN password_hash TEXT;  -- csak admin/super admin-nak
ALTER TABLE workers ADD COLUMN hired_at DATE;
ALTER TABLE workers ADD COLUMN profile_photo_r2_key TEXT;
```

### 4.2 Daily summary — napi zárás

```sql
CREATE TABLE daily_summary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL UNIQUE,
  cash_total INTEGER NOT NULL DEFAULT 0,        -- pence
  card_total INTEGER NOT NULL DEFAULT 0,
  cars_inside INTEGER NOT NULL DEFAULT 0,
  cars_outside INTEGER NOT NULL DEFAULT 0,
  expected_cash INTEGER,                         -- system-számolt elvárt cash
  cash_variance INTEGER,                         -- expected - actual (lehet negatív)
  notes TEXT,
  filled_by INTEGER REFERENCES workers(id),
  filled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_locked INTEGER DEFAULT 0                    -- super admin lezárhatja
);
```

### 4.3 Staff attendance — napi jelenlét

```sql
CREATE TABLE staff_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  date DATE NOT NULL,
  shift TEXT NOT NULL,                          -- 'full' | 'half' | 'overtime'
  pay_amount INTEGER NOT NULL,                  -- pence, snapshotolt érték
  notes TEXT,
  recorded_by INTEGER REFERENCES workers(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(worker_id, date)                       -- 1 worker / 1 day max
);
CREATE INDEX idx_attendance_worker ON staff_attendance(worker_id, date);
```

### 4.4 Staff payments — fizetések

```sql
CREATE TABLE staff_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  worker_id INTEGER NOT NULL REFERENCES workers(id),
  amount INTEGER NOT NULL,                      -- pence
  method TEXT NOT NULL,                         -- 'cash' | 'bank_transfer'
  paid_at DATE NOT NULL,
  covers_period_start DATE,                     -- mely időszakot fedi
  covers_period_end DATE,
  notes TEXT,
  paid_by INTEGER REFERENCES workers(id),       -- super admin
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_payments_worker ON staff_payments(worker_id, paid_at);
```

### 4.5 Expenses — kiadások

```sql
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL,
  amount INTEGER NOT NULL,                      -- pence
  method TEXT NOT NULL,                         -- 'cash' | 'card' | 'bank_transfer'
  category TEXT NOT NULL,                       -- 'staff' | 'supplies' | 'utilities' | 'equipment' | 'food' | 'other'
  staff_payment_id INTEGER REFERENCES staff_payments(id),  -- ha staff payment
  description TEXT,
  receipt_r2_key TEXT,                          -- R2 object key
  vendor TEXT,
  recorded_by INTEGER REFERENCES workers(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_expenses_category ON expenses(category);
```

### 4.6 Walk-in transactions — utcáról bejövők

```sql
CREATE TABLE walkin_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL,
  car_size TEXT NOT NULL,                       -- 'small' | 'large' | 'suv' | 'camper' | 'sports'
  package_id INTEGER REFERENCES services(id),
  inside_only INTEGER DEFAULT 0,
  outside_only INTEGER DEFAULT 0,
  inside_and_outside INTEGER DEFAULT 0,
  price INTEGER NOT NULL,                       -- pence, snapshotolt
  payment_method TEXT NOT NULL,                 -- 'cash' | 'card'
  customer_email TEXT,                          -- opcionális, marketing capture
  marketing_opt_in INTEGER DEFAULT 0,
  recorded_by INTEGER REFERENCES workers(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- timestamp = heatmaphoz
  bay_id INTEGER REFERENCES bays(id)
);
CREATE INDEX idx_walkin_date ON walkin_transactions(date);
CREATE INDEX idx_walkin_created ON walkin_transactions(created_at);
```

### 4.7 Damage reports

```sql
CREATE TABLE damage_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL,
  occurred_at DATETIME NOT NULL,
  reported_by INTEGER NOT NULL REFERENCES workers(id),
  worker_responsible INTEGER REFERENCES workers(id),
  category TEXT NOT NULL,                       -- 'scratch' | 'mirror_damage' | 'dent' | 'paint_damage' | 'wheel_damage' | 'other'
  description TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  vehicle_registration TEXT,
  resolution TEXT,
  resolution_status TEXT DEFAULT 'open',        -- 'open' | 'resolved' | 'escalated'
  compensation_amount INTEGER,                  -- pence, ha pénzbeli megegyezés
  photo_r2_keys TEXT,                           -- JSON array of R2 keys
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME
);
```

### 4.8 Invoices — számlák/nyugták

```sql
CREATE TABLE invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,          -- pl. 'INV-2026-0001'
  booking_id INTEGER REFERENCES bookings(id),
  walkin_id INTEGER REFERENCES walkin_transactions(id),
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  amount INTEGER NOT NULL,
  vat_amount INTEGER DEFAULT 0,                 -- ha VAT-registered leszünk
  items_json TEXT NOT NULL,                     -- JSON: services + prices
  marketing_opt_in INTEGER DEFAULT 0,
  sent_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4.9 Customer visits — loyalty előkészítés (Stage 2 logika, schema most)

```sql
CREATE TABLE customer_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  visit_date DATE NOT NULL,
  booking_id INTEGER REFERENCES bookings(id),
  walkin_id INTEGER REFERENCES walkin_transactions(id),
  amount_spent INTEGER NOT NULL,
  package_used TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_visits_customer ON customer_visits(customer_id);

-- Bővítjük a meglévő customers táblát
ALTER TABLE customers ADD COLUMN customer_type TEXT DEFAULT 'retail';
   -- 'retail' | 'corporate' | 'fleet'
ALTER TABLE customers ADD COLUMN discount_percent INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN total_spent INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN loyalty_credits INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN marketing_consent INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN marketing_consent_at DATETIME;
```

### 4.10 Settings tábla (super admin által szerkeszthető)

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed értékek:
-- 'opening_time' = '08:00'
-- 'closing_time' = '18:00'
-- 'reminder_admin_minutes_after_close' = '5'
-- 'reminder_super_admin_minutes_after_close' = '20'
-- 'super_admin_email' = 'laszlo@...'
-- 'damage_notification_emails' = JSON array
-- 'currency' = 'GBP'
-- 'vat_registered' = '0'
-- 'vat_rate' = '20'
```

---

## 5. Modulok részletesen

### 5.1 Booking board kibővítése — walk-in entry

A jelenlegi `/board` egy új gombbal:

```
┌─────────────────────────────────────┐
│  📅 Today's bookings                │
│  ✅ 09:00 Smith — Full Valet        │
│  🟢 09:30 Jones — Outside Only      │ ← in progress
│                                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  [➕ ADD WALK-IN] ← nagy gomb       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                     │
│  Walk-ins today: 12                 │
│  ⓘ  10:15 SUV — Wash & Wax £15     │
│  ⓘ  10:45 Small — Bronze £20        │
└─────────────────────────────────────┘
```

A `+ ADD WALK-IN` flow:

1. **Car size** — 5 nagy SVG ikon (Small / Large / SUV / Camper / Sports)
2. **Service type** — 3 ikon (Outside / Inside / Both)
3. **Package** — árszintek nagy gombokkal: £10, £15, £20, £25, £30, £60, £70 (size-függő szűréssel)
4. **Payment** — 2 ikon (Cash / Card)
5. **Optional**: customer email (marketing capture, skip-pelhető)
6. **Confirm** → PIN
7. Időbélyeg automatikus, bay ha van szabad → autoassign

**Heat map adat**: minden walk-in `created_at` timestamp-je → órai bontásban aggregálva.

### 5.2 Daily reconciliation form (`/app/daily`)

Csak admin/super admin éri el. Naponta egyszer kitöltik (zárás után).

```
Today: 27 April 2026  [✏️ Change date]

┌─ AUTO-CALCULATED ──────────────────────┐
│ Bookings completed:    8 × £35 = £280  │
│ Walk-ins:             12 × £20 = £240  │
│ Expected cash:                  £320   │
│ Expected card:                  £200   │
│ TOTAL EXPECTED:                 £520   │
└────────────────────────────────────────┘

┌─ ENTER ACTUAL ─────────────────────────┐
│ Cash counted:    [£ ___ ]              │
│ Card terminal:   [£ ___ ]              │
│ Cars inside:     [ ___ ]               │
│ Cars outside:    [ ___ ]               │
│                                        │
│ Cash variance:   ⚠️ -£15 (short)       │
│                                        │
│ Notes: [________________________]      │
└────────────────────────────────────────┘

┌─ WHO WORKED TODAY ─────────────────────┐
│ ☑ Sam     [Full ✓] [Half  ]            │
│ ☑ Dave    [Full ✓] [Half  ]            │
│ ☑ Mike    [Full ✓] [Half  ]            │
│ ☑ Pete    [Full  ] [Half ✓]            │
│ ☐ Ali     [Full  ] [Half  ]            │
└────────────────────────────────────────┘

[ SUBMIT — locks the day ]
```

**Cron logika**:
- Zárás (closing_time) után 5 perccel: nincs daily_summary → email admin-nak
- Zárás után 20 perccel: még mindig nincs → email super admin-nak

### 5.3 Staff management

#### Staff regisztráció (`/admin/staff/new`)

Admin vagy super admin tölti ki:

- Name (required)
- Phone (required)
- Email (optional, kell ha admin/super_admin)
- Role: Worker / Admin (super admin nem hozzáadható UI-ról, csak DB-ben)
- Full day pay: £100 (editable)
- Half day pay: £50 (editable)
- NI number
- Address
- PIN (4 digit, auto-generate vagy manual) → bcrypt hash

**Eredmény**: új worker record + automatikusan saját staff sheet jár neki.

#### Staff profile sheet (`/app/staff/me` vagy `/admin/staff/:id`)

Minden worker a sajátját látja, admin/super admin mindenkiét:

```
┌─ Sam Williams ─────────────────────────┐
│ Phone: 07xxx, NI: AB123456C            │
│ Hired: 1 Jan 2024                      │
│                                        │
│ THIS MONTH (April 2026)                │
│ ─────────────────────────────────────  │
│ Days worked:        18 full + 2 half   │
│ Earned:             £1,900              │
│ Paid out:           £1,200              │
│ OWED:               £700                │
│                                        │
│ ATTENDANCE                              │
│ ─────────────────────────────────────  │
│ 25 Apr — Full day  £100                │
│ 24 Apr — Full day  £100                │
│ 22 Apr — Half day  £50                 │
│ ...                                     │
│                                        │
│ PAYMENTS RECEIVED                       │
│ ─────────────────────────────────────  │
│ 20 Apr — £600 bank transfer            │
│ 06 Apr — £600 cash                     │
└────────────────────────────────────────┘
```

#### Pay marking (super admin only)

Super admin az expenditure form-ról tudja jelölni: ha `category = 'staff'`, akkor select staff → automatikusan létrehoz egy `staff_payments` record-ot ÉS egy `expenses` record-ot egy tranzakcióban (D1 batch).

### 5.4 Expenditure form (`/app/expenses/new`)

Admin / super admin:

```
Date:        [27 Apr 2026  ▼]
Amount:      [£ ___ ]
Method:      [Cash] [Card] [Bank Transfer]
Category:    [Supplies] [Staff] [Utilities] [Food] [Equipment] [Other]
              ↓ ha 'Staff' van kiválasztva, dropdown jön ↓
Staff member: [Sam ▼]
              [Covers period: __ to __]

Description: [________________________]
Vendor:      [________________________]

📎 Receipt photo: [Tap to upload from camera]
   (csak ha NOT category='staff')
```

**Receipt upload flow**:
1. Frontend kér presigned R2 PUT URL-t a Worker-től
2. Browser feltölti közvetlenül R2-re
3. Worker visszakapja a key-t és menti az `expenses.receipt_r2_key`-be
4. **Bonus** (Stage 1.5): OCR-rel auto-fill az amount-ot — Anthropic Vision API
5. Display a thumbnail-t később R2 signed GET URL-en

### 5.5 Damage reports (`/app/damage/new`)

```
Occurred at:      [27 Apr 2026, 14:30]
Worker responsible: [Sam ▼]

Category:         [Scratch] [Mirror] [Dent] [Paint] [Wheel] [Other]

Customer:         [Name      ]
                  [Phone     ]
                  [Reg plate ]

Description:      [_________________________________]

📎 Photos:        [+ Add photo] [+ Add photo]

Resolution:       [_________________________________]
                  [ ] Resolved on the day
                  [ ] Compensation paid: £___
                  [ ] Further action required

[SUBMIT]  → email-t küld super admin-nak
```

**Email template** (Resend):
- Subject: `🚨 Damage report — Sam — Mirror — 27 Apr 14:30`
- Body: minden mező + R2 signed URL-ek a fotókhoz (1 hét lejárat)
- Reply-to: `reported_by` worker (ha van email-je)

### 5.6 Dashboard (`/admin`)

Felső sáv KPI kártyákkal, **kiemelt cash variance bannerrel** ha eltérés van, alatta charts.

```
┌────────────────────────────────────────────────────────┐
│  ⚠️  CASH VARIANCE — TODAY                              │
│  Expected: £520    Counted: £505    SHORT: -£15  🔴    │
│  This week's variance: -£42 across 4 days              │
└────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────┐
│  THIS WEEK              THIS MONTH         TODAY        │
│  Income:   £3,420       £14,200            £520         │
│  Expenses: £1,800       £7,400             £180         │
│  PROFIT:   £1,620       £6,800             £340         │
│  Cars:     156          612                28           │
└────────────────────────────────────────────────────────┘

┌─ EXPECTED vs ACTUAL — last 14 days ───────────────────┐
│  [Recharts bar chart, két oszlop párban]              │
│  Show variance trend — ha rendszeres a hiány, alert.  │
└────────────────────────────────────────────────────────┘

┌─ INCOME / EXPENSE — last 30 days ─────────────────────┐
│  [Recharts area chart, két vonal]                      │
└────────────────────────────────────────────────────────┘

┌─ HEAT MAP — busiest hours ────────────────────────────┐
│        Mon Tue Wed Thu Fri Sat Sun                     │
│  08    ░  ░  ░  ░  ░  ▓  ▓                            │
│  09    ▒  ▒  ▒  ▒  ▒  ▓  █                            │
│  10    ▓  ▓  ▓  ▓  ▓  █  █                            │
│  ...                                                    │
└────────────────────────────────────────────────────────┘

┌─ STAFF COSTS — this month ────────────────────────────┐
│  Name      Days  Earned   Paid     Owed                │
│  Sam        20   £2,000   £1,500   £500                │
│  Dave       18   £1,800   £1,800   £0                  │
│  ...                                                    │
└────────────────────────────────────────────────────────┘

┌─ RECENT DAMAGE REPORTS ───────────────────────────────┐
│  ⚠️ 25 Apr — Mirror — open                            │
└────────────────────────────────────────────────────────┘
```

**Variance színkód logika:**
- £0 eltérés → zöld pipa, nem kiemelt
- ±£1–£5 → sárga, "minor variance"
- ±£5+ → piros, kötelező magyarázat a `daily_summary.notes`-ban
- Heti aggregát: ha 4+ napon van -£5+ hiány → **Resend email super adminnak** "Cash variance pattern detected"

### 5.7 Invoice + marketing capture

Walk-in vagy booking befejezésekor:

```
✅ Wash complete!
Want a receipt by email?

[your@email.com_______]
[ ] I'd like to hear about offers and loyalty rewards
[ Send receipt ]   [ Skip ]
```

Ha email megadva:
1. Insert/find `customers` record
2. Insert `invoices` record + invoice_number generálás (`INV-YYYY-NNNN`)
3. Resend email — HTML template
4. Insert `customer_visits` record loyalty schemához

**HTML invoice template** elemei:
- Logo
- Invoice number, date, time
- Customer name (ha van)
- Service items + price
- Total
- Payment method
- Footer: "Thanks — book your next wash at bristolcarwash.co.uk"
- Marketing opt-in confirmáció (ha bekapcsolta)
- Unsubscribe link (ha opt-in volt)

### 5.8 Loyalty előkészítés (Stage 2)

Most csak az adatok gyűjtése. A logika később:

- **10 wash → 1 free**: count `customer_visits` records, ha `count % 10 == 0` → automatic email kupon
- **Corporate**: `customer_type='corporate'` → `discount_percent` automatikusan
- **Drip campaign**: nem volt 60 napja → email "We miss you" + 20% off

---

## 6. Arabic + RTL támogatás

```
src/
  i18n/
    en.json
    ar-EG.json
  components/
    LanguageSwitcher.tsx
```

- `<html lang="ar-EG" dir="rtl">` ha arab
- Tailwind `rtl:` modifierek (pl. `me-2` `ms-2` használata `mr-2`/`ml-2` helyett)
- shadcn/ui-t át kell nézni — alapból támogatja, de az ikonok flippelődését ellenőrizni
- Számok **Western Arabic numerals** (1234567890), NEM Eastern Arabic (٠١٢٣٤٥٦٧٨٩) — egyszerűbb a könyvelésnek
- Currency mindkét nyelven £ marad (UK)
- Datepicker és időpont format check
- Egyiptomi dialektus = colloquial szóhasználat (pl. "اليوم" today, "الشغل" work, nem MSA)

---

## 7. Stage 2 — Xero integráció

Akkor lép életbe, amikor a Stage 1 stabil. Két irány:

1. **Daily summary → Xero invoice (sales)** — minden napi total egy összevont sales invoice
2. **Expenses → Xero bills (purchases)** — egyenként, kategória-mapping-gel

**Hogyan**: Cloudflare Worker cron, naponta éjjel 1-kor, Xero OAuth2 token refresh, REST API push. Token Cloudflare KV-ben.

A schema **most** úgy épül, hogy minden record-on legyen egy `xero_invoice_id` és `xero_synced_at` mező — Stage 2-ben már csak kitöltjük, nem kell DB-t bővíteni.

---

## 8. CRM-tapasztalatok alapján — javaslatok (Laszlo feedback alapján szűkítve)

### ⭐ MUST-HAVE (Stage 1)

#### 1. ~~Tip / gratuity tracking~~ — KIHÚZVA
*v1.1: nem kell.*

#### 2. ~~Petty cash float~~ — KIHÚZVA
*v1.1: nem kell.*

#### 3. End-of-day auto cash count cross-check ⭐ DASHBOARD-PROMINENCE

A walk-in-ek + bookings cash értékét **automatikusan** összegzed. A daily form mutassa az "expected cash" vs "actual cash" különbséget, **ÉS a dashboardon mindig egy kiemelt banner** mutatja a mai eltérést és a heti összesített eltérést. Ha eltérés > £5, force a `notes` mezőt kötelezővé. Heti pattern detection: ha 4+ napon negatív → super admin email.

**Implementáció**: lásd 5.6 Dashboard fejezet (variance banner).

#### 4. Service price snapshot ⭐ KÖTELEZŐ

Minden tranzakciónál a `price` snapshotolva legyen — ne a `services.base_price`-ból olvasd később, mert ha az árat módosítod, a régi tranzakciók ára is megváltozik. **Kritikus** könyvelési integritás-szempontból. Hard rule, lásd 11. fejezet.

#### 5. ~~Worker performance metrics~~ — KIHÚZVA
*v1.1: nem kell.*

### 🚀 NICE-TO-HAVE (Stage 1.5–2)

#### 6. WhatsApp invoice delivery
UK-ban az emailekhez képest a WhatsApp **3-5× nagyobb open rate**. Az R2-re feltöltött PDF/HTML invoice-ot send-eled WhatsApp Business API-n vagy CallMeBot-on (ingyenes alternatíva). Stage 2-ben.

#### 7. Receipt OCR auto-fill
Worker fotót csinál a nyugtáról → Anthropic Vision API → amount + vendor automatikusan kitöltve. £0.01 / fotó. **Gyors win**, drámaian csökkenti a beviteli hibát és időt. Stage 1.5-ben implementálható. Részletek a `CRM-PATTERNS.md` Image Compression + OCR fejezetben.

#### 8. Cash deposit log
Ha super admin a héten többször bemegy és kiveszi a cash-t a safe-ből, ez **külön logolva** legyen — nem expense, hanem "cash withdrawal to bank" mozgás. Új `cash_movements` tábla. Reconciliation szempontból kritikus.

#### 9. Corporate / fleet account billing
Ha autókereskedők vagy taxi-fleet rendszeresen jönnek, **havi számla** kell, nem mindig fizetnek a helyszínen. `customers.customer_type='corporate'` + `payment_terms_days=30` + havi cron, ami összegyűjti a hó tranzakcióit és kiküldi PDF invoice-ban. **Magasabb átlag-tranzakcióérték.**

#### 10. Daily summary email — csak Resend
*v1.1 egyszerűsítés: R2 export elhagyva.*

Napi automatikus summary email super adminnak, **Resend-en keresztül**. Cron Worker minden este 22:00-kor:

```
Subject: Bristol Car Wash — Daily summary for 27 Apr 2026

Income:        £520 (£320 cash + £200 card)
Expected:      £535
Variance:      -£15 (short — see notes)
Expenses:      £180
PROFIT:        £340

Cars washed:   28 (12 booked + 16 walk-in)
Staff worked:  Sam, Dave, Mike (full); Pete (half)
Damage today:  None

Top expense:   Snow foam from Autosmart £45
```

Ha nincs `daily_summary` record (admin nem zárt) → email "⚠️ Daily summary missing for 27 Apr". Ezzel **nincs szükség R2 export-ra** — az email maga az audit trail, és a Resend log-ban visszakereshető.

### 🤔 OPTIONAL (csak ha tényleg kell)

- ~~Geofencing clock-in~~ — túl bonyolult, PIN bőven elég
- ~~Voice damage report (Whisper)~~ — sablon-szövegek 95%-ot lefednek
- ~~Live dashboard a falra~~ — admin dashboardod open-ben hagyhatja
- ~~Customer SMS reminders~~ — drága, az email + WhatsApp elég
- ~~Multi-location support~~ — most 1 mosó van

---

## 9. Implementációs fázisok

### **Phase 0 — Foundation** (1-2 nap)
- Schema migrations (lásd `CRM-MIGRATIONS.md`)
- Role bővítés workers táblán
- Auth middleware: `worker` / `admin` / `super_admin` route-protection
- Admin login form + **PBKDF2 (Web Crypto)** + session cookie
- Settings tábla seed (incl. `stripe_enabled='0'`)
- i18n setup (en + ar-EG, RTL) — paraglide-js
- **Image compression utility** (kliens-oldali WebP) — közös lib mindkét upload-flow-hoz

### **Phase 1 — Walk-in entry** (1 nap)
- `/board` walk-in modal + 5-step flow
- `walkin_transactions` insert API
- Heat map adatkonzisztencia ellenőrzése
- **Service price snapshot** minden insertnél (Hard Rule #3)

### **Phase 2 — Daily reconciliation + Dashboard variance banner** (2 nap)
- `/app/daily` form
- Auto-calculation a bookings + walkins-ből
- Cash variance display
- **Dashboard variance banner komponens** (mindig látható, real-time)
- Cron reminders (5min + 20min after close)

### **Phase 3 — Staff CRM** (2 nap)
- Staff registration form
- Staff profile sheet (self + admin views)
- Attendance recording (a daily form-ról)
- Staff payments tracking

### **Phase 4 — Expenditure tracking + Image upload** (2 nap)
- Expense form (sima case)
- **Kliens-oldali image compression** (WebP, max 1600px, q=0.85)
- R2 presigned URL flow
- Receipt upload + display thumbnail
- Staff payment branch (linkeli a staff_payments-szel atomically)

### **Phase 5 — Damage reports** (1 nap)
- Damage form
- Multi-photo upload (image compression-nel)
- Resend email super adminnak
- Damage list view

### **Phase 6 — Dashboard** (2 nap)
- Variance banner (Phase 2-ből továbbfejlesztve)
- KPI cards (today/week/month)
- Income/expense chart (Recharts)
- Heat map
- Staff costs table
- Recent damage list
- **Expected vs Actual chart** (14-napos)

### **Phase 7 — Invoice + marketing** (1-2 nap)
- Invoice generation
- HTML template + Resend
- Marketing opt-in flow
- Customer visits tracking

### **Phase 8 — Stripe (HIDDEN)** (2 nap) ⭐ ÚJ v1.1
- Stripe schema mezők (`stripe_payment_intent_id`, `stripe_customer_id`, `stripe_invoice_id`)
- Payment intent endpoint (`POST /api/stripe/create-payment-intent`)
- Webhook endpoint (`POST /api/stripe/webhook`) — signature verifikáció
- UI komponensek (Stripe Elements) — **mind `if (stripeEnabled)` mögött**
- Settings: `stripe_enabled='0'` default
- Env vars dokumentálva — Cloudflare-be csak akkor adod hozzá, ha élesítenéd
- **Live deploy: minden Stripe UI rejtve, webhook 200 OK-val ignore-ol minden eseményt**
- Részletes pattern: `CRM-PATTERNS.md` Stripe fejezet

### **Phase 9 — Polish + i18n + Daily summary email** (1-2 nap)
- Arabic translations
- RTL pass minden oldalon
- Mobile UX teszt (iPhone, Android)
- **Daily summary email cron** (Resend, 22:00 UK time)
- Egy worker, egy admin, egy super admin dry run

### **Phase 10 (Stage 1.5) — Quality of life**
- Receipt OCR (Anthropic Vision)
- Cash deposit log

### **Phase 11 (Stage 2) — Külső integrációk**
- Xero
- WhatsApp invoices
- Loyalty logika
- Corporate billing
- Stripe **élesítés** (env vars Cloudflare-be → flag `stripe_enabled='1'`)

**Becsült total Stage 1**: ~17 munkanap (Claude Code-dal lényegesen kevesebb).

---

## 10. Költség és üzemeltetés

| Tétel | Költség / hó |
|---|---|
| Cloudflare Workers + Pages | £0 (free tier) |
| Cloudflare D1 | £0 (5GB ingyen) |
| Cloudflare R2 | £0–£3 (10GB ingyen, fotó-mennyiségtől függ) |
| Resend | £0 (3000 email/hó ingyen), majd £15/hó |
| Domain | már megvan |
| Telegram bot | £0 |
| **TOTAL** | **£0–£20 / hó** |

Jelentős növekedéskor (10000+ tranzakció/hó) D1 readek miatt £5-10/hó plusz.

---

## 11. Hard rules — amitől ne térjünk el

1. **Minden pénzösszeg `INTEGER` pence-ben tárolva**, soha float. Konverzió csak megjelenítéskor.
2. **Minden tranzakció időbélyegelve és audit-logolva**: `booking_log` mintára `crm_log` tábla minden module-ra.
3. **Service price snapshot** — minden tranzakcióban tárolt `price`, nem `services.base_price` join.
4. **Soft delete mindenhol**, kivéve a settings-et: `deleted_at` mező a workers, customers, expenses táblákon. Super adminnak van "permanent purge" gombja.
5. **Receipt és damage fotók R2-ben, key-jük DB-ben**. Soha nem dobjuk ki őket — adóhatóság 6 évre kéri.
6. **Minden admin/super admin művelet logolt** — ki, mikor, mit. Ki törölte a damage reportot? Ki módosította Sam fizetését?
7. **Worker password nem létezik** — ők PIN-nel auth-olnak. Csak admin és super admin használ password-öt.
8. **Minden form Zod-validált** szerveroldalon, akkor is, ha kliensoldalon is van.
9. **Turnstile a publikus végpontokon** (booking, contact form) — már megvan, marad.
10. **Egy worker = egy attendance / nap** UNIQUE constraint, nem véletlenül duplázható.

---

## 12. Mit adok át Claude Code-nak

A teljes implementációhoz a Claude Code repo-jában kelleni fog:

- **`CARWASH-CRM-PLAN-v1.1.md`** — ez a fájl (tervezés, döntések, fázisok)
- **`CRM-MIGRATIONS.md`** — teljes DDL migration scriptek a Phase 0-hoz, idempotensen, fel-le migrálható
- **`CRM-PATTERNS.md`** — implementációs minták: i18n+RTL, R2 presigned upload, image compression (Canvas+WebP), PBKDF2 (Web Crypto), Stripe scaffolding, audit log helper, soft delete pattern
- A meglévő `CLAUDE.md` a booking systemből (változatlan)
- Skills referenciák (Laszlo skill rendszeréből): `astro-forms`, `astro-security`, `astro-audit`, `lead-gen-calculator` (a multi-step walk-in flow-hoz), `humanize-copy` (UI szövegekhez)

Mind a három dokumentum (`*-PLAN-v1.1.md`, `*-MIGRATIONS.md`, `*-PATTERNS.md`) elkészült és átadásra kész.

---

## 13. Mit NE építsünk most

Ne ess bele a feature-feature csapdájába. **Ezeket aktívan kihagyjuk**:

- Ne legyen real-time WebSocket — polling 10s-enként a board-on bőven elég
- Ne legyen multi-tenant — egy mosó van
- Ne legyen mobil app — PWA + add to homescreen elég
- Ne legyen blockchain, AI chat, gamification, NFT-loyalty
- Ne legyen "Uber for car wash" funkció
- Ne tegyük át Next.js-re csak mert "skálázódóbb"
- ~~Ne integráljuk Stripe-pal most~~ → **v1.1: Stripe build now, hidden** (lásd Phase 8)
- Ne építsünk saját identity provider-t — admin password-ön kívül nincs szükség
- Ne tároljunk eredeti felbontású fotót — kliens-oldal komprimálás kötelező

## 13.1 Image compression — kötelező strategy

Minden feltöltött fotóra (receipt + damage):

- **Kliens oldal**: Canvas-alapú resize → **WebP @ quality 0.85** → max **1600px** szélesség (vagy magasság, amelyik nagyobb)
- **Eredmény**: 3-5MB iPhone-fotó → **150-400KB WebP**, OCR-rel olvasható
- **R2 storage** ezzel: 10000 nyugta = ~3GB (10000 × 300KB) — bőven befér a free tierbe
- **Eredeti fotó**: NEM tartjuk meg — privacy + storage cost
- Ha valaki túl pici képet csinál (<400px szél), **figyelmeztetés** "túl alacsony felbontás, készíts újat"

Részletes Canvas/WebP kód: `CRM-PATTERNS.md` Image Compression fejezet.

---

## 14. Decision log — miért így döntöttünk

- **D1 vs Postgres**: D1, mert a meglévő rendszer is ezen van, és 50 ezer tranzakció/évig nincs gond.
- **Egy repo**: kevesebb friction, ugyanaz a deploy.
- **PIN + password**: PIN a fizikai tablethez, password az online admin-hoz. Külön bejárat.
- **PBKDF2 vs bcrypt**: bcrypt nem Workers-kompatibilis (Node crypto). PBKDF2 Web Crypto API-val natív, gyors, biztonságos (100K iteráció).
- **R2 vs Images**: R2 szabadabb, kevesebb overhead, OCR-hez direkt URL.
- **Image compression kliens-oldalon**: Worker CPU-time spórolás + bandwidth-spórolás + privacy (eredeti soha nem hagyja el a böngészőt).
- **Telegram a Slack helyett**: ingyenes, instant push, mindenkinek van telefonja.
- **paraglide-js a astro-i18n helyett**: type-safe, tree-shakeable, modernebb Astro 6-tal.
- **Recharts vs D3**: Recharts elég, gyorsabban lemegy.
- **Resend vs SendGrid**: Resend mert már a stackben.
- **Stripe build-but-hide**: amikor üzletileg kell, env vars + flag flip, nem kell újra deploy. Ne építsünk **úgy** mintha sose lenne kell.
- **Astro 5 → 6**: Laszlo döntés v1.1-ben.

---

**Vége. Claude Code-nak ezzel az egy dokumentummal el lehet indulni a Phase 0-tól.**

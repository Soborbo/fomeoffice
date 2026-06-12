# Foam Office — foamoffice.co.uk

> Your Car's Place of Work. Clock in dirty. Clock out spotless.

Office-themed hand car wash & valeting site for Foam Office (Southmead, Bristol), with an integrated booking flow and staff CRM. Built with Astro on Cloudflare Workers.

## Stack

- **Astro 6** + **TypeScript** — site framework (SSR on Cloudflare, marketing pages prerendered)
- **Cloudflare Workers** — hosting (`wrangler.json` / `wrangler-worker.json`), D1 database, R2 storage
- **Tailwind CSS 4** — styling (design tokens in `src/styles/global.css`)
- **Three.js** — foam bubble hero animation (`src/components/FoamBubbles.astro`)
- **Zod 4** — API input validation
- **Resend** — transactional email
- **Paraglide (inlang)** — i18n for the staff CRM (en, ar-EG)

## Brand

Single source of truth: `src/data/site-config.ts` (name, taglines, contacts, hours) and `src/data/services.ts` (services, pricing, FAQ, the career-ladder package names: Probation Wash → Managing Director Valet).

Logo assets: `public/images/foam-office-logo.svg`, `public/images/foam-office-mark.svg` (also the favicon). Palette: navy `#12325C`, corporate blue `#1B6FD8`, foam blue `#2F8BFF`, sticky-note yellow `#FFD84D`.

Highlighted products: **Ceramic Coating** (`/ceramic-coating-bristol/`) and **Caravan Cleaning** (`/caravan-cleaning-bristol/`).

## Commands

| Command                   | Action                                       |
| :------------------------ | :------------------------------------------- |
| `npm install`             | Install dependencies                         |
| `npm run dev`             | Dev server at `localhost:4321`               |
| `npm run build`           | Production build to `./dist/`                |
| `npm run typecheck`       | `astro check`                                |
| `npm run deploy`          | Build + `wrangler deploy`                    |
| `npm run db:migrate`      | Run D1 migrations (see `migrations/`)        |

## Structure

- `src/pages/` — marketing pages (`index`, service pages, `contact`, `blog`) + `/admin` and `/app` (staff CRM) + `/api`
- `src/components/` — Header, Footer, BookingForm (modal), PricingTable, ServicePageTemplate, FoamBubbles
- `src/lib/` — CRM domain logic (auth, db, email, cron, invoices)
- `docs/` — CRM user guide and audits

# Leave Management CRM

An AI-powered leave management system. Employees describe the leave they need in plain English; Google Gemini extracts the date and reason, the monthly allowance is applied automatically, and administrators get a full management dashboard.

> "I need leave on Friday because I have university exams."
> → `{ "date": "2026-08-14", "reason": "University exams" }` → filed, decided, and emailed.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Installation](#installation)
- [Environment variables](#environment-variables)
- [Database setup](#database-setup)
- [Running locally](#running-locally)
- [Default credentials](#default-credentials)
- [Project architecture](#project-architecture)
- [Folder structure](#folder-structure)
- [Authentication flow](#authentication-flow)
- [Email verification flow](#email-verification-flow)
- [AI workflow](#ai-workflow)
- [Leave approval logic](#leave-approval-logic)
- [API reference](#api-reference)
- [Security](#security)
- [Production deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)

---

## Features

**Employees**

- Register with name, email and password only — no profile questions up front
- Six-digit email verification with expiring codes and a resend cooldown
- Guided profile setup after verification (photo, phone, department, position, joining date)
- Dashboard with remaining allowance, monthly usage, status breakdown and a six-month trend chart
- Natural-language leave requests — no date pickers
- Searchable, filterable, sortable leave history with CSV export

**Administrators**

- Separate sign-in route (`/admin/login`) and dashboard
- Overview cards: total / active employees, approved / pending / rejected leaves
- Monthly leave trend and department-wise breakdown charts, plus a recent activity feed
- Employee management: search, filter, sort, edit, suspend, reactivate, delete
- Leave management: search, filter, sort, approve, reject, drill into any employee profile
- CSV export that always matches the filters currently on screen

**Platform**

- Light / dark / system themes with glassmorphic surfaces
- Responsive from mobile through desktop
- Loading skeletons, empty states, toast notifications and confirmation dialogs throughout
- Transactional email on registration, verification, approval, rejection, profile update and account status change

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router) + React 19 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix primitives) |
| Forms | React Hook Form + Zod |
| Database | PostgreSQL + Prisma 6 |
| Auth | NextAuth v5 (Auth.js), credentials provider, JWT sessions |
| Hashing | bcryptjs |
| Email | Nodemailer |
| AI | Google Gemini (free tier) via REST |
| Charts | Recharts |
| Toasts | Sonner |
| Icons | Lucide React |

**Two deliberate substitutions**

- **`bcryptjs` instead of native `bcrypt`.** Identical API and hash format, but pure JavaScript — no `node-gyp` toolchain needed, which keeps installs reliable on Windows and in slim Docker images. Cost factor is 12.
- **Gemini over `fetch` instead of an SDK.** One less dependency to track, full control over timeouts, retries and `responseSchema`. See `src/services/ai.service.ts`.

---

## Installation

**Requirements:** Node.js 18.18+ (tested on 24), npm 9+, and a PostgreSQL 14+ database.

```bash
git clone <your-repo-url>
cd leave-management-crm
npm install
cp .env.example .env      # Windows: copy .env.example .env
```

---

## Environment variables

Every variable is validated at runtime by `src/lib/env.ts`; a missing or malformed value fails fast with a message naming the offending key.

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | ✅ | Session signing key, **32+ characters** |
| `NEXTAUTH_URL` | ✅ | App base URL (`http://localhost:3000` locally) |
| `GEMINI_API_KEY` | ✅ | Free key from [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `GEMINI_MODEL` | — | Defaults to `gemini-2.0-flash` |
| `EMAIL_HOST` | ✅ | SMTP host (e.g. `smtp.gmail.com`) |
| `EMAIL_PORT` | — | Defaults to `587` |
| `EMAIL_SECURE` | — | `"true"` for port 465 |
| `EMAIL_USER` | ✅ | SMTP username |
| `EMAIL_PASSWORD` | ✅ | SMTP password / app password |
| `EMAIL_FROM` | — | From header, e.g. `Leave CRM <no-reply@yourdomain.com>` |
| `APP_NAME` | — | Branding, defaults to `Leave CRM` |
| `HR_CONTACT_PHONE` | — | Phone shown in the quota-exceeded message |

Generate a secret:

```bash
openssl rand -base64 32
```

**Gmail SMTP:** enable 2-Step Verification, then create an [App Password](https://myaccount.google.com/apppasswords) and use that 16-character value as `EMAIL_PASSWORD`. Your regular account password will not work.

---

## Database setup

Any PostgreSQL 14+ instance works.

<details>
<summary><strong>Neon</strong> (free tier, recommended)</summary>

1. Create a project at [neon.tech](https://neon.tech)
2. Copy the pooled connection string
3. `DATABASE_URL="postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require"`
</details>

<details>
<summary><strong>Supabase</strong></summary>

1. Create a project at [supabase.com](https://supabase.com)
2. Settings → Database → Connection string → URI
3. `DATABASE_URL="postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres"`
</details>

<details>
<summary><strong>Local PostgreSQL / Docker</strong></summary>

```bash
docker run --name leave-crm-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
```

`DATABASE_URL="postgresql://postgres:postgres@localhost:5432/leave_crm?schema=public"`
</details>

### Prisma migration

```bash
npm run db:generate    # generate the Prisma client
npm run db:migrate     # create and apply the initial migration
npm run db:seed        # create the default admin (+ demo data)
```

`db:migrate` creates a versioned migration under `prisma/migrations/` — use this for anything you intend to deploy. For throwaway experiments, `npm run db:push` syncs the schema without a migration file.

| Script | Purpose |
| --- | --- |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:migrate` | Create + apply a migration (development) |
| `npm run db:deploy` | Apply pending migrations (production) |
| `npm run db:push` | Sync schema without a migration file |
| `npm run db:seed` | Seed the admin and demo data |
| `npm run db:studio` | Open Prisma Studio |

---

## Running locally

```bash
npm run dev       # http://localhost:3000
```

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (runs `prisma generate` first) |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

Health check: `GET /api/health` (add `?smtp=1` to also verify the mail transport).

---

## Default credentials

Created by `npm run db:seed`:

| Role | Email | Password | Sign in at |
| --- | --- | --- | --- |
| Admin | `admin@example.com` | `Admin123@` | `/admin/login` |
| Employee (demo) | `ayesha@example.com` | `Employee123@` | `/login` |

Override the admin values with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, and set `SEED_DEMO_DATA="false"` to skip demo employees.

> **Change the admin password before deploying.**

---

## Project architecture

A strict four-layer flow keeps business rules out of both the UI and the database access code:

```
Route Handler   →  parse + validate input (Zod), enforce auth, shape the response
      ↓
Service Layer   →  business rules: leave quota, OTP lifecycle, AI extraction, email
      ↓
Repository      →  the only code that touches Prisma; returns typed DTOs
      ↓
Prisma / PostgreSQL
```

**Why it is split this way**

- **Route handlers stay thin.** Every handler is wrapped in `handleRoute()`, which converts any thrown `AppError` into a correctly-shaped JSON response and logs unexpected failures without leaking internals.
- **Services own the rules.** The four-leaves-per-month policy lives in exactly one place (`leave.service.ts`) and is enforced identically for the automatic path and the admin override.
- **Repositories own Prisma.** Swapping the ORM, or adding caching, touches one layer. `employeeSelect` guarantees the password hash is never returned by an endpoint.
- **Errors carry their status.** `AppError` subclasses (`NotFoundError`, `ForbiddenError`, `RateLimitError`, …) mean no handler needs a chain of `instanceof` checks.

**Edge/Node split.** `middleware.ts` runs on the Edge runtime, which cannot bundle Prisma. Auth config is therefore split: `auth.config.ts` (Edge-safe, no Prisma or bcrypt) is imported by middleware, while `auth.ts` adds the credentials provider for Node. Enum comparisons in Edge code use `src/lib/enums.ts` — plain literals locked to the Prisma enums with `satisfies`, so a schema rename fails the typecheck instead of silently drifting.

---

## Folder structure

```
prisma/
  schema.prisma              Employee, Leave, OtpCode + enums
  seed.ts                    Default admin and demo data
src/
  app/
    (auth)/                  login, register, verify-email, admin/login
    (onboarding)/            profile/setup — post-verification, no dashboard chrome
    (employee)/              dashboard, leaves, leaves/new, profile
    (admin)/admin/           overview, employees, employees/[id], leaves
    api/
      auth/                  [...nextauth], register, verify-email, resend-otp
      leaves/                list, ai, [id], export
      admin/                 employees, employees/[id], employees/[id]/status, stats
      dashboard/ search/ health/
  components/
    ui/                      shadcn/ui primitives
    layout/                  app shell, sidebar, global search, user menu
    auth/ profile/ leaves/ admin/ dashboard/ charts/ shared/
  hooks/                     use-api-resource, use-leave-table, use-employee-table, …
  lib/                       prisma, auth, env, errors, api, rate-limit, date, enums
  repositories/              employee, leave, otp
  services/                  auth, leave, ai, employee, admin, search, email
  types/                     shared view models + NextAuth augmentation
  validations/               Zod schemas shared by client and server
  middleware.ts              Route protection and role-based redirects
```

---

## Authentication flow

```
Register (name, email, password)
   └─→ account created, unverified   ──→ welcome email + OTP email
Verify email (6-digit code)
   └─→ emailVerified set             ──→ confirmation email
Sign in
   └─→ credentials checked           ──→ JWT session issued
Profile incomplete?
   └─→ yes → /profile/setup  ·  no → /dashboard  (admins → /admin)
```

Sign-in is refused — with a specific, actionable message — when the email is unverified or the account is suspended. Middleware then enforces, on every page request:

- unauthenticated → redirected to `/login` (or `/admin/login` for admin routes), with `callbackUrl` preserved
- suspended → signed out
- non-admin hitting `/admin/*` → redirected to `/dashboard`
- employee with an incomplete profile → held at `/profile/setup`
- already signed in → bounced off the auth pages

API routes are excluded from middleware on purpose: they answer with `401`/`403` JSON via `requireUser()` / `requireAdmin()` rather than redirecting a `fetch` to an HTML page.

---

## Email verification flow

1. On registration a cryptographically secure 6-digit code (`crypto.randomInt`) is generated.
2. It is stored with a **10-minute** expiry; any outstanding codes for that account are invalidated, so only the newest is ever valid.
3. The user cannot sign in until `emailVerified` is set.
4. Resend is allowed after **60 seconds**, tracked server-side — the client countdown is only a hint, and a 429 carries the authoritative remaining time.
5. Five wrong attempts invalidate the code and force a resend.
6. Verification and resend are rate-limited per IP **and** per email address, so a shared NAT can't lock out unrelated users and one account can't be brute-forced from many IPs.
7. `resendOtp` reports success even for unknown addresses, so the endpoint cannot be used to enumerate accounts.

---

## AI workflow

```
Employee types free text
        ↓
POST /api/leaves/ai            ← rate-limited per user (the AI quota is the cost being protected)
        ↓
extractLeaveDetails()          ← Gemini, temperature 0, responseSchema, 20s timeout
        ↓
   valid JSON? ──no──→ retry once with a corrective prompt
        ↓                              ↓
       yes                     still invalid → AiServiceError (friendly message, no crash)
        ↓
{ date, reason } → quota check → Leave row created
```

**The raw prompt is never persisted.** Only the extracted `date` and `reason` reach the database.

Robustness measures, all covered by the verification harness:

- `responseMimeType: application/json` plus an explicit `responseSchema` constrain the model
- A brace-matching extractor recovers the JSON object even from markdown fences, surrounding prose, nested braces or escaped quotes
- The result is validated with Zod, and the date is checked to be a real calendar date (`2026-13-45` is rejected)
- Exactly one retry, then a typed `AiServiceError` — the application never crashes on bad model output
- Transport and auth failures (401/403) short-circuit instead of wasting the retry
- Relative dates ("tomorrow", "Friday", "next Monday") resolve against today's UTC date, supplied in the prompt

---

## Leave approval logic

Each employee may have **4 approved leaves per calendar month**.

```
new request for date D
        ↓
count APPROVED leaves in the calendar month containing D
        ↓
   count < 4  ──→ APPROVED   → approval email, remaining balance shown
   count ≥ 4  ──→ REJECTED   → rejection email with the HR message
```

When the allowance is exhausted the response is exactly:

> You have already used the maximum of 4 approved leaves this month. Please contact HR at +923145868205 for further assistance.

Details worth knowing:

- The quota is evaluated against the month the **leave falls in**, not the month the request is made — a request filed in March for an April date draws on April's allowance.
- Automatic approval can never exceed 4. The admin override path enforces the same ceiling, so approving a fifth leave is blocked there too.
- Duplicate requests for a date the employee already has pending or approved are rejected with a conflict.
- All date maths is done in UTC (`src/lib/date.ts`) so a leave on the 14th reads as the 14th regardless of server timezone.

---

## API reference

All responses use the envelope `{ success: true, data }` or `{ success: false, error, code, details? }`.

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Public | Create an account, send OTP |
| `POST` | `/api/auth/verify-email` | Public | Verify a 6-digit code |
| `POST` | `/api/auth/resend-otp` | Public | Reissue a code (60s cooldown) |
| `GET/POST/PATCH` | `/api/profile` | Employee | Read, complete or update own profile |
| `GET` | `/api/dashboard` | Employee | Dashboard payload in one round trip |
| `GET` | `/api/leaves` | Auth | List leaves (employees scoped to their own) |
| `POST` | `/api/leaves/ai` | Employee | Natural-language leave request |
| `GET/PATCH/DELETE` | `/api/leaves/[id]` | Auth / Admin | Read; approve-reject; delete |
| `GET` | `/api/leaves/export` | Auth | CSV export honouring current filters |
| `GET` | `/api/search` | Auth | Global search, scoped by role |
| `GET` | `/api/admin/stats` | Admin | Overview, charts, recent activity |
| `GET` | `/api/admin/employees` | Admin | Paginated employee list |
| `GET/PATCH/DELETE` | `/api/admin/employees/[id]` | Admin | Read, edit or delete an employee |
| `PATCH` | `/api/admin/employees/[id]/status` | Admin | Suspend or reactivate |
| `GET` | `/api/health` | Public | Liveness probe |

---

## Security

| Concern | Measure |
| --- | --- |
| Password storage | bcrypt, cost factor 12, salted per password |
| Password policy | 8+ chars with upper, lower, digit and symbol — enforced on both client and server |
| Session | Signed JWT in an httpOnly cookie, 7-day expiry |
| Authorisation | `requireUser` / `requireAdmin` guards plus `assertOwnerOrAdmin` for record-level checks |
| SQL injection | Prisma parameterises every query; no string-built SQL |
| XSS | React escapes by default; email templates escape all interpolated user values |
| CSRF | NextAuth's built-in token on auth routes; mutations require the session cookie and a JSON content type |
| Rate limiting | Fixed-window limiter on login, register, verify, resend and AI endpoints |
| Account enumeration | Resend-OTP returns success for unknown addresses |
| Data exposure | `employeeSelect` omits the password hash from every read path |
| CSV injection | Cells beginning `=`, `+`, `-` or `@` are prefixed so spreadsheets treat them as text |
| Privilege guards | Admins cannot suspend or delete their own account, or any other admin |

The in-memory rate limiter is per-process, which suits a single node. For multi-instance deployments, swap the `store` in `src/lib/rate-limit.ts` for Redis or Upstash — the interface is a single `enforceRateLimit` call.

---

## Production deployment

### Vercel

1. Push to GitHub and import the repository at [vercel.com/new](https://vercel.com/new)
2. Add every variable from `.env.example` under **Settings → Environment Variables**
3. Set `NEXTAUTH_URL` to your production domain
4. Deploy — `npm run build` runs `prisma generate` automatically
5. Apply migrations and seed once:

```bash
npx prisma migrate deploy
npm run db:seed
```

### Self-hosted / Docker

```bash
npm ci
npx prisma migrate deploy
npm run build
npm start
```

**Pre-flight checklist**

- [ ] `NEXTAUTH_SECRET` is freshly generated, 32+ characters, and not the example value
- [ ] `NEXTAUTH_URL` matches the deployed origin exactly (scheme included)
- [ ] The default admin password has been changed
- [ ] `SEED_DEMO_DATA="false"` for a clean production database
- [ ] SMTP credentials verified via `/api/health?smtp=1`
- [ ] Database connection uses `sslmode=require`

---

## Troubleshooting

**`Invalid environment configuration`** — the message names the offending key. Compare `.env` against `.env.example`; `NEXTAUTH_SECRET` must be at least 32 characters.

**Emails aren't arriving** — Gmail needs an App Password, not your account password. Check `/api/health?smtp=1`, and look in spam.

**`The AI service is not configured correctly`** — a 401/403 from Gemini. Confirm `GEMINI_API_KEY` and that the Generative Language API is enabled for the project.

**`I couldn't understand that request`** — Gemini returned unusable JSON twice. Rephrase with a clearer date, e.g. "I need leave on Friday because I have university exams."

**`Can't reach database server`** — verify `DATABASE_URL`, that the instance is running, and that your IP is allowed. Hosted providers usually require `?sslmode=require`.

**Prisma client out of sync after a schema edit** — run `npm run db:generate`.

**Stuck on the profile setup screen** — the session flag refreshes on save; sign out and back in if it persists.

---

## License

MIT

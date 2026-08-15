# Leave Management CRM

An AI-powered leave management system. Employees describe the leave they need in plain English; Groq extracts the date and reason, the monthly allowance is applied automatically, and administrators get a full management dashboard.

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
- [Attendance](#attendance)
- [API reference](#api-reference)
- [Security](#security)
- [Production deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)

---

## Features

**Employees**

- Join from an emailed invitation link — name and password only, no profile questions up front
- Six-digit email verification with expiring codes and a resend cooldown
- Guided profile setup after verification (photo, phone, department, position, joining date)
- Dashboard with remaining allowance, monthly usage, status breakdown and a six-month trend chart
- Natural-language leave requests — no date pickers
- Searchable, filterable, sortable leave history with CSV export
- Mark attendance from the office, verified against a 30-metre geofence by the server
- An emailed warning letter for any working day that goes unmarked past the cutoff

**Administrators**

- Separate sign-in route (`/admin/login`) and dashboard
- Invite people by email address, with the role and job title fixed at the moment of invitation
- Overview cards: total / active employees, approved / pending / rejected leaves
- Monthly leave trend and department-wise breakdown charts, plus a recent activity feed
- Employee management: search, filter, sort, edit, suspend, reactivate, delete
- Leave oversight: search, filter, sort and drill into any employee profile — requests are decided automatically, so there is nothing to approve
- Attendance roster for any date: who was present, absent, on leave, or with the office closed
- CSV export that always matches the filters currently on screen

**Platform**

- Light / dark / system themes with glassmorphic surfaces
- Responsive from mobile through desktop
- Loading skeletons, empty states, toast notifications and confirmation dialogs throughout
- Transactional email on invitation, registration, verification, leave approval, administrator decisions, profile update and account status change

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
| AI | Groq (free tier) via REST |
| Charts | Recharts |
| Toasts | Sonner |
| Icons | Lucide React |

**Two deliberate substitutions**

- **`bcryptjs` instead of native `bcrypt`.** Identical API and hash format, but pure JavaScript — no `node-gyp` toolchain needed, which keeps installs reliable on Windows and in slim Docker images. Cost factor is 12.
- **Groq over `fetch` instead of an SDK.** One less dependency to track, full control over timeouts, retries and JSON handling. See `src/services/ai.service.ts`.

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
| `GROQ_API_KEY` | ✅ | Free key from [Groq Console](https://console.groq.com/keys) — no credit card |
| `GROQ_MODEL` | — | Defaults to `llama-3.1-8b-instant` |
| `EMAIL_HOST` | ✅ | SMTP host — `smtp.hostinger.com` for the Zovencia mailbox |
| `EMAIL_PORT` | — | Defaults to `587`; use `465` for implicit TLS |
| `EMAIL_SECURE` | — | `"true"` for port 465 |
| `EMAIL_USER` | ✅ | SMTP username — the full address, e.g. `info@zovencia.com` |
| `EMAIL_PASSWORD` | ✅ | Mailbox password (or app password on providers that issue them) |
| `EMAIL_FROM` | — | From header. **Must match `EMAIL_USER`'s domain** or SPF fails and mail is filtered as spam |
| `APP_NAME` | — | Name shown on the app screens, defaults to `ZOVENCIA PRESENCE`. Email is unaffected — outgoing mail is always signed `Zovencia` |
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
  schema.prisma              Employee, Leave, OtpCode, Invitation, JobRole + enums
  seed.ts                    Default admin and demo data
src/
  app/
    (auth)/                  login, register, verify-email, admin/login, admin/register
    (onboarding)/            profile/setup — post-verification, no dashboard chrome
    (employee)/              dashboard, leaves, leaves/new, profile
    (admin)/admin/           overview, staff, staff/[id], leaves, attendance,
                             assistant, emails, working-days, access
    api/
      auth/                  [...nextauth], register, verify-email, resend-otp
      leaves/                list, ai, [id], export
      admin/                 employees, invitations, job-roles, requests, administrators, stats
      dashboard/ search/ health/
  components/
    ui/                      shadcn/ui primitives
    layout/                  app shell, sidebar, global search, user menu
    auth/ profile/ leaves/ admin/ dashboard/ charts/ shared/
  hooks/                     use-api-resource, use-leave-table, use-employee-table, …
  lib/                       prisma, auth, env, errors, api, rate-limit, date, enums
  repositories/              employee, leave, otp, invitation, job-role
  services/                  auth, invitation, leave, ai, employee, admin, search, email
  types/                     shared view models + NextAuth augmentation
  validations/               Zod schemas shared by client and server
  middleware.ts              Route protection and role-based redirects
```

---

## Authentication flow

```
Administrator invites an address, choosing role and job title
   └─→ Invitation stored, link emailed  ──→ invitation email
Recipient opens the link
   └─→ token resolved server-side       ──→ sign-up form, address fixed
Register (name, password)
   └─→ account created, unverified      ──→ welcome email + OTP email
       role and job title come from the invitation, never the form
Verify email (6-digit code)
   └─→ emailVerified set                ──→ confirmation email
       administrators additionally wait for super-admin approval
Sign in
   └─→ credentials checked              ──→ JWT session issued
Profile incomplete?
   └─→ yes → /profile/setup  ·  no → /dashboard  (admins → /admin)
```

Registration is by invitation only. The link carries a 32-byte random token whose SHA-256 is all the database stores, and it admits exactly the address it was sent to — a submitted email that differs from `invitation.email` is refused server-side. Invitations expire after 7 days, work once, and can be resent (which replaces the old link) or withdrawn (which kills it).

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
extractLeaveDetails()          ← Groq, temperature 0, JSON mode, 20s timeout
        ↓
   valid JSON? ──no──→ retry once with a corrective prompt
        ↓                              ↓
       yes                     still invalid → AiServiceError (friendly message, no crash)
        ↓
{ date, reason } → quota check → Leave row created
```

**The raw prompt is never persisted.** Only the extracted `date` and `reason` reach the database.

Robustness measures, all covered by the verification harness:

- `response_format: { type: "json_object" }` guarantees the reply parses as JSON (shape is Zod's job)
- A brace-matching extractor recovers the JSON object even from markdown fences, surrounding prose, nested braces or escaped quotes
- The result is validated with Zod, and the date is checked to be a real calendar date (`2026-13-45` is rejected)
- Exactly one retry, then a typed `AiServiceError` — the application never crashes on bad model output
- Transport and auth failures (401/403) short-circuit instead of wasting the retry
- Relative dates ("tomorrow", "Friday", "next Monday") resolve against today's UTC date, supplied in the prompt

---

## Leave approval logic

Each employee may have **4 approved leaves per calendar month**. The allowance decides every
request as it is made — there is no review step and no administrator approval.

```
new request for date D
        ↓
count APPROVED leaves in the calendar month containing D
        ↓
   count < 4  ──→ booked as APPROVED  → approval email, remaining balance shown
   count ≥ 4  ──→ refused outright    → the HR message, in the chat, nothing written
```

When the allowance is exhausted the response is exactly:

> You have already used the maximum of 4 approved leaves this month. Please contact HR at +923145868205 for further assistance.

Details worth knowing:

- The quota is evaluated against the month the **leave falls in**, not the month the request is made — a request filed in March for an April date draws on April's allowance.
- Nothing can exceed 4. There is no manual override to enforce the ceiling separately: administrators cannot approve or decline leave at all, so the policy is the only path.
- A refused request writes no row. The employee is told in the conversation rather than by a rejection email afterwards.
- Duplicate requests for a date the employee already holds are rejected with a conflict.
- All date maths is done in UTC (`src/lib/date.ts`) so a leave on the 14th reads as the 14th regardless of server timezone.

---

## Attendance

Employees mark themselves present from `/attendance`. The browser supplies its position; **the
server decides**.

```
Mark present
      ↓
browser asks for location permission
      ↓
latitude + longitude + accuracy  ──POST /api/attendance──▶  server
                                                              ↓
                                         office closed today? ──yes──▶ 409, nothing to mark
                                                              ↓ no
                                          already checked in? ──yes──▶ 200, the existing row
                                                              ↓ no
                                              accuracy > 30m? ──yes──▶ 422, ask for a better fix
                                                              ↓ no
                                       Haversine distance > 30m? ─yes─▶ 403, outside the office
                                                              ↓ no
                                                        201, PRESENT
```

### Configuration

One place, `src/lib/constants.ts`:

```ts
export const OFFICE_LOCATION = { latitude: 34.1751648, longitude: 73.2264346 };
export const ALLOWED_RADIUS_METERS = 30;
export const MAX_ACCURACY_METERS = ALLOWED_RADIUS_METERS;
```

Nothing else in the codebase names a coordinate. Moving the office means changing these values and
nothing else; check-ins already recorded keep the distance they were judged against.

### Rules worth knowing

- **The client is never trusted.** `markAttendanceSchema` is a `z.strictObject` accepting exactly three numbers, so a body carrying `distance`, `isInsideOffice` or `isPresent` is rejected with `422` rather than silently ignored.
- **The geofence is exactly 30 m and is never widened.** A GPS fix vaguer than 30 m cannot distinguish "inside the circle" from "near it", so it is refused (`422`) rather than accommodated — accuracy is never added to the radius.
- **One check-in per person per day**, enforced by a unique index rather than by a check-then-write. A repeat returns `200` with the row already there; eight concurrent taps produce one row.
- **Absence is derived, never stored.** `AttendanceStatus` has only `PRESENT`. A day reads `PRESENT` → `CLOSED` → `ON_LEAVE` → `ABSENT` in that order, computed on read — so withdrawing an office closure restores the previous meaning of a past day without migrating anything.
- **An office day off outranks attendance.** A closed date is not a working day, so nobody is absent on it and no check-in is taken.
- **There are no working hours in this project**, so `LATE` and `HALF_DAY` deliberately do not exist. The `status` column is where they would go once working hours are defined.
- **The admin roster is read-only.** Presence is proved by being in the building; a button that marked somebody present from a desk would be a way around the geofence.

### Warning letters

Anyone still absent after the day's cutoff is emailed a warning letter. The super admin sets the
rules from the Access panel:

| Setting | Default | What it does |
| --- | --- | --- |
| Cutoff time | **17:00** (5 PM Pakistan time) | Miss it on a working day and a letter goes out |
| Working days | **Mon–Fri** | Nobody is expected, or warned, on an unselected day |
| Send warning letters | On | Off switch; the rules stay configured |

- The sweep runs daily at **17:05 Asia/Karachi** (`5 12 * * *` UTC), five minutes after the default cutoff, and **checks for itself** that the deadline has passed — so moving the cutoff never needs a redeploy.
- **It reuses the same "who is absent" calculation the admin roster shows**, so a letter can never contradict the screen. Office closures and approved leave are excluded before the sweep sees anyone.
- **One letter per person per day**, enforced by a unique index rather than a check-then-write: eight concurrent sweeps produce one letter.
- The letter names the run — *"this is the 3rd working day in a row"* — counted honestly, skipping closures, non-working days and approved leave.
- **The super admin is never sent one.** They still read as absent on the roster.
- Working days govern who is *expected*, not who is *permitted*: somebody who comes in on a Saturday can still mark attendance, they are simply never chased for missing it.
- Geolocation requires a secure context — HTTPS in production (automatic on Vercel), or `localhost` in development. Opening the dev server over a plain-http LAN address on a phone is reported as unsupported.

---

## Reports

`/admin/reports` answers attendance, absence and leave over any period, for anyone. Three filters
combine freely:

| Filter | Options |
| --- | --- |
| **Period** | A month, a custom range (up to 366 days), or a single day |
| **People** | Everyone, all employees, all administrators, or named employees / administrators |
| **Records** | Attendance, Absent, Leave — any combination; all three reads as *All* |

The report gives an overall summary, a summary per person, and a searchable, sortable table of the
detailed records, with **Print** and a branded **CSV export** carrying the period, the selection, both
summaries and every record.

- **Access is `canViewAdminRecords`** — the HR grant the super admin hands out per administrator from
  the Access panel, and the same one that unlocks the population filter on the attendance roster.
  Unlike the other screens there is no unrestricted half to leave open: every row carries a `Role`
  column and the picker names what everybody is, so the whole feature sits behind the grant. It is
  read from the database on every request, so withdrawing it bites immediately. The endpoints refuse
  a caller without it regardless of what the screen rendered.
- **It owns no facts.** Every date is judged by `describeDay` — the same rule the attendance roster,
  the warning sweep and the assistant use — so office closures, the working week, approved leave,
  future days and `NO_RECORD` are all honoured without being re-derived. Lateness is read off the
  cutoff frozen on each row, so moving the deadline never rewrites a past report.
- **Exactly one record per person per day.** A day's single verdict decides the row's type, so
  selecting every record type cannot double-count anybody. Where a date holds a check-in *and*
  approved leave, the row reads Present and the leave rides beside it.
- **Days off are never records.** A closure or a weekly day off is counted in the summary as a day
  off and appears in no table — it is neither present, absent, nor leave, and costs nobody a leave.
- **Nothing is computed in the browser.** Filtering, summarising and paging all happen on the server,
  so the summary and the table always describe the same rows and a search cannot miss a match on
  page two. The export re-posts the request rather than serialising the screen.
- **The report is read-only** and writes nothing — verified by counting every table before and after.

---

## API reference

All responses use the envelope `{ success: true, data }` or `{ success: false, error, code, details? }`.

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Invitation | Create an account from an invitation token, send OTP |
| `POST` | `/api/auth/verify-email` | Public | Verify a 6-digit code |
| `POST` | `/api/auth/resend-otp` | Public | Reissue a code (60s cooldown) |
| `GET/POST/PATCH` | `/api/profile` | Employee | Read, complete or update own profile |
| `GET` | `/api/dashboard` | Employee | Dashboard payload in one round trip |
| `GET` | `/api/leaves` | Auth | List leaves (employees scoped to their own) |
| `POST` | `/api/leaves/ai` | Employee | Natural-language leave request |
| `GET/DELETE` | `/api/leaves/[id]` | Auth / Admin | Read; delete. No status endpoint — the allowance decides |
| `GET` | `/api/leaves/export` | Auth | CSV export honouring current filters |
| `GET/POST` | `/api/attendance` | Auth | Own history; mark present (always scoped to the session) |
| `GET` | `/api/admin/attendance` | Admin | Roster for a date — present, absent, on leave, closed |
| `POST` | `/api/admin/attendance/mark` | Admin + grant | Record an absent person present, overriding the location check |
| `GET` | `/api/admin/attendance/export` | Admin | CSV of the roster honouring current filters |
| `GET` | `/api/admin/attendance/policy` | Admin | Read the cutoff and working week |
| `PATCH` | `/api/admin/attendance/policy` | Super admin | Change the cutoff, working days or off switch |
| `POST` | `/api/admin/reports` | Admin + `canViewAdminRecords` | Generate an attendance/absence/leave report over a period |
| `POST` | `/api/admin/reports/export` | Admin + `canViewAdminRecords` | The same report, as a branded CSV |
| `GET` | `/api/admin/reports/people` | Admin + `canViewAdminRecords` | People a report may be pointed at, for the picker |
| `GET` | `/api/search` | Auth | Global search, scoped by role |
| `GET` | `/api/admin/stats` | Admin | Overview, charts, recent activity |
| `GET` | `/api/admin/employees` | Admin | Paginated employee list |
| `GET/PATCH/DELETE` | `/api/admin/employees/[id]` | Admin | Read, edit or delete an employee |
| `PATCH` | `/api/admin/employees/[id]/profile-lock` | Admin | Freeze or release their own profile editing |
| `PATCH` | `/api/admin/employees/[id]/status` | Admin | Suspend or reactivate |
| `GET/POST` | `/api/admin/invitations` | Admin | List invitations in scope; invite an address |
| `DELETE` | `/api/admin/invitations/[id]` | Admin | Withdraw an unaccepted invitation |
| `POST` | `/api/admin/invitations/[id]/resend` | Admin | Reissue the link and email it again |
| `GET/POST` | `/api/admin/job-roles` | Admin | List or add an assignable job title |
| `DELETE` | `/api/admin/job-roles/[id]` | Super admin | Remove a job title from the list |
| `GET` | `/api/admin/requests` | Super admin | Administrator registrations awaiting a decision |
| `PATCH` | `/api/admin/requests/[id]` | Super admin | Approve or decline an administrator |
| `GET` | `/api/admin/administrators` | Super admin | Administrators and the rights each one holds |
| `PATCH` | `/api/admin/administrators/[id]` | Super admin | Grant or withdraw one delegable right |
| `GET` | `/api/health` | Public | Liveness probe |

The Staff screen lives at `/admin/staff`, while the endpoints behind it keep the
`/api/admin/employees` path above — the screen was renamed and the API deliberately was not, since
moving it would rewrite every call site for something nobody sees. `/admin/employees` permanently
redirects to `/admin/staff` (`next.config.ts`) so links from before the rename still work.

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
| Invitation tokens | 32 random bytes; only the SHA-256 is stored, so a leaked backup yields no working link |
| Role escalation | Role and job title are read from the invitation server-side, never from the sign-up form |
| Invitation misuse | Single-use, 7-day expiry, and bound to the invited address — a mismatched email is refused |

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

**`The AI service is not configured correctly`** — a 401/403 from Groq. Confirm `GROQ_API_KEY` is set and still active in the [Groq Console](https://console.groq.com/keys).

**`The AI assistant is busy right now`** — a 429. The free tier allows 30 requests/minute and 14,400/day on `llama-3.1-8b-instant`; a retired or mistyped `GROQ_MODEL` also returns an error here.

**`I couldn't understand that request`** — the model returned unusable JSON twice. Rephrase with a clearer date, e.g. "I need leave on Friday because I have university exams."

**`Can't reach database server`** — verify `DATABASE_URL`, that the instance is running, and that your IP is allowed. Hosted providers usually require `?sslmode=require`.

**Prisma client out of sync after a schema edit** — run `npm run db:generate`.

**Stuck on the profile setup screen** — the session flag refreshes on save; sign out and back in if it persists.

---

## License

MIT

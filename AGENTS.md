# Leave Management CRM — working notes

AI-powered leave management. Next.js 15 (App Router), TypeScript, Prisma 6 + PostgreSQL,
NextAuth v5, Tailwind v4 + shadcn/ui. See `README.md` for setup and full documentation.

> This project is pinned to **Next.js 15**. `create-next-app` scaffolded 16 initially; the
> downgrade was deliberate, for compatibility with NextAuth v5 and the shadcn/ui flat config.
> Don't upgrade without re-verifying `middleware.ts` and the auth split below.

## Layering — keep it strict

```
route handler → service → repository → prisma
```

- **Route handlers** parse and validate (Zod), enforce auth, and shape responses. Wrap the body in
  `handleRoute()` so thrown `AppError`s become correct JSON. No business logic here.
- **Services** own business rules. The 4-leaves-per-month policy lives only in `leave.service.ts`.
- **Repositories** are the only code that imports `prisma`. Return DTOs built from the
  `*Select` constants — `employeeSelect` deliberately omits the password hash.
- Throw `AppError` subclasses (`NotFoundError`, `ForbiddenError`, `ConflictError`,
  `RateLimitError`, `AiServiceError`) rather than returning error objects; each carries its status.

## Edge runtime constraint

`middleware.ts` runs on Edge and **cannot** import `@prisma/client` — even for an enum. Use the
string literals in `src/lib/enums.ts` (`ROLE`, `EMPLOYEE_STATUS`, `LEAVE_STATUS`), which are pinned
to the Prisma enums with `satisfies`. The same applies to anything `middleware.ts` imports
transitively, including `src/lib/auth/auth.config.ts` — keep Prisma and bcrypt out of that file.

API routes are excluded from the middleware matcher on purpose: they must return 401/403 JSON via
`requireUser()` / `requireAdmin()`, not redirect a `fetch` to an HTML page.

## Registration is invite-only

Nobody self-registers. Every account starts from an `InviteKey`, and **the key's `role` is the
only thing that decides what the holder becomes** — `auth.service.register` reads it off the key,
never from the request body, so posting an employee key to the admin form still yields an employee.

| Key role   | Issued by                                        | Resulting account                                |
| ---------- | ------------------------------------------------ | ------------------------------------------------ |
| `EMPLOYEE` | super admin, or an admin with `canInviteEmployees` | `ACTIVE` once the email is verified               |
| `ADMIN`    | super admin only                                  | `PENDING_APPROVAL` until the super admin decides  |

`SUPER_ADMIN` is deliberately not issuable — that role is seeded, so no key can mint another owner.

**`canInviteEmployees` is off by default.** Being an admin is not by itself permission to onboard
people; the super admin grants it per administrator. `permissionsFor()` reads it from the database
on every issue rather than from the session, so withdrawing it takes effect on the next request
instead of when a token expires — don't "optimise" it into the JWT.

All the scoping lives in `invite.service.ts` and must stay in step: an admin sees and revokes only
the `EMPLOYEE` keys they issued, and `revoke` reports anything outside that as *not found* rather
than *forbidden*, so it cannot be used to probe for keys the caller may not see. Route handlers
guard with the looser `requireAdmin` on purpose — what a caller may actually grant is settled in
the service, against the role in the body. `/api/admin/invites` also returns `canIssue` purely so
the UI can hide a form it may not submit; it mirrors the real check, never replaces it.

`InviteKeySection` is shared by the super admin's access panel and the Employees screen.

## Administrators take leave too

An admin is an `Employee` with `role = ADMIN`, and draws the same `MONTHLY_LEAVE_ALLOWANCE`. The
`(employee)` layout therefore does **not** turn admins away — it keeps their admin navigation and
lets them use the personal screens for their own leave. Every leave route guards with `requireUser`
and keys off `employeeId`, so nothing there is employee-only.

`ADMIN_NAV` is split into a `Manage` group and a `Personal` group; the sidebar prints each heading
once, when the group changes. No self-approval hole exists to close: `bookLeave` writes rows
already approved when they fit the allowance, so the policy decides, not the person — and `decide`
re-checks the allowance before any manual override.

## Brand colour — the FILL vs INK rule

The Zovencia palette is fixed: **#0AEA0A** (brand green), **#023506** (dark green), black, white.
All of it lives in `src/app/globals.css`; no component may name a colour literal.

`#0AEA0A` is luminous — 12.8:1 on black but **1.64:1 on white**. So each semantic colour ships
as a pair, and which one you reach for depends on whether the colour is a *shape* or a *letter*:

| Use                                                        | Token                                      |
| ---------------------------------------------------------- | ------------------------------------------ |
| Fills, buttons, active pills, badges, progress, toggles, charts, focus rings, branding | `--primary` / `bg-primary`, `bg-brand` — **exactly #0AEA0A, never darkened** |
| Green *text* or a bare green *icon* on a light surface      | `--primary-ink` / `text-primary-ink`       |

`--success`, `--warning`, `--destructive` follow the same pattern (`-ink` suffix). Success *is*
the brand green. In dark mode every `-ink` collapses back to the pure brand colour, because on a
dark panel #0AEA0A already clears AA — the exception is only paid where it is actually needed.

Never use an `-ink` token as a background, and never put `text-primary` back: that pairing is what
the rule exists to prevent. When green text is hard to read, fix the *surface* (glass tint,
opacity, border, weight) rather than the brand colour.

The sidebar is a dark green slab in **both** themes. `glass-sidebar` re-declares `--foreground`,
`--muted-foreground`, `--accent` and friends onto the panel, so its children recolour for dark
ground through inheritance — restyle the tokens there, not the nav components.

## Conventions

- Dates are calendar days. Normalise through `src/lib/date.ts` (UTC midnight) — never construct
  `new Date(y, m, d)` directly, which uses local time and shifts the day.
- Server Components pass data to client components through `src/lib/serialize.ts`, which converts
  `Date` to ISO strings so the shape matches what the JSON API returns.
- Zod schemas in `src/validations/` are shared by both client forms and server handlers. Add
  validation there once rather than duplicating it.
- Email sending is fire-and-forget: `email.service.ts` logs and swallows failures so a bounced SMTP
  connection never fails the user action that triggered it.
- The raw natural-language leave prompt must never be persisted — only the extracted date and reason.
- Comments explain *why*, not *what*. Don't narrate the code.

## Before considering a change done

```bash
npm run typecheck && npm run lint && npm run build
```

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

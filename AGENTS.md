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

## Registration is by invitation, addressed to one mailbox

Nobody self-registers. An administrator enters an **email address** and a role; the system stores an
`Invitation` and mails a link. **The invitation's `role` is the only thing that decides what the
holder becomes** — `auth.service.register` reads it off the invitation, never from the request body,
so an employee link answered on the admin screen still yields an employee.

| Invitation role | Sent by                                            | Resulting account                                |
| --------------- | -------------------------------------------------- | ------------------------------------------------ |
| `EMPLOYEE`      | super admin, or an admin with `canInviteEmployees`  | `ACTIVE` once the email is verified               |
| `ADMIN`         | super admin only                                    | `PENDING_APPROVAL` until the super admin decides  |

`SUPER_ADMIN` is deliberately not issuable — that role is seeded, so no invitation can mint another
owner.

**The address is half the credential.** Registration compares the submitted email against
`invitation.email` and refuses a mismatch, so a forwarded link cannot onboard somebody else. The
form renders the address read-only, but that is a courtesy: the server compares rather than trusts.

The link carries a 32-byte random token; only its SHA-256 is stored (`Invitation.tokenHash`), so a
leaked backup hands over nothing usable. It is deliberately *not* a JWT like the reset ticket —
withdrawing an invitation has to kill the link that is already sitting in a mailbox, and only a row
in the database can say that. Never surface the token as a "key" or ask anyone to type it.

An invitation may also carry a **`JobRole`**, a curated job title. Accepting stamps its *name* onto
the new account's `position` — copied by value, so renaming or deleting the job role later never
retitles people who already hold it, and `position` stays the single field describing what someone
does. There is deliberately no third field competing with `position` and `department`.

Any admin may add a title (naming the jobs you hire for is bookkeeping); only the super admin may
remove one, since that changes what everyone else can pick. Because the title is assigned rather
than claimed, `ProfileForm` renders `position` read-only once set — administrators change it
through the separate edit dialog on the People screen.

**`canInviteEmployees` is off by default.** Being an admin is not by itself permission to onboard
people; the super admin grants it per administrator. `permissionsFor()` reads it from the database
on every invitation rather than from the session, so withdrawing it takes effect on the next request
instead of when a token expires — don't "optimise" it into the JWT. `resend` re-checks it too: a
resend is a fresh act of onboarding, not something inherited from whoever sent the first one.

`email` is unique on the table, so "already invited" is settled by the database rather than only by
the service that checked a moment earlier. A live invitation is never silently replaced — that is
what `resend` is for — but one that has lapsed is reissued in place, so a stale row cannot lock an
address out for good. Accepted rows cascade away with the account, freeing the address again.

All the scoping lives in `invitation.service.ts` and must stay in step: an admin sees, resends and
withdraws only the `EMPLOYEE` invitations they sent, and anything outside that is reported as *not
found* rather than *forbidden*, so it cannot be used to probe for invitations the caller may not
see. Route handlers guard with the looser `requireAdmin` on purpose — what a caller may actually
grant is settled in the service, against the role in the body. `/api/admin/invitations` also returns
`canIssue` purely so the UI can hide a form it may not submit; it mirrors the real check, never
replaces it.

`InvitationSection` is shared by the super admin's access panel and the Employees screen.
`InvitationGate` resolves the link server-side and renders either the sign-up form or the one thing
left to do about a link that has expired, been used, or never existed.

Delivery is reported, not thrown: `emailService` swallows failures as everywhere else, but `invite`
and `resend` return `emailSent` so the panel can say the link never left. An invitation nobody
received is the whole of the thing, and the administrator is the only person able to notice.

## Each sign-in screen admits one kind of account

`/login` takes employees, `/admin/login` takes administrators, and neither accepts the other. The
screen submits a `portal` field alongside the credentials and `authenticate` refuses a mismatch.

`portal` is **required, never defaulted** — a request that omits it fails validation outright, so
the check cannot be skipped by leaving the field off. The comparison happens *after* the password
is verified: doing it earlier would turn the sign-in form into a way of asking "is this address an
administrator?" without knowing the password.

Being sent to the wrong screen is a mistake, not an attack, so the message names the right one and
the address is carried across in the query string rather than retyped.

## Five wrong passwords locks the account

Every account is locked after `MAX_LOGIN_ATTEMPTS` consecutive failed sign-ins and is released only
by answering an emailed code — employee, admin and super admin alike, since a guessed password is no
less dangerous for being a senior one. `failedLoginAttempts` counts *consecutive* failures, so a
right password ends the run and five typos spread over a year never add up to a lock.

The lock is `Employee.lockedAt`, deliberately **not** `emailVerified = null`. Clearing that would
forget the address was ever proven, and would drop a locked-out administrator out of
`listPendingAdmins`, which filters on it.

**The form counts down out loud**: a wrong password on an account that exists reports how many
tries are left, in the same wording `assertOtp` uses on a wrong code, and the last one says the
account is now locked. This is a deliberate exception to the rule the `portal` check follows,
and it is the one place the sign-in screen will confirm that an address is registered here — an
unknown address keeps the flat "incorrect email or password". The trade was made on purpose: a
colleague mistyping their password should see the lock coming rather than walk into it, and in an
invitation-only system for one company the roster is not the secret. Don't extend the countdown to
unknown addresses by inventing a shadow counter for them, and don't quietly remove it either.

A locked account is turned away **before** `verifyPassword` is called, so every later attempt gets
the unlock message however right or wrong the password is. That also means `registerFailedLogin`
can never see a locked account, which is why reaching the cap is what sends the code — and why
nothing has to guard against mailing a second one.

Reaching the cap sends `accountLockedTemplate`, which carries the unlock code and doubles as the
warning that somebody was guessing at the password.

Anything that proves the mailbox clears the lock, and does it in the same write: `markEmailVerified`
and `updatePassword` both reset the streak, so answering the code and completing a password reset
each release the account. `needsEmailProof()` is what `verifyEmail` and `resendOtp` ask — never
`emailVerified` on its own — otherwise a locked account that was verified years ago would be turned
away from the verification screen as already verified.

The refusal says "verify your email" on purpose: `LoginForm` routes on that phrase, and carries the
`portal` across so an unlocked administrator lands back on `/admin/login` rather than the employee
door.

Live sessions are not revoked. The JWT is a snapshot, and ending the owner's session over failures a
stranger caused would make the lock a denial of service — which it partly is anyway, since anyone
who knows an address can lock it with five wrong guesses. The mailbox is the way back, by design.

## The session is a snapshot; the chrome is not

The JWT is written once at sign-in and never revisited, so anything copied into it is frozen at
that moment. The sidebar and topbar therefore read the name and avatar through `chromeUser()`,
which queries the database on every render — otherwise a photo uploaded from `/profile` would not
reach the corner of the screen until the token expired a week later.

**Never put the profile photo in the token.** Avatars are stored as data URLs, so a modest one is
tens of kilobytes, and session state rides along on every request as a cookie — Vercel caps
request headers far below that. `AuthenticatedEmployee` deliberately has no `image` field.

`profileComplete` is the exception that proves the rule: it is one boolean, and `ProfileForm`
refreshes it explicitly through `useSession().update()` because `middleware.ts` reads it on the
Edge, where a database query is not available.

## Who may act on whose account

`assertMayManage` in `employee.service.ts` is the single seniority rule, applied to **every** read
and write of another account — `adminUpdate`, `setStatus`, `remove`, and `byIdForActor`:

- nobody acts on their own account here (that is what `/profile` is for)
- an admin manages `EMPLOYEE` accounts only
- `ADMIN` accounts answer to the super admin alone
- `SUPER_ADMIN` is unmanageable from the dashboard by anyone, itself included — suspending or
  deleting it would leave nobody able to approve administrators

Editing counts as a privileged action because changing an email address is the first half of an
account takeover: the new address can then be sent a password reset. Refusals on reads are phrased
as *not found*, so the endpoints cannot be used to discover which ids belong to administrators.

Listing is gated in the route handler — `role=ADMIN` on `/api/admin/employees` requires super
admin — because the roster is the route to every action on those accounts. `SUPER_ADMIN` is not a
value `employeeQuerySchema` accepts, so it can never be listed.

`setStatus` only toggles accounts that are already `ACTIVE` or `SUSPENDED`. An administrator in
`PENDING_APPROVAL` or `REJECTED` belongs to the approval flow, which also checks the address was
verified — a status toggle would route around that.

## Passwords are changed by their owner alone

`PUT /api/profile/password` is the self-service change, on the `/profile` screen every role
shares. It guards with `requireUser` and nothing more: seniority has no bearing on a password,
because there is no way to aim this at another account — the id comes off the session and the
body carries only passwords.

The current password is re-proven even though the caller is signed in. A session shows someone
reached the machine, not that they are the owner, and this is the one change that locks the owner
out; the emailed code plays that part in the reset flow. `assertMayManage` is deliberately *not*
extended to let an admin set somebody else's password — `/forgot-password` already exists, and it
proves control of the mailbox rather than asking anyone to vouch.

A wrong current password is refused with `ValidationError` keyed to `currentPassword`, so the form
marks the box that was actually wrong.

## The allowance decides; nobody approves

Leave has no review step. `bookLeave` recomputes the plan and either writes the days already
`APPROVED` or refuses the request with a `ConflictError` the assistant relays there and then — so a
request is settled the moment it is made, and never waits on a person.

There is deliberately **no administrator approve/decline path**: no `PATCH /api/leaves/[id]`, no
`decide` on the service, no buttons on the Manage screen. Adding one back would reintroduce exactly
the discretion the policy exists to remove, and would let an admin approve past
`MONTHLY_LEAVE_ALLOWANCE` by hand. The admin leave screen is read-only — search, filter, export, and
open the person behind a row.

`LeaveStatus.PENDING` and `REJECTED` are therefore write-dead: nothing creates them any more. They
stay in the enum so rows predating this still render, and `Leave.decidedById` / `decidedAt` stay on
the model for the same reason. Don't read a `PENDING` row as "waiting for someone" — nobody is
coming.

## An office day off outranks leave

A `Holiday` is a date the whole company is closed. It is deliberately **not** modelled as a kind of
leave: leave belongs to a person and is drawn from their allowance, while this belongs to the
calendar and outranks anything an individual booked. A date in `holidays` is simply not a working
day, so it costs nobody a day of their allowance — including people who had already booked leave
across it.

Nothing is rewritten when the office closes. The leave rows stay exactly where they were, and every
count that decides an allowance asks `holidays` instead — `countApprovedInMonth`, `countByStatus`,
`monthlyTotals` and `departmentTotals` all take a `closedDates` list. That is what makes the rule
reversible: withdrawing a closure puts the day back on everyone's balance without reconstructing
anything, which a migration of leave rows could never do. `planLeave` filters closed days out of the
range *before* judging it, so a request spanning one books the days either side and is refused
outright only when nothing is left.

Attendance is where that outranking actually happens — see below. `holidayRepository.closedDatesAmong`
is the single question, and `attendance.service.ts` asks it *before* judging a position rather than
alongside it: on a closed day there is no attendance to take, so there is nothing to decide.

`SKIPPED` is not a failure: it means the closure was declared too late for a day-before warning to
mean anything. The date still closes the office. There is deliberately no `PENDING` — every closure
gets a real answer the moment it is created, so a "not looked at yet" value would be write-dead in
exactly the way `LeaveStatus.PENDING` became.

Closures that have already started cannot be edited or deleted. Deleting one would quietly bill
people a day of leave for a day the office was shut, and the row is the record of why nobody came
in.

### Announcing it — noon on the company's clock

`planHolidayNotice` is the whole rule and lives in `src/lib/holiday-notice.ts`, free of Prisma so it
can be read and tested on its own: announce at noon the day before, or immediately if that moment has
already passed. Both halves are judged in `APP_TIME_ZONE` through `appZoneInstant`, never in server
UTC — a server in UTC reaches "noon" five hours after Karachi does, which is the difference between
telling people the afternoon before and telling them nothing at all. `holiday-notice.test.ts` pins
this with UTC instants and passes under `TZ=America/New_York`; if it ever starts failing there,
something has begun trusting the server's clock.

**A second email is impossible because the row is claimed before anything is sent.** `claimNotice`
moves the status out of `SCHEDULED` with a conditional `updateMany`, so of any number of workers
racing on one closure the database picks exactly one winner and the losers are told. Claiming *after*
sending would leave a crash in between looking identical to a row nobody had touched. Verified by
racing eight workers that all hold the same due row: one claim succeeds, seven are refused.

The sweep runs from `vercel.json` against `/api/cron/holiday-notices`. **Cron expressions are UTC,
and this one is hand-converted**: `5 7 * * *` is 12:05 in Asia/Karachi, five minutes after the
announcements come due, so a slightly late firing still catches them and an early one cannot miss
them. Change `APP_TIME_ZONE` and this line has to move with it — and if it is ever pointed at a zone
that observes daylight saving, a fixed UTC cron will drift an hour twice a year while
`appZoneInstant` keeps computing `noticeDueAt` correctly, so the two would disagree for months at a
time.

Once a day is a constraint, not a preference: Vercel's Hobby plan refuses anything more frequent, and
the deploy fails outright rather than quietly running less often. It is the weak point of the
design — one failed run is one announcement nobody receives, because by the next firing the closure
is *today* and gets `SKIPPED`. On Pro, make it hourly (`5 * * * *`); the sweep claims each row before
sending, so running it twelve times over is indistinguishable from running it once.

It demands `CRON_SECRET` as a bearer token and **fails closed**: with no secret configured it refuses
everybody, because the alternative is an open endpoint that emails the entire organisation.

### Who may close the office

`canManageHolidays` mirrors `canInviteEmployees` exactly, down to being read from the database on
every request rather than carried in the session — closing the office is an organisation-wide act,
so it is the super admin's to delegate rather than something every admin inherits. The route guards
with the looser `requireAdmin` on purpose and lets `holiday.service.ts` settle the real question,
the same split the invitation routes use. `/api/admin/holidays` returns `canManage` purely so the
screen can hide a form it may not submit; it mirrors the real check and never replaces it.

Every administrator can *see* the closures whether or not they may change them, because knowing the
office is shut is everybody's business.

## Attendance is proved by standing there

Marking present is a claim about where somebody is, and the server is the only thing that judges it.
The browser sends **three numbers and no opinion** — latitude, longitude, `accuracyMeters` — and
`markAttendanceSchema` is a `z.strictObject`, so a body carrying `distance`, `isInsideOffice` or
`isPresent` is refused outright rather than quietly stripped. There is no field for a client verdict
to land in, and the loud refusal means an attempt to send one surfaces as an error somebody sees
instead of as attendance that appeared to work.

The office is `OFFICE_LOCATION` in `src/lib/constants.ts`, and `ALLOWED_RADIUS_METERS` is **30**.
Nothing else in the codebase names a coordinate. `src/lib/geo.ts` holds the whole rule — Haversine
and one `judgePosition` — free of Prisma so it can be read and tested alone, exactly like
`holiday-notice.ts`; `geo.test.ts` pins the boundary with offsets converted at the office's own
latitude, because a rule that only worked at the equator would pass a test built from round degrees.

**`MAX_ACCURACY_METERS` equals the radius, and that equality is the argument.** A fix accurate to
±30m cannot tell "inside a 30m circle" from "somewhere near it", so believing it would widen the
fence by exactly the amount the reading is unsure by. Such a reading is refused as *inaccurate*
rather than resolved generously — including when it lands inside the circle, which is the case that
matters, since that is the one where believing it marks somebody present who is not there. Accuracy
is **never added to the radius**. Don't "fix" a flaky check-in by widening either constant.

The two refusals are told apart by status on purpose: `422` for a vague fix asks for better input,
`403` for a real fix somewhere else is a refusal. A vague reading far outside still reports as
inaccurate, because that is the truth about what the server knows.

**Absence is the lack of a row, never a row.** `AttendanceStatus` has one value, `PRESENT`, and no
`ABSENT` — storing absence would need a nightly sweep to write it and would then have to unwrite it
whenever the office turned out to have been closed, which is the rewriting the holiday rules exist to
avoid. `attendance.service.ts` derives the day instead, in this order: an existing check-in outranks
everything (a closure declared afterwards must not erase the record of somebody who came in), then
`CLOSED`, then `ON_LEAVE`, then `ABSENT`. Withdraw a closure and yesterday goes back to what it was
with nothing migrated — verified.

The project has **no working hours**, so `LATE` and `HALF_DAY` are deliberately absent rather than
write-dead in the way `LeaveStatus.PENDING` became. The `status` column exists so they have somewhere
to land once working hours are actually defined; don't invent them to fill it.

`@@unique([employeeId, date])` is what prevents a second check-in, so a duplicate is settled by the
database rather than by the service that looked a moment earlier — eight concurrent taps produce one
row, verified. A repeat is answered **idempotently with `200` and the row already there**, not an
error: "you are already marked present, at 9:12" is the answer to what was asked.

The admin screen is day-centric because "present or absent" is only answerable one day at a time —
there are no absent rows to page through, so moving the date is how history is read. It is
**read-only**: presence is proved by being in the building, so a button that marked somebody present
from a desk would be a way around the geofence rather than a convenience. Unlike office days off,
attendance is not delegated per-administrator — seeing who is in is ordinary people-management, not
an organisation-wide act. The roster is fetched whole and paged in memory on purpose: the status a
row is filtered on does not exist in the database to filter by, so paging in SQL first would make
"today's absentees" return a page of whoever sorted first.

`/api/attendance` is scoped to the session id with **no way to widen it**, deliberately unlike
`/api/leaves`, where an admin may pass `employeeId` and gets the whole roster when they leave it off.
That is right for a Manage screen and wrong for a personal history, so the admin view lives at its
own endpoint.

### Missing the day earns a letter

Anyone still absent after the day's cutoff is emailed a warning. The sweep lives in
`attendance-warning.service.ts`, the rules it obeys are pure and tested in `attendance-policy.ts`,
and the deadline itself is a row: `AttendancePolicy`, a singleton the super admin edits from the
Access panel. **Read from the database on every sweep**, never cached — moving the cutoff has to bite
on the next run.

**It reuses `rosterEntries`, and that is the point.** "Absent" is computed in exactly one place, so
the letter can never disagree with what the admin screen showed. Anyone present, on approved leave,
or covered by a closure is already excluded before the sweep sees them.

Four gates, in this order, and the order is the argument: **warnings enabled → an ordinary working
day → not a declared closure → the cutoff has actually passed**. The closure check sits above the
clock for the same reason marking present does — on a day the office was shut there is nothing to
have missed.

**`workingDays` exists because nothing else here knows a weekend.** Leave counts every day, and
`Holiday` is per-date, so without it the sweep would write to the entire company every Saturday and
Sunday and the streak would climb through them. It also feeds the roster, where a non-working day
reads `NON_WORKING` rather than `ABSENT`. It deliberately does **not** block checking in: the working
week governs who is *expected* and who is *chased*, not who is permitted to record a day — somebody
who comes in on a Saturday can still mark it.

**The row is the claim, not the receipt.** `attendanceWarningRepository.claim` inserts before a word
is written, so the unique index on `(employeeId, date)` picks one winner out of any number of racing
sweeps — verified by racing eight. Claiming afterwards would make a crash in between look identical
to a day nobody had swept. A failed delivery leaves `sentAt` null and is **not retried**: mail is
fire-and-forget everywhere here, and a retry that cannot tell "never sent" from "sent, logging
failed" is how somebody gets the same letter twice.

`consecutiveMissed` is stored rather than recomputed, because it is what the letter *said* — a
closure declared next week must not rewrite words already sitting in somebody's inbox. Counting skips
closures, non-working days and approved leave: none of them is a miss, and none of them ends a run
either. It is capped at `LOOKBACK_DAYS`, so somebody who has never attended reads as a long run
rather than an infinite one.

**The super admin is never written to.** They are held to the rules like anyone and still read as
absent on the roster, but an automated letter telling the owner of the system to explain themselves
has nobody behind it.

The cron is `5 12 * * *` — **17:05 in Asia/Karachi, hand-converted**, five minutes after the default
cutoff. The sweep decides for itself whether the deadline has passed rather than trusting the
schedule to mean it has, because the cutoff is a setting and a cron line cannot follow it. That makes
frequency a knob rather than a correctness question: on Pro make it hourly (`5 * * * *`) and letters
land within the hour of whatever cutoff is configured. Same `CRON_SECRET`, same fail-closed rule.

**Marking present happens on the dashboard and nowhere else.** `/attendance` is history, read-only:
two places to press the same button read as two different actions, and the one that matters is the
one on the screen people already open. `MarkAttendanceCard` therefore takes `today` already resolved
and does no fetching — the dashboard carries it in the payload it was loading anyway, which is also
why there is no `/api/attendance/today`. If a second surface ever needs today's state, take it from
`attendanceService.todayFor` through whatever payload that surface already loads rather than adding
an endpoint back.

Geolocation needs a secure context: HTTPS in production, localhost in development. Opening the app
over plain http on a LAN address to test on a phone is the one case that bites, and
`isGeolocationAvailable()` reports it as `unsupported` with a message that says so.

## Administrators take leave too

An admin is an `Employee` with `role = ADMIN`, and draws the same `MONTHLY_LEAVE_ALLOWANCE`. The
`(employee)` layout therefore does **not** turn admins away — it keeps their admin navigation and
lets them use the personal screens for their own leave. Every leave route guards with `requireUser`
and keys off `employeeId`, so nothing there is employee-only.

`ADMIN_NAV` is split into a `Manage` group and a `Personal` group; the sidebar prints each heading
once, when the group changes. No self-approval hole exists to close, because there is no approval:
`bookLeave` writes rows already approved when they fit the allowance and refuses them outright when
they do not, so the policy decides and nobody can overrule it. The leave assistant is therefore open
to admins too — signing out and back in as somebody else was never a security boundary, only a chore.

Scope is the thing to keep an eye on. `/api/leaves` reads `employeeId` from the query **for an
admin**, so leaving it off hands them the whole roster — right for the Manage screen, wrong for
`My history`. The personal screens pass the viewer's own id into `useLeaveTable` rather than
relying on the default, which also keeps the CSV export in step.

Admins are waved past `/profile/setup` by the middleware, so an admin can reach the personal
screens with a blank department and joining date. `/api/leaves/chat` refuses that either way;
`ProfileRequiredNotice` stands in for the assistant so the refusal comes with somewhere to go.

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
npm run typecheck && npm run lint && npm run test && npm run build
```

`npm run test` is Vitest over `src/**/*.test.ts`, and covers pure policy only — date arithmetic and
the rules built on it, with no database, network or environment to stand up. Anything that needs
those is verified by driving the real endpoints instead. Don't add a test that reaches for Prisma;
it will need secrets and a live database, and the suite stops being something you can run on a
plane.

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
than claimed, `ProfileForm` renders `position` read-only once set and `updateOwnProfile` refuses to
change one — the form is the courtesy, the service is the rule. Administrators change it through the
separate edit dialog on the Staff screen; the super admin sets their own, having nobody to ask.

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

**Inviting lives on Staff and nowhere else.** `InviteStaffDialog` is the `Invite staff` button in
that screen's header and the form behind it; `InvitationSection` is the body of that dialog — the
form, and the list that resends and withdraws. It used to sit open as a panel on two screens, which
put the same act in two places and put onboarding on Access, a screen otherwise about what an
*existing* account may do. The invitation itself did not change when it moved.

The button decides whether to render from `canIssue` alone, never from the role in the session — so
a withdrawn grant removes it on the next load rather than when a week-old token expires, and the
picker offers exactly the roles the server would accept. A viewer who may invite nobody gets no
button, which is why `InvitationSection` has no "you may not do this" state of its own.

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

**The super admin edits their own identity from `/profile`, and is the only account that may.** The
rule above is right about the dashboard and left a gap behind it: every other account has somebody
senior who can correct its name, address or job title from the Staff screen, and the owner has
nobody — so those three fields were editable by no one at all, the owner included. `updateOwnProfile`
is where that authority lands, because it is the one place an account acts on itself.

Both grants are decided against `employee.role` **read from the row**, never the role in the session,
so they follow the account rather than a week-old token. `profileUpdateSchema` accepts `email` from
anybody and the service refuses it for everybody else — the same looser-schema-with-the-real-check-
behind-it split the invitation routes use, because a shape that could not express the request would
mean a second endpoint for one account.

Two things this deliberately does **not** do. It does not let the owner suspend or delete themselves:
`assertMayManage` still refuses all of that, and status is not a field `/profile` has. And it does not
re-verify a changed address, matching `adminUpdate`, which has never done so either — demanding proof
of the new mailbox would lock the owner out of their own system on a typo, with nobody able to undo
it. The cost is that `emailVerified` can outlive the address it was proved against.

`position` is enforced here too, not only in the form. The title is assigned rather than claimed, so
`updateOwnProfile` refuses to change one that is already set — `ProfileForm` rendering it read-only
is a courtesy, exactly as the read-only address on the registration form is. An unset title is still
claimable, which is what profile setup writes. The owner is the exception, for the reason above.

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

## Only working days cost a leave

A request is a **calendar range**, and its duration is the number of *working days* inside it.
Friday to Monday over a Saturday/Sunday weekend books two days, not four. `planLeave` leaves the
range the employee asked for alone and splits it through `workingDaysService.split`, writing rows
only for the working days — so every figure downstream is right for free, because they all count
rows. **Don't add a second place that subtracts weekends**; balance, monthly limit, history, trend,
department chart and CSV export all read `leaves`, and the filtering has already happened by the
time a row exists.

Two rules decide it, in `src/lib/working-days.ts`, free of Prisma so they can be read and tested
alone exactly as `geo.ts` and `holiday-notice.ts` are: the ordinary week says which weekdays are
worked, and a `Holiday` overrides it for one date. `dayKind` checks the closure first — both are
non-working, but "closed for Independence Day" is what the screens should say, not "it was a
Saturday anyway". `working-days.test.ts` pins every case from Mon→Mon = 1 to Sat→Sun = 0, plus
month, year and leap boundaries, and passes under `TZ=America/New_York`.

A range holding **no** working days is refused, never booked as nothing. Somebody asking for a
Saturday off has misread the calendar, not asked for zero days, and a silent success would leave
them thinking they were covered. `nothingToBook` names which days were ruled out and why.

**The working week is not applied backwards, and the asymmetry from closures is deliberate.** A
closure is a fact declared about one date, so `countApprovedInMonth` and friends discount it on
every read — that is what lets a closure be withdrawn. The week is a standing configuration:
re-judging old rows against today's week would silently rewrite what every past leave cost. Nothing
lands on a non-working day any more, so this only ever concerns rows booked before the week was
set, and those stay charged exactly as they were.

There is deliberately **no early "more days than the allowance" shortcut** in `leave-chat.service.ts`
any more. It was sound while a calendar day cost a day of allowance and became wrong the moment only
working days were charged — six calendar days from a Thursday is three working days, which fits a
four-day allowance. Nothing short of the real schedule can tell, since a closure can take the cost
to zero, so the judgement waits for `planLeave`.

### Who sets the week

`AttendancePolicy.workingDays` is the storage — the singleton already existed for the warning sweep,
and there is no second table, because a week is one row of configuration and a custom day off is
already a `Holiday` with a date, reason and timestamps. What changed is its **reach**: it now
governs leave as well as attendance, which is why `isWorkingWeekday` moved out of
`attendance-policy.ts` into `working-days.ts`.

It is written through `/api/admin/working-days` and **nowhere else** — `workingDays` was removed
from `updateAttendancePolicySchema` on purpose, because two endpoints writing one value is how the
two come to disagree. Super admin only, gated in the route: unlike closing the office this is not
delegated per-administrator, since one week decides what every request in the organisation costs.
An empty week is refused by both the schema and the service — it would leave every request holding
zero working days and refuse them all.

Saturday and Sunday are **nowhere** in the code as a default weekend. The seeded `[1,2,3,4,5]` is a
starting value, not an assumption; a company that rests Friday and Sunday and works Saturday
configures exactly that.

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

The office is `OFFICE_LOCATION` in `src/lib/constants.ts`, and `ALLOWED_RADIUS_METERS` is **100**.
Nothing else in the codebase names a coordinate. `src/lib/geo.ts` holds the whole rule — Haversine
and one `judgePosition` — free of Prisma so it can be read and tested alone, exactly like
`holiday-notice.ts`; `geo.test.ts` pins the boundary with offsets converted at the office's own
latitude, because a rule that only worked at the equator would pass a test built from round degrees.

**`MAX_ACCURACY_METERS` equals the radius, and that equality is the argument.** A fix accurate to
±100m cannot tell "inside a 100m circle" from "somewhere near it", so believing it would widen the
fence by exactly the amount the reading is unsure by. Such a reading is refused as *inaccurate*
rather than resolved generously — including when it lands inside the circle, which is the case that
matters, since that is the one where believing it marks somebody present who is not there. Accuracy
is **never added to the radius**, and `geo.test.ts` asserts the two constants stay equal.

**The radius was 30m and had to be widened, and the reason is worth keeping.** Thirty metres was the
building. But because the ceiling is pinned to the radius, it was also a demand for a fix accurate
to ±30m — and a phone indoors falls back on wifi and cell triangulation, which routinely reports
20–60m. People standing in the office were told *"unable to verify your location accurately"*: turned
away for the quality of their fix rather than for where they were. Widening the radius fixed both
halves at once, which is the point of deriving one number from the other. **Widen the radius if the
fence is wrong; never relax the accuracy check on its own** — that is the change that would let a
reading too vague to place anybody mark them present.

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

The project has **no working hours that judge anybody**, so `LATE` and `HALF_DAY` are deliberately
absent rather than write-dead in the way `LeaveStatus.PENDING` became. The `status` column exists so
they have somewhere to land once working hours are actually defined; don't invent them to fill it.

`AttendancePolicy.openingMinutes` / `closingMinutes` are **not** that definition, and the distinction
is the whole of why they are safe. They are the hours the company *publishes* — a fact people ask
for, so the assistant has something true to read out. Nothing compares a `checkInAt` against them:
`markPresent` asks the geofence and the closure and never the clock, so somebody arriving at 07:40 or
staying until 21:00 records the day exactly as anybody else does. Deriving `LATE` from
`openingMinutes` is the change this note exists to prevent — it would turn a published courtesy into
a verdict on a person, quietly, without any of the argument such a rule deserves.

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

**`workingDays` is the same week leave is charged against** — see "Only working days cost a leave".
Without it the sweep would write to the entire company every Saturday and Sunday and the streak
would climb through them. It also feeds the roster, where a non-working day reads `NON_WORKING`
rather than `ABSENT`, and the admin screen says so above the table so a weekend roster cannot read
as a day everybody failed to turn up. It deliberately does **not** block checking in: the working
week governs who is *expected* and who is *chased*, not who is permitted to record a day — somebody
who comes in on a Saturday can still mark it, and it still costs them no leave.

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

### The hours are published, and the assistant reads them

`openingMinutes` and `closingMinutes` sit on the same singleton as the cutoff, written through the
same `/api/admin/attendance/policy` by the super admin alone. They are validated **as a pair** — both
or neither, and the office must close after it opens — because every surface quotes them as one
sentence, and "9:00 AM to 8:00 AM" is not a day that anything downstream would notice it was reading.
`describeOfficeHours` is that sentence, in `attendance-policy.ts` beside the other pure time rules, so
the panel and the assistant cannot phrase one fact two ways.

**They exist because the assistant was inventing them.** Asked "what are the timings of office", the
model classified it as `other`, whose `reply` `leave-chat.service.ts` passes through untouched, and
answered *"Our office hours are 9:00 AM to 5:00 PM, Monday to Friday."* That string was in no table.
It was wrong twice: the hours were fabricated, and the working week is configurable, so a company
resting Friday and Sunday was told its own week backwards by its own software.

The fix is the rule the rest of this file already follows — **the model classifies, the database
answers**. `hours` is an intent exactly like `balance` and `history`: its `reply` is discarded, and
`describeHours` builds the answer from `AttendancePolicy` and `weeklyOffDays`, adding today's closure
because somebody asking when the office opens is usually asking whether to come in. Do **not**
"simplify" this by putting the hours into the system prompt instead — a fact in the prompt is a fact
the model may paraphrase, round, or carry into the next turn after it has changed.

The prompt now also forbids stating *any* company fact it was not given, and says why: an invented
answer is indistinguishable from a real one to the person reading it, and they act on it. `other` is
the branch to watch. It is the only intent whose wording reaches the employee unread by anything
else, so every question it can absorb is a question the model may answer from nothing — when you add
a fact worth asking about, add an intent, not a paragraph to the prompt.

**`time` is the second instance of that rule, and it exists because the first one over-corrected.**
Once told it knew nothing it had not been given, the assistant began refusing *"what time is it"* —
a question with a real answer, which the prompt had been stating in its own header all along. So the
prompt now says plainly that classifying is not refusing, and the clock became an intent like the
rest: `leave-chat.service.ts` answers from `currentTimeInAppZone()` and `todayUtc()`, never from the
header. A value handed to a model is a value it may round, reformat, or repeat three turns later
when it has moved on; a value read per-question cannot go stale. Both halves are formatted through
`APP_TIME_ZONE`, so the sentence reads identically whether the server runs in UTC or anywhere else —
verified by rendering it under both.

### Erasing the record — the danger zone

`POST /api/admin/attendance/reset` is the super admin's alone — gated in the route, and deliberately
**not** delegated per administrator the way closing the office is. Seeing who is in is ordinary
people-management; deleting the record that they were is not, and there is nothing left afterwards to
work out who did it.

**Four scopes, and only the first is routine.** `DATE` clears check-ins for one day and nothing else.
`ATTENDANCE` clears every check-in ever recorded, `LEAVES` every leave ever booked, and `ALL_TIME`
both. The three all-time scopes each demand the typed word; `DATE` deliberately does not.

The two single-table scopes exist because the tables answer different questions — wiping a month of
trial check-ins should not have to cost everybody the leave they booked. `ALL_TIME` stays a scope of
its own rather than two requests fired in sequence, so a half-finished reset is not something the
client can produce by having the second call fail.

**Leave belongs in the all-time reset because a roster is decided by both tables at once.**
`describeDay` reads a leave before it reads an absence, so a reset that took only check-ins left
people on the admin screen still marked *On leave* — and to whoever pressed it, a button that had
plainly done nothing. That is how it came to be reported as broken: a database with zero check-ins
and two live leave rows answered "there are no check-ins to remove" while the screen went on showing
somebody on leave. Truthful, and useless. Don't narrow this back to attendance alone without
answering what then clears the leave rows.

Clearing leave hands every allowance back, because no balance is stored anywhere — `countApprovedInMonth`
and every figure beside it count these rows. Removing them **is** the undo, and there is no second
place that needs correcting afterwards.

**Holidays survive both scopes.** A closure is a fact declared about the office rather than about
anybody's attendance, and it outranks leave rather than belonging to it.

**It is not a blanking, it is a rewrite.** Absence is the lack of a row, so clearing a day does not
return it to "no data" — it asserts that everybody was absent. Clearing all time asserts it about
every working day in the system's history, which is why the two are separate acts with separate
confirmations rather than one button with a checkbox: a day is recoverable by asking people to mark
present again, and all time is recoverable by nothing this application can do.

**No reset ever empties the admin attendance screen, and three places now say so.** The roster is
built from the employee list, so after a total wipe every account still appears, reading `ABSENT`.
Somebody expecting an empty table reads a working reset as a broken one — which is the same
misreading the leave rows caused, arriving by a different route, and it was reported twice before
the wording existed. It is said beside the buttons where the expectation forms, in the confirmation
dialog, and on the attendance screen itself when a working day holds no check-ins and no leave.

**There is no "reset absences", and there cannot be.** `AttendanceStatus` has one value, `PRESENT`;
absence is computed at render time from the lack of a row. A button for it would issue a delete that
matched nothing, every time, and leave the screen identical — which is precisely the appearance of
failure it would have been added to fix. If this is asked for again, the answer is wording or a
filter, not a fifth scope. The status filter on the attendance screen already hides absentees for
anyone who wants them out of the way.

`RESET` is typed out for the all-time branch and **checked in `resetAttendanceSchema`**, not only in
the dialog. A confirmation that lives in the browser is a courtesy to whoever is clicking; this one
is the rule, so `curl` has to spell the same word. The day branch has no such field on purpose — a
ceremony demanded for every ordinary fix is a ceremony somebody eventually automates away.

**Attendance warnings are never deleted.** They record letters already delivered, which no amount of
deleting can unsend, and the row doubles as the claim that stops a second letter for a day already
swept. Clearing them would make somebody warned twice for one day, which is precisely what the
claim-before-send design exists to prevent.

**The mass-email trap, and why it is reported rather than prevented.** `dispatchAttendanceWarnings`
only ever sweeps `todayUtc()`, so clearing any *past* day cannot produce a letter however many
absentees it creates — the sweep will never look there again. The one live case is clearing **today**
after the cutoff: everyone who had checked in becomes absent, and because they were present they have
no claim row to stop the next sweep writing to them. `warningExposure` computes exactly that
conjunction — warnings enabled, a working day, the cutoff passed — and the dialog says so and points
at the off switch on the same panel. Suppressing it by inserting warning rows for letters nobody sent
was the obvious alternative and is worse: it would put a lie in the table that `consecutiveMissed`
and every future letter are built from.

Clearing leave **widens who that catches without changing the test**. Somebody on approved leave
today is kept out of the sweep by that row alone, so deleting it turns them into an ordinary absentee
the cutoff applies to. `warningExposure` already covers them, because the conjunction is about the
day rather than about any one person — but that is now a second population it silently protects, so
don't narrow it to "people who had checked in".

Both counts are read when the dialog opens rather than kept on screen, so the numbers being confirmed
are the ones in the tables a moment ago, and they are shown **separately rather than summed**: a
cleared check-in can be recorded again by walking into the building, a cleared leave cannot, and one
total would hide which of the two somebody was actually about to lose. A check-in landing between the
preview and the delete is ordinary; the reset reports what it actually removed.

The all-time branch is two `deleteMany` calls rather than one transaction, because a transaction
spanning both tables would have to be written where `prisma` is in scope and the layering keeps that
in the repositories. A crash between them leaves one table cleared, which is safe here in a way it is
not for the warning sweep: both deletes are unfiltered, so pressing the button again finishes the job
rather than doing anything twice.

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

## A message may carry files

The composer sends `multipart/form-data`, and it does so whether or not anything is attached. One
encoding for both kinds of send, on purpose: a text-only message is the same request with no file
parts on it, so there is no second path to drift out of step. `parseMultipart` in `src/lib/api.ts`
splits the body — text fields against the unchanged `sendCustomEmailSchema`, files kept as files —
and a file arriving under any field name but `attachments` is refused outright rather than dropped,
the same reason `markAttendanceSchema` is a `strictObject`.

Base64 is deliberately **not** used. It inflates a file by a third before it is held in memory as a
string, and the platform counts its request limit on the encoded bytes, so the encoding would spend
a quarter of the budget on nothing. Nothing is written to disk at any point, which is why there is
no temporary file to clean up after a send and none left behind by a failed one — the buffers live
for the request and go with it.

**Permissions are untouched, and attachments cannot route around them.** `send()` still calls
`assertMaySend` first and still resolves the audience through `resolveRecipients` against the grant
read fresh from the database. A file is judged *after* that and *before* the recipients are
resolved, because whether these files may be sent has nothing to do with who they were going to.

### What may be attached

`src/lib/email-attachments.ts` holds the whole rule, free of Prisma so it can be read and tested
alone exactly as `email-audience.ts`, `geo.ts` and `holiday-notice.ts` are. It is a pure function of
a file's **name and size** — never its bytes, and never `file.type`.

**The extension decides the MIME type.** The browser's `file.type` is read nowhere: believing it
would let `payroll.exe` be delivered labelled `application/pdf`, or a real PDF be labelled
`text/html` and rendered inline by a mail client. Deriving the label from the extension we already
allowlisted means the name and the type can never disagree.

**An allowlist, not a blocklist.** The dangerous set is open-ended — `.exe`, `.bat`, `.cmd`, `.sh`,
`.php`, `.js`, `.msi`, and whichever one is invented next — so naming what is *permitted* refuses a
new executable format on the day it appears rather than on the day somebody remembers it. Archives
are absent because a `.zip` would allow everything above by wrapping it; SVG is absent because it is
a document that can carry script, not an image. The last extension is the one judged, so
`invoice.pdf.exe` is an executable.

**One budget, not a per-file limit and a total.** `MAX_EMAIL_ATTACHMENT_BYTES` is 4 MB across the
whole message, in binary megabytes so a file the sender's own machine calls 4 MB is not refused for
being over 3.8. It is pinned below Vercel's 4.5 MB request-body cap, which refuses the request
before any of this code runs — a larger limit would surface as an opaque platform error instead of a
sentence somebody can act on.

A set is refused **whole** on its first bad file rather than the good ones going without it. A
message that quietly went out missing the document it promised is worse than one that did not go:
the sender believes the file arrived, and an email cannot be recalled to add it.

`EmailAttachmentsField` imports the same functions to warn while the sender is still looking at the
picker. That copy is a courtesy and never the rule — `custom-email.service.ts` judges the files
again, on the bytes that actually arrived, exactly as `sanitize-html.ts` re-judges what the editor
produced.

Attachment names are listed in the message body as well as carried as MIME parts, because a client
that hides its attachment bar — or a plain-text reader, which has none — would otherwise deliver a
message referring to a document with no sign that anything came with it. Delivery stays
fire-and-forget: a host that refuses a file is an ordinary failed delivery and reads as `FAILED`,
with the wording pointed at the attachment rather than at the mail settings.

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

## Migrations ride with the build that needs them

`npm run build` runs `scripts/migrate-production.mjs` between `prisma generate` and `next build`, and
that script applies pending migrations **only when `VERCEL_ENV === "production"`**.

The ordering is the point. Code that selects a column, shipped ahead of the migration that adds it,
does not fail at deploy time — it fails later, on whichever screen touches that table first, so a
green deploy comes to mean nothing. This happened in slow motion once already: the office-hours
columns had to be applied by hand before the push, and only because somebody remembered to check.

**The environment guard is the whole safety argument, not a tidy-up.** Vercel runs this same build
command for preview deployments, against whatever `DATABASE_URL` that environment carries — which for
most projects is the production database. An unguarded `prisma migrate deploy` here would let a
half-finished branch migrate live data simply by being pushed.

It is a Node script rather than the obvious `[ "$VERCEL_ENV" = production ] && ...` in `package.json`
because npm runs scripts through `cmd.exe` on Windows: a POSIX test would break `npm run build` for
anyone developing here while working perfectly in CI, which is the worst division of labour
available. `process.env` reads the same on both.

A failed migration deliberately fails the build. Deploying anyway is the outcome the script exists to
prevent, so a migration that cannot be applied has to stop the release rather than be reported and
stepped over. `npm run db:deploy` remains for applying migrations by hand.

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

**The screen is `/admin/staff`; the endpoints behind it are `/api/admin/employees`, and the two are
deliberately out of step.** The screen has been called Staff since it started listing administrators
alongside employees, and the address is the one part of it somebody reads aloud or pastes to a
colleague — so that is the half that was renamed. The endpoints were left alone because moving them
would rewrite every call site and the README's endpoint table for something nobody sees. Don't tidy
either half into agreeing with the other.

Every link goes through `ROUTES.adminStaff`, which is why the rename touched one constant rather
than eight components — keep it that way and don't write the path out in a `Link`. `/admin/employees`
is a permanent redirect in `next.config.ts` rather than a 404: the old address was live long enough
to be sitting in bookmarks, and the page it named is still there, so a 404 would report a screen as
deleted when it had only moved. Being permanent, it is cached by browsers, so reusing that path for
anything else later would need every visitor's cache to expire first.

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

**`ABSENT` is a claim, and `NO_RECORD` is the admission that there is nothing to claim.** Deriving
absence from a missing row quietly assumes the day was being watched, and after a reset it is not:
an empty table had the roster asserting that the whole company failed to turn up on every working
day in its history. `dayHoldsRecord` is the one question that separates the two — does *anybody* in
the company have a check-in or approved leave on this date — and it is asked **company-wide**, never
about the filtered page, or narrowing to a department that happened to be away would turn its
absences into nothing having happened. It is judged last, below every other fact, so somebody who
did check in still reads `PRESENT` on an otherwise empty day.

The trade is deliberate: a genuine day on which literally nobody checked in and nobody was on leave
also reads `NO_RECORD`, and nobody is chased for it either, because the warning sweep writes only to
people the roster calls `ABSENT`. No stored fact can tell that day apart from a reset. One person
checking in clears it, and a total no-show is an outage or a fire drill rather than a day to write
to the whole company about. **Don't reintroduce a bare `ABSENT` for empty days to "fix" the warning
sweep** — that is the accusation the status exists to withhold, and it is where this came in.

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
from a desk would be a way around the geofence rather than a convenience — **except** for one
deliberate, delegated exception, which is the section immediately below. *Reading* the roster is not
delegated per-administrator — seeing who is in is ordinary people-management, not an
organisation-wide act — but splitting it by population is, and so is correcting a day. The roster is
fetched whole and paged in memory on purpose: the status a
row is filtered on does not exist in the database to filter by, so paging in SQL first would make
"today's absentees" return a page of whoever sorted first.

`/api/attendance` is scoped to the session id with **no way to widen it**, deliberately unlike
`/api/leaves`, where an admin may pass `employeeId` and gets the whole roster when they leave it off.
That is right for a Manage screen and wrong for a personal history, so the admin view lives at its
own endpoint.

### Correcting a day — the one write on this screen

Somebody who genuinely came in can still fail to check in: a flat battery, a phone left at home, a
fix too vague to place them. Until `canMarkAttendance` there was no way to correct that at all, so
the record was permanently wrong and the person was chased for it. `POST /api/admin/attendance/mark`
is the fix, and it is the **only** write on a screen that is otherwise read-only.

**This is a deliberate hole in the geofence, and the rest of the design is what keeps it small.**

- **It can only ever turn `ABSENT` into `PRESENT`.** Every other status is refused, in the roster's
  own words. It cannot weaken, amend or overwrite a real check-in — a row already there wins,
  because it is the stronger evidence of the two, and the attempt reports `alreadyMarked`.
- **It judges the day by calling `buildRoster`, never by asking its own questions.** The closure
  rules, the working week, approved leave, the future and `NO_RECORD` are all settled by
  `describeDay` for every other surface, so asking it once more costs four queries and guarantees
  this screen cannot disagree with the one beside it. A hand-written "is it a working day and not a
  holiday" check here would be a second opinion, and the second opinion is the one that rots. Don't
  add one.
- **It creates a row; it does not amend one.** An absent person has *no record* — absence is the
  lack of one, which is the whole of the section above. So "update the existing row rather than
  duplicating it" is answered by `@@unique([employeeId, date])`: a duplicate is refused by the
  database, and the service reports the row already there.

**`NO_RECORD` is refused, and it is the interesting refusal.** On a day holding no check-in and no
leave for anybody, the whole company reads `NO_RECORD` and nobody is accused. Writing one row would
make the day *held*, flipping every other person to `ABSENT` in a single act — and if that day is
today and the cutoff has passed, the next warning sweep would write to all of them. One correction
would become a letter to the entire organisation. That is the same mass-email trap the reset
documents, arriving by a new route, and it is closed the same way: by asking what the day would hold
afterwards rather than by suppressing the mail.

**The row stays permanently distinguishable from a proved one.** `latitude`, `longitude`,
`accuracyMeters` and `distanceMeters` became nullable and are null exactly when `markedById`,
`markedAt` and `reason` are set. They are **not** defaulted to the office's own coordinates, which
was the convenient option: a row claiming somebody stood 0m from the door is indistinguishable from
one where they did, and the distinction is the only thing left of the geofence once the button
exists. Every surface showing a distance shows who vouched for it instead — the roster, the
employee's own history, the check-in card and the CSV, which gained `Recorded by` and `Reason`
columns because an export is what gets archived and mailed around.

The audit trail lives on the row rather than in a log table, because the unique index means there is
only ever one row per person per day to describe, and nothing amends a check-in once it exists.
`onDelete: SetNull` on `markedBy`: deleting the administrator who made a correction must not delete
the attendance of the person it was about.

**It is its own grant, deliberately not folded into `canViewAdminRecords`.** That one is a read —
who may report on administrators as a group. This is a write that overrides a physical check, and an
HR administrator given the reporting view must not silently acquire the ability to record attendance
for anybody. It is also its own route rather than a `PATCH` on the roster endpoint, so "the
attendance screen is read-only except when it isn't" is not something you have to read the service to
establish — the same split `/api/admin/chat/action` makes.

`checkInAt` defaults to now, meaning the moment the day was recorded. It is **not** backdated to the
chosen date: nobody knows what time this person arrived, which is the entire reason the row is being
written by hand, and a plausible-looking time would be a precise lie. `markEmployeePresentSchema` is
a `strictObject` for the reason `markAttendanceSchema` is, and the reason is stronger here — that one
refuses a client's verdict about a position, this one refuses a client's verdict about everything.
There is no field for a status, because the only status it can produce is `PRESENT`.

Verified end to end against the real database, crossing the Zod schema rather than calling the
service directly: the blank-day refusal, the ungranted admin, the write and its audit fields, the
tiles moving 1→2 present and 7→6 absent, persistence across a re-read, double submission producing
one row, the future/weekend/closure/unknown-person refusals, and a geofenced check-in surviving an
attempt to overwrite it.

### Filtering by population — the fourth delegable right

`population` narrows a report to `EMPLOYEE` or `ADMIN`, and it needs **`canViewAdminRecords`**: the
super admin always, an administrator once granted it. `population.service.ts` is the rule, and the
grant is read from the row on every call, never from the session — the same discipline
`canInviteEmployees`, `canManageHolidays` and `canSendEmails` follow, so withdrawing it bites on the
next request rather than when a week-old token expires.

**It exists for the HR administrator**, who has to chase attendance and count leave across everybody
without being handed the owner's account to do it with. It was the super admin's alone first, and
that was too tight for one real job rather than wrong in principle: which of your colleagues is an
administrator still is not something these screens tell an ordinary admin, and
`attendanceRosterSelect` still carries no `role`, so the roster names people without saying what
they are.

**Note what was already true, because it is the part most likely to be misread as the defect.**
Every administrator has always *seen* administrators' attendance — `roster()` applies no role filter
at all when `population` is `ALL`, so the unfiltered screen lists every active account. What the
grant unlocks is **separating them out**, which is the same thing as being told who they are. "HR
cannot see admin attendance" was never true; "HR cannot report on them as a group" was.

**`EMPLOYEE` is gated too on the roster, and that is not an oversight.** Filtering to the employees
looks harmless, but comparing that list against the unfiltered one names the administrators exactly
as well as asking for them does. A filter that leaks by subtraction is still a leak, so the whole
control moves together rather than half of it being open to everybody. Don't "relax" the employee
half.

**The overview is deliberately asymmetric with that**, which is why `population.service.ts` has two
asserts rather than one. `/api/admin/stats` reports on exactly one population and never both at
once, so it has no unfiltered figure to subtract from, and the employee view stays open to every
administrator exactly as it always was. `assertMayFilter` guards a surface that also offers `ALL`;
`assertMayReportOn` guards one that always names a population. Leak-by-subtraction is an argument
about a surface offering both, and applying it where it does not hold would have taken the dashboard
away from every ordinary admin.

**It never widens to Staff.** `role=ADMIN` on `/api/admin/employees` stays the super admin's, gated
in that route as before, because that roster is the route to *acting* on those accounts rather than
a report about them — and `assertMayManage` would refuse every write anyway, so granting it would
list administrators and do nothing to them.

**The check lives in a service of its own, not in a route and not in `attendance.service.ts`** —
because there are now three ways in. The attendance screen and its CSV export both call `roster()`,
so an export that honoured the filter without re-checking it would be the easier of the two to reach
with a hand-written URL. The overview is a different feature entirely, which is why the rule lives
with neither: it is the one delegable right no single feature owns. Every route still guards
`requireAdmin` and now hands the **whole caller** down rather than just `user.role`, since a grant
read from a row needs the id.

Both server pages resolve the grant from the database as well, rather than from the session role, so
a withdrawn grant takes the control off the screen on the next load. That is rendering and never
permission: the endpoints refuse the filter regardless of what was drawn.

**It is called `population`, not `role`, because `ADMIN` covers two roles.** `rolesInPopulation` in
`src/lib/enums.ts` is shared with the admin overview, which has always counted the super admin as an
administrator — a report measures the organisation, so an account in neither population would vanish
from its own figures, its leave counted nowhere and its attendance in no tile. That is the opposite
of the Staff screen, which lists only what can be managed and so leaves the owner out; both are
right, and the shared function is what stops a tile and the filter beside it disagreeing about who
was counted. `SUPER_ADMIN` is not an accepted value, exactly as it is not one in
`employeeQuerySchema`: narrowing a screen to a single named account is not a report on a population.

The tiles narrow with it rather than staying company-wide, because the filter is applied in the query
and `summarise` counts what came back — switching to Administrators changes what is being measured,
not merely which rows are listed. Verified: with one super admin, one admin and two employees, the
roster reports 4 / 2 / 2, and an `ADMIN` caller is refused both narrowings.

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

**It is a grid, not a list of scopes: `target` × `range`.** `target` picks the tables — `ATTENDANCE`,
`LEAVES`, `ABSENCES` (the warning rows), or `ALL` for the three together. `range` picks how far back:
`DATE` for one calendar day across everybody, `ALL_TIME` for every row **up to and including today**.
Eight combinations from two fields, and all eight are meaningful.

**`ALL_TIME` stops at today, and that bound is load-bearing.** It passed no filter at all once, which
deleted the table — and `leaveDate` is routinely in the *future*, because booking leave is booking a
day that has not happened yet. So "clear the history" silently cancelled everybody's upcoming leave
along with the record of their past leave. Nothing announced it and nothing could undo it: no balance
is stored anywhere, so those rows *were* the booking. "All time" now means all of *recorded* time,
which is what an administrator clearing a history means by it — a day still to come has no history to
clear. `resetScope` in `attendance.service.ts` is the one place this is decided, and `resetPreview`
counts through it rather than rebuilding the bound beside it, so the number in the dialog cannot
promise rows the delete will then leave alone.

`DATE` is deliberately left alone, future or not: naming a single date is an explicit instruction
about that date, not a sweep that happens to reach it.

**Clearing does not stop the system continuing, and there is no state that would let it.** Nothing
here keeps a cursor or a "last processed day" — `dispatchAttendanceWarnings` and the roster both
compute from the date and the policy on every run, so the day after a clear is decided exactly as any
other day is. Configuration is untouched: the working week, the cutoff, the office hours, holidays and
every permission live outside these three tables. What a clear does leave behind is `NO_RECORD` on the
emptied days, which is the point of that status rather than a failure of the reset — it resolves the
moment anybody checks in or books leave, and the section above explains why it must not be turned back
into a bare `ABSENT`.

It was five flat scopes first, with only `DATE` — check-ins for one day — offered per date. Asked for
the same thing for leave and for absences, eight literals would have meant `DATE`, `DATE_LEAVES`,
`DATE_ABSENCES`, `DATE_ALL`, and a name where `DATE` silently meant check-ins. **Don't add a scope
literal back**; add a target or a range, and the pairing follows for free. `tablesFor()` in
`attendance.service.ts` is the only place the grid is spelt out, and `reset()` is three deletes
driven by it rather than a branch per combination.

The targets are apart because the tables answer different questions — wiping a month of trial
check-ins should not have to cost everybody the leave they booked. `ALL` stays a target of its own
rather than three requests fired in sequence, so a half-finished reset is not something the client
can produce by having a later call fail.

**The typed word marks the range, not the target.** Every `ALL_TIME` demands `RESET`; no `DATE` does,
for any target. The word is for the act nothing can undo and nobody can work around — one day is a
correction (a test run, a device that double counted), and a ceremony demanded for every ordinary fix
is one somebody eventually automates away. This was weighed against making leave the trigger instead,
since a cleared booking is the one thing here that does not grow back whatever the range: rejected
because three different rules across eight buttons is a ceremony nobody can predict, and the honest
version of that concern is wording. So the dialog says it in as many words — clearing leave *takes
the booking with it, and the person will have to book it again* — and says it for a single date too,
which is where it actually bites.

**Attendance warnings are the one thing `ALL` gained rather than kept out.** They were excluded
while there was no way to clear them deliberately; once `ABSENCES` existed, a "reset everything" that
quietly left a table behind would have been a worse lie than the risk it was avoiding.

**`leaveRepository.deleteMany` takes a date and must never take an employee.** That limit is the
whole of why a filter is safe to have at all: narrowing by person would be a way to hand one employee
their allowance back while every count that polices the policy went on reading everybody else's
history, with nothing on the row to show it had happened. A date applies to the entire company at
once, exactly as `attendanceRepository.deleteMany` does, so it cannot be used to favour anybody.

**Leave belongs in the reset because a roster is decided by both tables at once.**
`describeDay` reads a leave before it reads an absence, so a reset that took only check-ins left
people on the admin screen still marked *On leave* — and to whoever pressed it, a button that had
plainly done nothing. That is how it came to be reported as broken: a database with zero check-ins
and two live leave rows answered "there are no check-ins to remove" while the screen went on showing
somebody on leave. Truthful, and useless. Don't narrow this back to attendance alone without
answering what then clears the leave rows.

Clearing leave hands every allowance back, because no balance is stored anywhere — `countApprovedInMonth`
and every figure beside it count these rows. Removing them **is** the undo, and there is no second
place that needs correcting afterwards.

**Holidays survive every combination.** A closure is a fact declared about the office rather than
about anybody's attendance, and it outranks leave rather than belonging to it.

**A reset that empties a day now says so, rather than blaming everybody for it.** Clearing a date
used to leave the roster asserting that the whole company had been absent, and clearing all time
asserted it about every working day in the system's history — which is how "the reset doesn't work,
the absences are still there" came to be reported. It is `dayHoldsRecord` that answers it, up in the
attendance section: a working day holding no check-in and no leave for anybody reads `NO_RECORD`, so
clearing a day, or all of them, is visibly a reset. The two ranges remain separate acts with
different ceremonies anyway, because a day is a correction and all time is recoverable by nothing
this application can do.

**No reset ever empties the admin attendance screen, and three places still say so.** The roster is
built from the employee list, so after a total wipe every account still appears — now reading
`NO_RECORD` rather than `ABSENT`. Somebody expecting an empty table reads a working reset as a broken
one, which is the same misreading the leave rows caused arriving by a different route, and it was
reported twice before the wording existed. It is said beside the buttons where the expectation forms,
in the confirmation dialog, and on the attendance screen itself when a working day holds nothing.

**"Reset absences" clears the record, not the status, and the distinction is still the whole of it.**
`AttendanceStatus` has one value, `PRESENT`, and absence is computed at render time — so nothing can
delete an absence, and `ABSENCES` does not pretend to. What it clears is `attendance_warnings`: the
letters issued and the `consecutiveMissed` streak they carry, which is the only place in the system
absence is ever written down. On its own it changes nothing on the roster, because it removes neither
a check-in nor a leave; the day goes on holding a record and the rest go on reading `ABSENT`. The
panel says so and names `ALL` as the target that clears the days themselves — **that pairing is the
answer to the question this target keeps being asked**, and neither half of it works alone. Either
can now be aimed at a single date, which does not change the pairing: `ABSENCES` for one day still
clears only that day's letters.

This note previously said the scope could not exist and that the answer was wording or a filter.
That was wrong, and wrong in a specific way worth keeping: it confused the derived status with the
one table that records it, and so answered a real request with an explanation. Say what cannot be
done *and* what can. It was then wrong a second way, in claiming the derived status could never be
improved on — `NO_RECORD` is the same lesson learned again one level up.

**Deleting warnings is permitted by argument, not by relaxing the invariant.** The rule elsewhere in
this file — that warnings are never deleted, because the row is the claim that stops a second letter
— still holds for every automated path. `dispatchAttendanceWarnings` only ever sweeps `todayUtc()`,
so a claim for any past day is inert: the sweep will never look at it again, and deleting it cannot
produce a letter. The live case is **today's** claims, where removing the row lets the next sweep
write to somebody it has already written to. `warningsForToday` counts exactly those, separately from
the total, so the dialog can name the risk on the rows it actually applies to rather than describing
a danger to somebody clearing a year of dead history. Reported, not prevented — the same trade the
mass-email trap makes directly above.

Delivered mail is untouched and cannot be otherwise. The letters have been read; what goes is the
administrative record of having sent them.

The status filter on the attendance screen still hides absentees for anyone who only wants them out
of the way, and remains the right answer to "I don't want to look at these".

`RESET` is typed out for the all-time range and **checked in `resetAttendanceSchema`**, not only in
the dialog. A confirmation that lives in the browser is a courtesy to whoever is clicking; this one
is the rule, so `curl` has to spell the same word. The day branch has no such field on purpose — a
ceremony demanded for every ordinary fix is a ceremony somebody eventually automates away.

**Attendance warnings are never deleted by anything automatic**, and only ever by the `ABSENCES` or
`ALL` targets, deliberately. They record letters already delivered, which no amount of deleting can
unsend, and the row doubles as the claim that stops a second letter for a day already swept —
clearing today's is precisely how somebody gets warned twice, which is what the claim-before-send
design exists to prevent. That is why the two targets that can do it say so, and count today's
claims apart from the rest. Note the ceremony no longer follows them: `ABSENCES` for a single date
takes no typed word, because the range decides that — which is right, and is exactly why
`warningsForToday` is `null` unless the rows going actually include a claim held for today. Nothing else in the codebase may remove
one; don't add a cascade or a tidy-up sweep that does.

**The mass-email trap, and what closed most of it.** `dispatchAttendanceWarnings` only ever sweeps
`todayUtc()`, so clearing any *past* day cannot produce a letter however many absentees it creates —
the sweep will never look there again. The live case was clearing **today** after the cutoff:
everyone who had checked in becomes absent, and because they were present they have no claim row to
stop the next sweep writing to them.

`NO_RECORD` shuts that for anything clearing the **whole** of today, and shuts it as a consequence
rather than as a special case: a day left holding no check-in and no leave has no absentees on it,
and the sweep writes only to people the roster calls `ABSENT`. So `warningExposure` no longer asks
"does this touch today" but **"would today still hold anything afterwards"** — which leaves exactly
the partial resets exposed. `ATTENDANCE` with somebody's leave still standing, `LEAVES` with somebody
else's check-in still standing, `ABSENCES` on a day that holds either: in each the day remains one
the system considers itself to have been watching, so the rest read `ABSENT` and are written to. The
`ALL` target cannot send anything, whichever range it is asked for.

It takes the `tables` a target resolves to rather than the target itself, so a combination added
later is covered without touching it. It also asks for **approved** leave, mirroring `buildRoster`
exactly rather than counting every row on the date: this is asking what the roster would say
afterwards, and a legacy `PENDING` row is something a delete would remove but nothing that keeps
anybody off the sweep.

That is why the check is a **conjunction over the day rather than over any one person**. Clearing
leave catches a second population — somebody on approved leave today is kept out of the sweep by
that row alone — and asking about the day covers them for free. Don't narrow it back to "people who
had checked in", and don't reach for the other obvious fix: suppressing letters by inserting warning
rows for mail nobody sent would put a lie in the table that `consecutiveMissed` and every future
letter are built from. Where exposure survives it is still reported, not prevented — the dialog says
so, points at the off switch on the same panel, and now also names emptying the day as the way out.

Both counts are read when the dialog opens rather than kept on screen, so the numbers being confirmed
are the ones in the tables a moment ago, and they are shown **separately rather than summed**: a
cleared check-in can be recorded again by walking into the building, a cleared leave cannot, and one
total would hide which of the two somebody was actually about to lose. A check-in landing between the
preview and the delete is ordinary; the reset reports what it actually removed.

The reset is three `deleteMany` calls rather than one transaction, because a transaction spanning
the tables would have to be written where `prisma` is in scope and the layering keeps that
in the repositories. A crash between them leaves one table cleared, which is safe here in a way it is
not for the warning sweep: every delete is idempotent over the same range, so pressing the button
again finishes the job rather than doing anything twice.

## The workforce assistant answers about other people

`/admin/assistant` is the administrator's counterpart to the employee leave chat, and it is the
second place in this codebase where a model reads a question and the database answers it. The
bargain is the one the leave chat and `describeHours` already struck, applied to a wider surface:
**the model classifies and extracts; every name, count, time and status an administrator reads is
fetched afterwards.** `interpretAdminChat` is never asked who was in. An invented roster is
indistinguishable from a real one to somebody about to act on it, and unlike a fabricated leave
balance — which `planLeave` would refuse to honour — nothing downstream would catch it.

**`/api/admin/chat` writes nothing, and that is now a fact about the endpoint rather than about the
service.** It can still only answer: asking to add or remove somebody gets a *proposal* back, and
carrying it out is a second request to `/api/admin/chat/action` that the administrator has to
approve — see "Adding and removing staff" below. This note used to say the service had no write path
at all; that stopped being true when staff acts arrived, and the guarantee it was really making is
the one kept: **nothing changes as a consequence of the model reading a sentence.**

**Every answer goes through `attendanceService`, never its own queries.** `rosterEntries` and
`historyFor` are the same code the admin attendance screen and the warning sweep use, so the
assistant cannot disagree with the screen — and a closure, a non-working day, approved leave and
`NO_RECORD` are all honoured here for free rather than re-derived. That is the whole reason the
service does not read `attendance` rows directly: a second place computing absence is a second
place to get it wrong, and this one would get it wrong in prose that reads as authoritative.

`requireAdmin` on `/api/admin/chat` is the access control; hiding the nav item is a courtesy. Both
admin roles, deliberately — an ordinary administrator already sees the whole attendance screen and
the whole leave screen, so the assistant reads out nothing they could not page through by hand. It
is *not* narrowed to the super admin the way the population filter is, and the reason is precise:
that filter leaks who is an administrator, and this never states anybody's **role**. Don't add a
"who are the admins" intent without moving the guard.

### A name is never an identifier

Two people may share one, so `findActiveByNameLike` returns **every** candidate and the service asks
rather than picking. Choosing sends the question back with an `employeeId`, and the answer is
recomputed against the id — the same shape as confirming a leave proposal, and for the same reason:
the client echoes *inputs*, never an answer. There is nothing to escalate, because an administrator
who edited the payload could ask about a different colleague by typing their name.

The search is **name only**, deliberately unlike `listAttendanceRoster`, which also matches email,
department and position. That breadth is right for a search box and wrong here — a term that matched
a department would confidently answer about somebody not called that at all.

**Each option carries the email, and always shows it.** Name, department and job title can all three
be identical — this database holds two active accounts both called "sufyan khan" — at which point the
buttons render the same text twice and the disambiguation asks a question it has made unanswerable.
The address is unique on the table, so it can always separate them, and it gives nothing away that
the Staff screen does not: unlike `role` it never says what somebody *is*. The echoed transcript line
uses it for the same reason, so the conversation records which of the two was picked.

### Adding and removing staff

Two intents, `invite` and `remove`, and **neither of them does anything**. The model classifies the
request; `admin-chat.service.ts` finds who was meant, checks whether this administrator may do it,
and hands back a `PendingAction` describing the act in full. Approving it posts
`/api/admin/chat/action`, which is **the only route in this feature that can change anything** — a
separate endpoint on purpose, so "the assistant is read-only except when it isn't" is not a fact you
have to read the service to establish. It is also where the rate limit differs: `adminStaffAction`
is 20 an hour, tighter than the 40 questions and bounding something else entirely, since no AI quota
is spent there and every call deletes an account or mails an invitation.

**No model call happens on the action route at all.** The wording was interpreted when the proposal
was made, and re-reading it to perform an act already agreed would be a second chance to understand
it differently — the same reason `resolved` short-circuits the model on the read path, and the same
shape as the leave assistant confirming against a re-planned proposal rather than a sentence.

**The payload carries inputs, never a decision.** `adminChatActionSchema` is a discriminated union
of an `employeeId`, or an address and a role — `strictObject` on both, following
`markAttendanceSchema`. Everything the confirmation *displayed* is re-read from the database when it
runs, so a forged payload changes what the administrator was shown and nothing about what happens.

**The proposal is wider than the request, and `toActionRequest` is the seam.** `AdminChatAction`
also carries `name`, which labels the confirm button; the request carries the inputs alone. Both are
declared in `admin-chat.schema.ts` beside the function converting one to the other, because they
were once declared in three places — a Zod schema, a service type and a hand-written type in the
component — with nothing comparing them. **This shipped broken.** The client posted the proposal
back whole, the removal branch carried six display fields, `strictObject` refused all of them, and
every deletion failed with *"The submitted data is invalid"* while invitations worked, those being
inputs the whole way through. The fix narrows on the client rather than loosening the schema: the
strictness is what would refuse a client sending its own verdict, and dropping display fields is the
client's job precisely because the server re-reads them anyway.

**It shipped broken because the verification never crossed the schema.** Every path was driven
before release — both permission boundaries, an admin aimed at the owner, a real deletion — but
against `adminChatService.execute` directly, with a payload written by hand in the shape the schema
wanted. The route's own `parseBody` was never in the picture, so the one thing actually wrong was
the one thing not exercised. `admin-chat.schema.test.ts` now pins the round trip, and the rule
generalises: when a feature spans a client and a server, **verify the wire, not the two ends** — a
driver that constructs its own request is testing your understanding of the contract rather than the
contract.

**Authority is delegated, never reimplemented.** `execute` calls `employeeService.remove` and
`invitationService.invite`, so `assertMayManage` and `assertMayInvite` decide exactly as they do for
the Staff screen, against the row in the database rather than the session. An ordinary administrator
cannot delete another administrator by asking nicely, one without `canInviteEmployees` cannot
onboard anybody, and nobody can delete the owner — verified by driving each refusal directly.
The permission read while *building* the proposal is a courtesy that spares somebody approving
something that was never going to work, exactly as `canIssue` is on the invitation routes; the check
that counts runs on confirmation. **Don't add permission logic to the action route** — a second copy
is how the two come to disagree.

Removal reuses the disambiguation above but not its query. `findManageableByNameLike` takes its
`roles` as a **required** argument, unlike everywhere else it is optional, because the safety of the
whole thing is that a candidate the caller may not act on never appears — an account out of reach is
absent rather than refused, so the assistant cannot be used to discover who the administrators are
by naming people and reading which refusals come back. `SUPER_ADMIN` is excluded by never being
passed. It matches **every** status, unlike `findActiveByNameLike`: a suspended account is exactly
the sort somebody wants rid of, and "I can't find them" would be a lie.

The assistant assigns no job title. `position` is stamped from the invitation's `JobRole`, and
picking one out of a typed phrase would mean matching a curated list by guesswork; the Staff form
offers the list. It also never invents an address — the prompt says so in as many words, and a
request with no address asks for one rather than guessing it from a name, because an invitation is
delivered the moment it is approved and an email cannot be recalled.

### Two false refusals, and the lesson landing for the third time

Verification against the real model caught the assistant answering *"I'm a workforce assistant, I
don't have personal attendance records"* to **"when was System last absent"** — a question with a
real answer, refused. This is exactly the over-correction the `time` intent documents one level up:
told firmly enough that it knows no company facts, the model starts declining questions the intents
cover. The admin prompt had inherited the prohibition without the counterweight, so it now carries
the same **"classifying is not refusing"** paragraph the leave prompt does. When you tighten one of
these prompts against invention, check in the same change that it has not begun refusing.

The second half is specific to this assistant: **any name is a name.** The model has no roster, so it
cannot judge whether a name is a real one — and "System" looked implausible enough that it decided
nobody was being asked about. Deciding somebody is not an employee is the same invention as making up
a roster, arrived at from the other side, so the prompt says plainly that an odd, single-word or
title-like name goes in `name` regardless and the search settles it. Both failing questions are
pinned as worked examples.

### A day still to come is not a day nobody missed

`dayCaveat` ends with a future-date branch, and it is there because the roster calls a future day
`UPCOMING` rather than `NO_RECORD` — so `isBlankDay` does not catch it, every count comes back zero,
and "who is absent next Thursday" answered *"nobody is absent, everyone is accounted for"*. True of a
day nobody could yet have missed, and reading as a report on one. It is judged **below** the closure
and the working week, because both of those are worth knowing about a day still to come: "the office
is shut on Monday" answers more than "Monday hasn't happened".

`describeLeave` deliberately takes no caveat at all. Leave is booked ahead, so "who is on leave next
Thursday" is a real question with a real answer, and it is the one thing about a future day this
system genuinely knows.

### The calendar reaches backwards

`buildAdminCalendar` runs three weeks back and two forward, where the leave assistant's only runs
forwards. An employee books ahead of themselves; an administrator asks what already happened
— "yesterday", "last Monday", "last week" — and without those rows in the prompt every one of them
becomes arithmetic the model gets wrong. Dates are looked up in the table, never computed by the
model, exactly as in the leave prompt.

`MAX_RANGE_DAYS` is a bound on one request rather than a policy about history, and a range longer
than it is clamped to the most recent 31 days **and said so in the reply** rather than refused.

### A day nobody was expected in is not a day of absences

`dayCaveat` is returned *instead of* a list, not alongside one. Reporting "0 absent" for a public
holiday is true, and reads as though the question was understood when it was not. `isBlankDay` says
the same thing for `NO_RECORD` — a day holding no check-in and no leave for anybody — which is what
stops a freshly reset database being described as a company that stopped coming to work.

`historyFor` lists only the days that say something about the person. A fortnight of weekends and
closures printed in full buries the two days actually missed; the totals underneath count all of it.
It exists so a question about a week is not `buildRoster` called seven times — four bulk queries
instead of thirty-odd round trips — and every day is still decided by `describeDay`, so what changed
is how the facts are fetched and not the rule. `holdsRecord` is still asked **company-wide per day**,
which is why the two grouped date queries are not scoped to the employee: whether the system was
watching a day is a fact about the day, not about them.

### `other` is still the branch to watch

Its `reply` is the only wording that reaches the administrator unread by anything else, so the prompt
forbids stating any company fact it was not given — and, as in the leave prompt, says plainly that
classifying is not refusing. Every other intent discards `reply` entirely — `roster` and `person`
because the records answer, `invite` and `remove` because the proposal does, and a model that
narrated a deletion would be confirming something that has not happened. The prompt says that in as
many words: never confirm, never report it done. **When you add a fact worth asking about, add an
intent, not a paragraph to the prompt.**

`requestJson` in `ai.service.ts` is generic over the intent shape because there are now two
assistants that differ only in prompt and schema. A second copy of the fence-tolerant JSON
extraction and the one retry is the last thing this codebase needs.

`RichText` in `admin-chat.tsx` renders `**bold**` and nothing else, deliberately not a markdown
library. The replies are built by the service, so the syntax in them is known exactly; a parser
would also mean sanitising its output, and the only thing the model can influence here is its own
short acknowledgement.

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

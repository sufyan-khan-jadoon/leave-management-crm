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

Listing is gated in the route handler — `role=ADMIN` on `/api/admin/employees` requires
`canViewAdminRecords`, the grant the attendance roster and leave list already use. That is a *read*
and nothing more: everything above still applies to every write, so a granted administrator sees
those rows and can edit, suspend or delete none of them. See "Filtering by population" for why
seeing and acting were separated rather than kept together. `SUPER_ADMIN` is not a value
`employeeQuerySchema` accepts, so it can never be listed at all.

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

### Locking a profile is not suspending an account

`profileLockedAt` freezes somebody's **own editing** and nothing else. A locked employee signs in,
marks attendance, books leave and is counted in every figure exactly as before; what they cannot do
is change their own name, phone, department, photo or joining date until an administrator releases
it. Suspending is the other thing, it already existed, and it stops sign-in outright.

**It is deliberately not an `EmployeeStatus`.** The two are not points on one ladder — one decides
whether the account works at all, the other who may edit its details — so a single column would
leave every later reader guessing which "locked" meant. `setProfileLock` never touches `status`,
verified.

**Seniority is `assertMayManage`, reused rather than restated**, which settles four questions for
free: an ordinary administrator reaches employees only, administrator accounts answer to the super
admin, the owner is untouchable, and nobody locks themselves. All four verified, along with the
super admin being able to lock an administrator.

**An incomplete profile cannot be locked**, and that refusal prevents a trap rather than tidying:
`middleware.ts` sends anybody without a finished profile to `/profile/setup` and keeps them there, so
freezing one before it is written would leave them unable to finish and unable to go anywhere else.

**It never blocks a password change.** `/api/profile/password` is untouched — freezing somebody's
details out of their reach is people-management; locking them out of their own credentials is a
security regression.

The rule lives in `updateOwnProfile`, not in the form. `ProfileForm` shows the notice and disables
the button, and that is a courtesy exactly as the read-only job title is — a hand-made request is
refused by the service. The refusal quotes `profileLockReason` when there is one, which is why the
reason is stored at all: a frozen form that cannot say why sends somebody hunting for an
administrator to ask. All three columns move together, so releasing a lock never leaves a stale
author behind.

`profileLockedById` is `onDelete: SetNull`, for the reason the attendance audit uses it — removing
the administrator who set a lock must not remove the lock, nor the person it was about.

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

`SKIPPED` is not a failure: it means the day was already over by the time anything tried to announce
it. The date still closes the office. Note it no longer covers a closure declared *for today* — that
is announced on the spot, in its own words; see "Announcing it" below. There is deliberately no
`PENDING` — every closure gets a real answer the moment it is created, so a "not looked at yet" value
would be write-dead in exactly the way `LeaveStatus.PENDING` became.

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

**A closure declared for today is announced immediately, and this note used to say the opposite.**
The old rule skipped anything starting today or earlier, on the reasoning that nobody can be warned
in advance about a day already underway. That reasoning was sound about *advance warning* and wrong
about the message: it left an administrator closing the office this morning with a row reading **Not
announced** and not one person told, which is how it came to be reported as broken. The whole of the
mistake was in the wording, not the timing — "closed tomorrow" is useless on the day, "closed today"
is exactly what somebody who has not yet set off needs. So `officeClosedTemplate` takes `closesToday`
and words itself from it, and the plan sends rather than skips.

Only a day that is genuinely **over** skips now, which in practice only a sweep that has been down
can produce. `announce` re-judges this from the row at the moment of sending — `< today` skips,
`=== today` sends and says "today" — rather than trusting what the caller believed when the row was
written, so a creation and a late sweep cannot word the same closure differently. Both comparisons go
through `todayUtc()`, which reads the company's calendar day, so 00:30 in Karachi is the 15th here
even while the server's UTC clock still says the 14th.

`dueAt` for a same-day closure is **now**, not the noon that has already gone by. Storing the latter
would write a due time into the row that had already passed when the row was written, which reads as
an announcement running late rather than one made on the spot. It is also what the retry depends on:
`findDueNotices` looks for `SCHEDULED` rows whose moment has come, so a same-day announcement whose
delivery failed is picked up by the next sweep that day and skipped only once the day is over.

The status is `SENT` and the screen calls it **Announced** — the badge is worded for the column it
sits under, not for the SMTP call underneath it. `SCHEDULED` still reads "Scheduled" and carries the
due date, which is the future case; `SKIPPED` keeps "Not announced". Verified against the real
database with the mailer stubbed: today → `SENT` and "Office closed today", tomorrow after noon →
`SENT` and "Office closed tomorrow", six days out → `SCHEDULED` due at noon the day before, a past
date refused at creation, a stale `SCHEDULED` row for a finished day → `SKIPPED` with nothing sent,
the status surviving a re-read, and the next sweep finding nothing left to re-announce.

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

That still holds, including now that lateness exists. Lateness is measured from the **cutoff** — the
deadline to have appeared — and is derived on read rather than written into `status`; see "How late
is late" below. `HALF_DAY` remains entirely unwritten.

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

### How long the correction stays open

`AttendancePolicy.hrMarkWindowMinutes` is how long past a day's cutoff a **delegated** administrator
may still record somebody present. The super admin sets it from the Access panel; 20 is the seeded
starting value and 0 to 240 is the accepted range. Nothing in the attendance logic names a duration —
`hrMarkWindowExpiresAt` and `isWithinHrMarkWindow` in `attendance-policy.ts` are the whole rule, free
of Prisma so they read and test alone exactly as `geo.ts`, `lateness.ts` and `holiday-notice.ts` do.

**The expiry is derived from the date, never stored and never started by a page load.** It is
`cutoffInstant(day) + window`, computed through `appZoneInstant` like every other time rule here, so
a refresh, a second tab, a fresh sign-in and a request from `curl` all arrive at the same moment. A
row on `attendance` holding an expiry would be a second copy of an answer already derivable, and
would fall out of step the instant either the cutoff or the window moved. That is also what makes
changing the window safe: raising it tomorrow cannot reopen yesterday, because yesterday's cutoff has
gone regardless of what the number says today.

**It is judged on the server on every request and nowhere else.** The countdown on the roster is
rendering; `markPresentFor` asks `isWithinHrMarkWindow` again after the roster has spoken and before
anything is written, so a stale tab, a wound-back clock or a hand-written POST is refused with the
button still on screen. The endpoint returns `serverTime` beside `expiresAt` purely so the countdown
can correct for a browser clock that disagrees — it authorises nothing.

**The boundary is strict.** At exactly `cutoff + window` the permission is over. A boundary that
counts as inside is one that has to be re-argued at every call site.

**Before the cutoff the window is trivially open**, which is the ordinary case rather than an
oversight: an administrator correcting a day while it is still running should not be refused for
being early. The window is a far edge, not a slot. A window of **0** therefore means the permission
ends the instant the deadline falls — the tightest real setting, not an off switch.

**It binds `canMarkAttendance` and deliberately not the super admin.** The grant is the thing being
time-boxed; somebody has to stay able to correct a record found wrong next month, or this column
would have removed the only means of fixing the register with nothing put in its place.
`assertMayCorrect` still binds both, so the owner gains no reach they did not already have. The
alternative — binding everybody, which is the literal reading of "every request" — was rejected for
exactly that reason, and scoping the window to *today* was rejected too: an administrator refused at
17:21 could simply correct yesterday tomorrow morning, and a window somebody can sit out is not one.

**Watch the closing time.** `isAfterClosing` refuses a *typed* arrival later than `closingMinutes`,
so when the office closes at or before the cutoff — which is what the shipped defaults say, both
1020 — every late arrival is also an arrival after closing and **nothing inside the window can be
recorded at all**. That interaction is documented above and pinned in `attendance-policy.test.ts`;
what was missing was anybody being told, so the policy panel now warns where the value is set. Do not
"fix" it by exempting window marks from the closing check: that would let an administrator assert an
arrival at a time the office was shut, which is the one claim there is no reason to accept.

**No column was added to `attendance`, and the suggested ones were declined for reasons this file
already gives.** `markedById` / `markedAt` / `reason` are the audit trail and were already there;
`original_status` would be storing absence, which has no row by construction; `manual_mark` is
`markedById != null`; `late_minutes` is derived from the frozen `lateBasisMinutes`, and a second copy
of the answer is what that field exists to avoid.

Verified end to end against the real database, crossing the Zod schema rather than calling the
service directly: a granted admin allowed inside the window and refused outside it with the record
left untouched, the super admin allowed in the same expired window, a zero window closing on the
cutoff, yesterday refused under a four-hour window, the schema refusing −1, 20.5 and 241, lateness
preserved at 13 minutes rather than reset (cutoff 6:45 PM, arrival 6:58 PM, recorded at 8:30 PM),
`lateBasisMinutes` unchanged after the policy moved underneath it, four concurrent marks producing
one row, and a real geofenced check-in surviving an attempt to overwrite it.

### Whose day may be corrected

`assertMayCorrect` is the seniority rule, and it is deliberately **not** `assertMayManage`. That one
governs acts on an *account* — editing an address, suspending, deleting — and reserves administrator
accounts for the super admin, because changing an admin's email is the first half of taking it over.
Correcting a day is not that: it writes one attendance row, touches nothing about the account, and an
administrator who came in and whose phone failed has exactly the problem an employee does. So the
tiers differ by one rung — a granted administrator may correct **`EMPLOYEE` and `ADMIN` alike**,
where `assertMayManage` would allow only the first.

Two refusals remain, and both were holes when this shipped:

- **Nobody corrects their own day.** The grant is a narrow exception to "presence is proved by
  standing there"; aimed at yourself it is just a way to mark yourself present from home, every day,
  without ever going in — the geofence defeated rather than excepted. Somebody else with the grant
  does it for you, the same shape as `assertMayManage` sending you to `/profile` for your own
  account.
- **Nobody corrects the super admin**, itself included, mirroring `assertMayManage` exactly. An
  administrator able to write attendance for the account that granted them the right would be the
  boundary running backwards.

Both were verified *allowed* before the rule existed, which is how they were found — the grant had
been checked and seniority never had. The target's role is read from the row, because
`attendanceRosterSelect` deliberately carries none.

**Viewing is not narrowed to match.** The super admin still appears on the roster and in leave
figures for anyone who can see them, because `rolesInPopulation` counts the owner as an
administrator in every *report* — an account in neither population would vanish from its own
organisation's numbers. The line drawn here is between reading a record and writing one, which is
the distinction the requirement asked for and the one this codebase already makes everywhere else.

**It is its own grant, deliberately not folded into `canViewAdminRecords`.** That one is a read —
who may report on administrators as a group. This is a write that overrides a physical check, and an
HR administrator given the reporting view must not silently acquire the ability to record attendance
for anybody. It is also its own route rather than a `PATCH` on the roster endpoint, so "the
attendance screen is read-only except when it isn't" is not something you have to read the service to
establish — the same split `/api/admin/chat/action` makes.

`markEmployeePresentSchema` is a `strictObject` for the reason `markAttendanceSchema` is, and the
reason is stronger here — that one refuses a client's verdict about a position, this one refuses a
client's verdict about everything. There is no field for a status, because the only status it can
produce is `PRESENT`.

**The arrival time is asked for, not assumed, and that is a fix rather than a nicety.** `checkInAt`
defaulted to `now()` at first, on the reasoning that nobody knows what time the person arrived. That
was wrong the moment lateness existed: somebody who came in at 17:15 and was written up at 17:20 was
charged twenty minutes instead of fifteen, silently, with no way to tell from the row. So
`arrivalTime` is **required** — an absent person has no check-in to reuse, so this is the only place
it can come from, and a default is exactly what caused the defect. The dialog prefills it with the
office's current time so the common case is one keystroke, but a prefilled field somebody can see and
correct is a different thing from a default they never knew was applied. It arrives as `"HH:MM"` and
is paired with the chosen date through `appZoneInstant`, so a browser in another timezone cannot
shift the day. An arrival still in the future is refused.

**An arrival after the office closed is refused too**, and the asymmetry with a real check-in is the
argument rather than an oversight. `isAfterClosing` in `attendance-policy.ts` is the rule, asked
**only** of a time somebody typed. A geofenced check-in at 21:00 is the building reporting that
somebody was standing in it at 21:00 — proof, and the schema is explicit that nothing judges a real
check-in by the clock, so that path is untouched and still records the day exactly as before. An
administrator entering 21:00 is making a claim with nothing behind it, and a claim about a time the
office was not open is the one kind there is no reason to accept. The closing minute itself is
*inside*: somebody walking in as the doors are locked did arrive, and refusing the boundary would
make the published closing time mean a minute earlier than it says. Nothing is refused for being too
*early* — the opening time is a published courtesy, and this file is careful elsewhere not to turn it
into a verdict.

**Note what happens when the cutoff and the closing time are the same minute**, which is what the
shipped defaults say (both 1020). Late means past the cutoff, and past the cutoff is then also past
closing, so **no late arrival can be recorded by hand at all** — every one of them is refused. That
is coherent rather than broken: if the office shuts at the moment somebody stops being expected,
there is no window in which a late arrival is possible. It is surprising enough that
`attendance-policy.test.ts` pins it, and the refusal names both times so an administrator who meets
it can see which setting to change. It is deliberately **not** prevented by validating the policy:
`cutoffMinutes` and `closingMinutes` are written through one endpoint that accepts partial updates,
so a cross-field rule would have to compare against a stored value the sender never saw — the same
problem the `updateAttendancePolicySchema` comment already describes for opening and closing.

### Correcting a day that has already finished

`markPresentFor` above is a **grace period**: bounded by `hrMarkWindowMinutes`, travelling in one
direction, for somebody whose phone failed this afternoon. It was never the thing that puts a register
right three weeks later, and stretching it into one would have meant removing the window — which is
the whole of what makes it safe. So historical editing is a second door: `editHistoricalDay`,
`POST /api/admin/attendance/edit`, behind **`canEditHistoricalAttendance`**, the ninth delegable
right.

**The two grants are deliberately separate.** `canMarkAttendance` writes a check-in the geofence
missed. This one can **delete a check-in the geofence proved**, and moves a day in any direction
between `PRESENT`, `ABSENT` and `ON_LEAVE`. Those are different powers, and an HR administrator
trusted with the first must not silently acquire the second — the same argument that keeps
`canMarkAttendance` out of `canViewAdminRecords`.

**It only ever touches days that are over.** `isHistoricalDate` is strictly `date < todayUtc()`, and
the strictness is the separation of concerns rather than caution: today already has an editor, and if
this reached it the same people would hold an unbounded version of the windowed permission by a second
door. The live check-in flow, the warning sweep and the hr-mark window are all untouched by this
existing. The roster route returns `isHistorical` so the screen and the server agree about which day
today is — a viewer in another timezone would otherwise be offered a control the server refuses.

**Nothing here is a status update, because there is no status column to update.** `AttendanceStatus`
still has one value and absence is still the lack of a row, so every transition is a create or a
delete. `planAttendanceEdit` in `src/lib/attendance-edit.ts` turns the pair into two booleans per
table — Prisma-free and tested alone like `geo.ts` and `working-days.ts`, with all nine ordered pairs
enumerated rather than sampled, because the point of deriving the plan is that no combination can be
silently unhandled. `ON_LEAVE → PRESENT` clears the leave *and* writes the check-in, so the day stops
costing the employee a day of their allowance, which is right: they worked it.

**`EDITABLE_DAY_STATUSES` is three, and each exclusion is a rule stated elsewhere in this file.**
`CLOSED` and `NON_WORKING` belong to the calendar rather than to a person; `REMOTE` is
attendance-exempt so there is no wrong record to correct; `UPCOMING` has not happened; `NO_RECORD`
would flip every colleague to `ABSENT` the moment one row landed in it. All five are refused as
*sources* as well as targets, and the service refuses them **in `refusalFor`'s own words** — the same
roster-derived judgement `markPresentFor` uses, so this screen cannot come to disagree with the one
beside it. They are not values `attendanceEditSchema` accepts either, so asserting one is refused by
the parser before any service has to explain itself.

**The check-in instant is the day's own cutoff, never `now()`.** There is no arrival time to ask for —
one click is the requirement — and on a day three weeks gone `now()` is worse than the defect it
already caused once: it would record an arrival at whatever o'clock somebody happened to press the
button. The cutoff paired with `lateBasisMinutes` means exactly "here, and not late", which is the
minimum claim a correction makes and the only one it has evidence for. Lateness is a separate
accusation this feature has no information to make; an administrator who *does* know the arrival time
has the roster's own dialog to enter it in. Don't "improve" this by defaulting to the current time.

**Every refusal happens before the first write**, and that is a fix rather than a precaution. The
deletes and creates span two tables and the layering keeps `prisma` in the repositories, so there is
no transaction to roll one back — the constraint the reset already documents. The allowance check was
inside `bookCorrectedLeave` at first, which runs *after* the check-in is removed, so a
`PRESENT → ON_LEAVE` over the monthly limit deleted the check-in, threw, and left the day reading
`ABSENT` with no audit row to explain it. A refusal has to leave the record exactly as it found it.

**Moving a day *to* `ON_LEAVE` books real leave, and the allowance still decides.** This file is
emphatic that there is no administrator approval path and that adding one would let somebody approve
past `MONTHLY_LEAVE_ALLOWANCE` by hand. This is not that: it is refused by the same count that refuses
an employee's own request, so an administrator can record that leave was taken and cannot grant more
than the policy allows. The reason is generated rather than asked for — `Leave.reason` is a required
column and a mandatory box collects "n/a".

Seniority is `assertMayCorrect`, reused rather than restated, so all four of its answers come for
free: a granted administrator reaches `EMPLOYEE` and `ADMIN` alike, nobody edits their own day, and
nobody edits the owner's. Nothing is emailed — a letter about a day already past gives its recipient
nothing to do, and the audit row is where this is answerable.

#### The change log

`AttendanceEdit` is **a table rather than columns on the row**, breaking this codebase's habit for the
reason `RemoteWorkEvent` breaks it. `Attendance.markedById` works precisely because a check-in is
never amended; historical editing breaks that in both directions, and `PRESENT → ABSENT` **deletes the
very row an on-row audit would live on**. An audit that vanishes with the thing it describes is not
one.

Both statuses are stored as plain strings copied **by value**, because `AttendanceDayStatus` is
derived in `describeDay` and has never existed in the database — there is no enum to point at, and
what belongs in the record is what the roster *said* at the moment somebody acted. `editorRole` is
frozen for the same reason `consecutiveMissed` and `lateBasisMinutes` are: an administrator later
promoted must not have every past act of theirs retitled. `editedById` is `SetNull` — deleting the
administrator who made a correction must not delete the record that it happened.

`date` and `createdAt` are two different questions and the screen answers them separately: *which day
was corrected* versus *when somebody corrected it*. The log is ordered by the second, because "what
has been changed lately" is what it opens on — ordering by the first would bury this morning's fix to
last March under corrections made weeks ago.

**`GET /api/admin/attendance/edits` is the super admin's alone, gated in the route**, deliberately
unlike almost every other admin surface here, which guards loosely and settles a delegable grant in a
service. There is no delegable half: this is oversight *of the administrators*, and an administrator
who could read it would be auditing themselves. `canEditHistoricalAttendance` buys making a
correction, never reviewing everybody else's. `/admin/attendance/changes` re-checks the same thing
before it renders — **a page is as reachable as an endpoint**, the lesson `staff/[id]/page.tsx`
records. It is nested under Attendance rather than given a sidebar item, so `adminAttendance` not
being `exact` keeps the nav highlighted and no item exists that only one account can see.

There is **no `PATCH` or `DELETE`** on any of it, and the absence of the verb is the enforcement —
the same way `/api/complaints/[id]` has none. An audit somebody can edit is not one.

**Reports, exports and analytics needed no changes at all**, which is the return on absence being
derived in one place. Every figure downstream counts rows: `describeDay` re-reads the tables, so the
roster, the tiles, `historiesFor`, the attendance rate, the calendar, the trend chart and all three
exported files reflect a correction the moment it is written. Nothing caches a status and nothing
stores one.

### How late is late

`src/lib/lateness.ts` holds the whole rule, free of Prisma so it can be read and tested alone exactly
as `geo.ts`, `working-days.ts` and `holiday-notice.ts` are. `lateness.test.ts` pins every specified
case and passes under `TZ=America/New_York`; if it starts failing there, something has begun trusting
the server's clock.

**Lateness is measured from `cutoffMinutes`, and never from `openingMinutes`.** The cutoff is the
deadline to have appeared — the same one the warning sweep uses — so measuring from it is coherent.
The published opening hours are a courtesy, and the schema says in as many words not to reach for
them to judge anybody. The consequence is worth stating rather than discovering: **somebody arriving
at 09:15 is not late, and neither is somebody arriving at 16:59.** Only arrivals past the deadline
register at all. That is precisely what makes this safe to add to a system that had never judged
anybody by the clock — it accuses only the people who missed the deadline outright, who are the
people an administrator is correcting the record for. Repointing this at `openingMinutes` would
reclassify every check-in after 9am in the system's history as late, in one deploy, silently.

**`LATE` is still not an `AttendanceStatus`.** The enum still has one value and `describeDay` is
untouched, because somebody late is `PRESENT` — they were there. Lateness is derived on read from
`lateMinutesOf`, which is the one place a row becomes a number of minutes, so the roster, the CSV,
the employee's own history and the assistant cannot arrive at different answers. `LATE` exists only
as a *filter* on the roster query, meaning "present, and past the deadline", and `summary.late` is a
**subset of `summary.present`** rather than a column beside it — adding them would count a latecomer
twice and make the tiles overshoot the headcount.

**`lateBasisMinutes` is the one judgement attendance stores rather than derives, and it stores the
input rather than the verdict.** The cutoff in force is copied onto the row when it is written and
never recomputed, so moving the deadline next month cannot rewrite how late somebody was last week —
the same argument `AttendanceWarning.consecutiveMissed` makes, that a stored figure is what the
record *said*. The minutes themselves are still computed on every read, so there is no second copy of
the answer to fall out of step with the check-in time. Both write paths freeze it, the geofenced one
included, so an ordinary check-in and a corrected day are judged alike. Verified: with a row written
at a 17:00 cutoff, moving the policy to 18:00 leaves it reporting 15 minutes.

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

**It reaches Staff too, and this note used to say the opposite.** `role=ADMIN` on
`/api/admin/employees` was the super admin's alone, on the reasoning that the roster is the route to
every management action on those accounts. That reasoning was about *managing*, and it still holds —
what it never justified was hiding the list. The objection recorded here against widening it was
that a granted administrator would "list administrators and do nothing to them", and that turned out
to be the feature rather than the flaw: knowing who your colleagues are and being able to suspend
them are different powers, and conflating them cost the first in order to protect the second.

So the listing needs `canViewAdminRecords` — the same grant, not a sixth one, because it hands over
the same knowledge — and **`assertMayManage` is untouched**. A granted administrator gets the
Administrators tab, search, filters and the profile page; edit, suspend and delete stay the super
admin's and those menu items do not render. `SUPER_ADMIN` is still not a value
`employeeQuerySchema` accepts, so the owner appears in no listing whoever is asking.

`byIdForActor` gained the matching third way through: an employee, your own account, or an `ADMIN`
when you hold the grant. A roster somebody may page through whose rows they may not open would be a
screen at war with itself. The owner stays unreachable by all three, and refusals stay *not found*
rather than *forbidden*, so the endpoint cannot be used to discover which ids belong to
administrators.

**`staff/[id]/page.tsx` called `byId`, not `byIdForActor`, and that was a real hole.** The
server-rendered profile had no seniority check at all while `GET /api/admin/employees/[id]` beside
it did — so any administrator could open any account, the super admin's included, by typing the URL.
The attendance roster's eye button links straight there and the id sits in the address bar. Verified
refused now. **A page is as reachable as an endpoint; gate it with the same function.**

**The leave list carries the same filter, through the same service.** `/api/leaves` and its CSV
export both accept `population` and both call `assertMayFilter`, so the two screens cannot come to
disagree about who may separate the groups. An employee never reaches the check — their own id
replaces the query first, and a population could only ever make their own history vanish. The
unfiltered list still returns every role exactly as it always has: this widens what may be *asked
for*, never what comes back by default. `leaveWithEmployeeSelect` still deliberately carries no
`role`, for the reason `attendanceRosterSelect` does not — the filter is how somebody narrows to a
population, not a column that labels every row with what its owner is.

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

### Reporting on it — the screen that owns no facts

`/admin/reports` answers attendance, absence and leave over a period, for people an administrator
chooses. **It derives nothing.** Every date it prints comes back from `attendanceService.historiesFor`,
which is `describeDay` — so a closure, the working week, approved leave, the future and `NO_RECORD`
are all honoured for free, and lateness is `lateMinutesOf` reading the basis frozen on each row. A
second opinion about what a day meant is the one thing a reporting feature must not introduce: it
would be wrong in a spreadsheet somebody archives and mails around, where nothing can be checked
against the screen that disagreed with it. What `report.service.ts` actually decides is narrower than
it looks — **who** the report covers, **which** of their days are records worth printing, and **what
those add up to**.

`historiesFor` is the rectangle `rosterEntries` and `historyFor` were two edges of: everybody on one
day, one person across many days, and now many people across many days. `historyFor` was rewritten
as a call through it rather than left beside it — the `in [id]` costs nothing over the equality it
replaced, and two implementations of one day walk is how the report and the assistant come to
describe one date differently. `holdsRecord` is still asked **company-wide per day**, so narrowing a
report to a department that happened to be away cannot turn its absences into nothing having
happened.

**Exactly one record per person per day, and never two.** That is what makes selecting every record
type impossible to double-count: the row's type comes from the day's single verdict, so a date cannot
be both an attendance record and a leave record however many boxes are ticked. Where a date holds a
check-in *and* approved leave the roster ranks the check-in first — it is the stronger evidence — so
the row reads `PRESENT` and the leave rides along on `leaveStatus`/`leaveReason` rather than being
lost or printed twice. Verified against the real database: all three types together is exactly the
three singles summed, and every key is distinct.

**`CLOSED`, `NON_WORKING`, `NO_RECORD` and `UPCOMING` are not records**, so `recordTypeOf` returns
null for them and they appear in no table. They are counted in `ReportCoverage` instead, which is
where they belong — the office being shut is a fact about the period rather than about anybody.
That is also why coverage is kept apart from the totals: "22 working days" is a property of the
calendar, and summing it across eleven people to report 242 is a number nobody asked for and
everybody misreads. The tiles say *per person* out loud.

**Every number describes the rows the report currently holds.** One rule for the whole payload — the
record types, then the search, role and status narrowing on top — so the summary, the individual
sections, the table and the export cannot say different things about one report. `coverage` is the
exception that proves it: the calendar does not narrow when somebody types a name into a search box.

**The narrowing runs on the server, and that is not ceremony.** The report is paged, so a search
applied in the browser would search page one and report that nothing matched, while the summary
beside it went on describing rows the table had stopped showing. It is assembled and summarised whole
and only then paged, the same trade `roster()` makes and for the same reason: the thing a row is
filtered on — its record type — **does not exist in the database to filter by**, being derived per
person per day from four tables and the working week. `MAX_REPORT_RANGE_DAYS` (366) on one axis and
`MAX_SELECTED_PEOPLE` (200) on the other are what bound it; the queries behind it are six bulk reads
however many people are named.

**Joining mid-period is reported, never acted on.** `describeDay` takes no notice of when somebody
started, so a day before their first one reads exactly as it does on the attendance roster.
Reclassifying it here would be the report forming an opinion about a date. `joinedDuringPeriod` names
it instead and the screen marks the section.

#### Who may report

`assertMayReport` is `canViewAdminRecords` with **no free case**, and that is the one place this
screen is stricter than its neighbours. `assertMayFilter` waves `ALL` through and `assertMayReportOn`
waves the employees through, because what the grant protects is the ability to tell the two
populations apart. A report cannot offer that exemption: every row carries a `Role` column, the
picker names what everybody is, and the summaries split by population — there is no version of this
screen that withholds the thing the grant exists to withhold, so the whole feature sits behind it
rather than half of it. It is deliberately **not a sixth grant**: reporting hands over exactly the
knowledge this one already hands over, and it confers no write — `assertMayManage` and
`assertMayCorrect` are untouched.

The picker is behind the same assert as the report, because the list is the sensitive half. `SELECTED_*`
resolves ids **within the roles the selection claims**, so an administrator's id posted into the
employee selection reports on nobody and comes back in `missingSelections` rather than being silently
dropped — a report quietly covering four of five chosen people is indistinguishable from one whose
totals are simply low.

The bulk selections admit `ACTIVE` alone, exactly as `listAttendanceRoster` does — "all employees" has
to mean the same set of people here as on the screen beside it. A **named** selection also admits
`SUSPENDED`, because naming somebody is an explicit instruction about them and their history did not
stop existing when their account did. `SUPER_ADMIN` is counted with the administrators, as
`rolesInPopulation` counts them in every report; an account in neither population would vanish from
its own organisation's figures.

#### One person's report — the same engine, a different door

`/admin/staff/[id]/report` is the report about one person, reached by a **View report** button on
their profile. It is not a second reporting feature: `reportService.forEmployee` builds the same
`ReportRequest` the workforce screen builds, with one subject and every record type, and runs it
through the **same** `assemble` — which is why `generate` was split rather than copied. The tiles,
the coverage, the lateness and the three exported files inherit every rule above for free. A
per-employee report assembled separately would be a second implementation of a report that already
exists, and the two would drift in the copies that get archived.

**The gate is `byIdForActor`, and that is the whole permission argument.** Deliberately *not*
`assertMayReport`, which has no free case because the workforce screen prints a `Role` column on
every row and names everybody in a picker. This screen is about one person whose profile the viewer
has **already opened**, and it is reached by a button on that profile — so it is exactly as
reachable as the profile page, by exactly the same rule, applied by exactly the same function. Both
directions matter: an ordinary administrator reaches an employee's report without
`canViewAdminRecords` (gating otherwise would take the feature from most of the people it is for),
and an administrator's report still needs the grant, because `byIdForActor` refuses their profile
without it. The owner is unreachable to everybody but themselves. Refusals are **not found**, so the
URL cannot be used to discover which ids belong to administrators. The page, the endpoint and all
three exports each apply it — *a page is as reachable as an endpoint*, the lesson
`staff/[id]/page.tsx` records, applied on the way in this time rather than after the fact.

**It has no in-report filter, and the absence is the design.** `employeeReportRequestSchema` carries
a range and paging and nothing else — no search, no status, no record types. The rule "every number
describes the rows the report currently holds" is cheap on a screen that is a summary and a table;
on one with a headline rate, eight tiles, a calendar and two charts it would mean every narrowing
moved all of them, or that some of them quietly stopped describing the table beneath. So the period
is the only filter and the record types are always all four.

**A preset carries no dates.** `resolveEmployeeReportPreset` in `src/lib/employee-report-range.ts` is
the whole rule, Prisma-free and tested alone like `geo.ts` and `working-days.ts`, and the server
resolves the word against `todayUtc()`. A preset arriving *with* dates is **refused rather than
ignored** — the same stance `remote-work.schema.ts` takes towards a fixed duration sending its own,
and for the same reason: silently dropping them leaves a client believing it decided something it
did not. Weeks start Monday, deliberately not at the first configured working day: a week that
followed the policy would silently re-cut every past report the moment the working week moved.

##### The attendance rate, and the defect that shaped it

**`present / (present + absent)`, and nothing else in the denominator.** The obvious formula is
`present / attendanceEligibleDays`, and driving this against the real database is what showed it to
be wrong: an employee with five check-ins and **not one absence** was reported at **23.8%**. August
holds 21 working days, he had been present on all five the system held anything about, and the other
sixteen were days still to come or days holding no record for anybody in the company. Dividing by
them charged him for a calendar he had no part in — the exact accusation `NO_RECORD` exists to
withhold, arriving by arithmetic instead of by a status.

Each excluded kind of day is excluded for a reason this file already gives: `UPCOMING` has not
happened, `NO_RECORD` was not being watched, `REMOTE` is attendance-exempt, `ON_LEAVE` was
authorised, and closures and weekly days off are not working days at all. What is left is the two
verdicts that say whether somebody turned up.

**§12's worked example is untouched, which is what makes this safe**: 22 working days, 5 remote, 17
eligible, 16 present, 1 absent — 16 + 1 is 17, so both formulas give 16/17. They diverge only where
§12 had nothing to say. `attendanceEligibleDays` still means what it meant and is still what the
workforce report and every export print; this is a second figure beside it, not a redefinition.
`attendanceAssessedDays` rides along so the tile and the exported summary can name what was divided
by rather than leave a reader to guess. It is `null` — never `0` — when nothing was assessed.

##### What it deliberately does not report

**There is no check-out on `Attendance`**, so there is no working-hours column, no early-departure
count and no "hours worked" tile, and none of them is inferred from something adjacent. There is no
leave *type* on `Leave`, so leave is reported by date, duration and reason. This is the same refusal
the workforce report records, restated because a screen full of tiles is where somebody will be
tempted to fill the gap. If a check-out ever lands, the hours belong beside `lateMinutesOf` —
derived on read, in one place — not computed in a component.

##### The pieces, and where the rules live

`leave-spells.ts` groups the per-day leave rows back into the stretches they were booked as, and
**`days` is the row count, never `to − from`** — a Friday and the Monday after is two days off, not
four. Which days may be spanned without breaking a run is passed *in* as the set `describeDay`
already called `CLOSED` or `NON_WORKING`, so this file never becomes the second place in the
codebase that thinks it knows what a weekend is. `report-trend.ts` buckets the day walk for the
chart and counts nothing that is not a record, so the columns sum to the tiles by construction at
every granularity — pinned by a test, and again against the live database.

`DAY_STATUS_VISUAL` is a **finer** encoding than `AttendanceStatusBadge`, not a competing one. The
badge has four tiers and five statuses share the last; that is right where the word does the work
and useless in a calendar cell where the colour *is* the word. Where the badge commits to a colour
this agrees with it; where it deliberately merges, this separates, and only there. Remote takes
`--brand-deep` — the palette's other green, which reads as a day somebody worked and carries no
verdict. **The wording is `dayStatusLabel` in both**, which is why `DAY_STATUS_LABELS` grew from four
entries to eight and the badge now reads its labels from there instead of keeping its own copy.

The document gained an optional `subject`: with one, the identity block names the person instead of
printing "Selected employees — 1 person", the summary carries the rate, and the filename carries the
name. That is the only change the three renderers needed — none — because `report-document.ts` is
the seam.

#### The exports — three files, one document

A report downloads as **Excel, PDF or CSV**, and all three re-post **the same body through the same
service call** with only the page size opened up (`generateAll`), refinements included, so no file can
hold rows the screen did not nor leave out rows it did. `exportReport` in `src/lib/report-export.ts`
is where the guard, the schema, the service call and the branded document happen **once**; a route is
left holding its own format and nothing else. Three routes each repeating that plumbing is three
places for one of them to quietly stop honouring a filter.

**`report-document.ts` is the seam, and it is the whole of the consistency argument.** It turns a
`ReportResult` into headings, labels, columns and cells, and the three renderers — `report-csv.ts`,
`report-xlsx.ts`, `report-pdf.ts` — are three views of *it*. A spreadsheet and a PDF built
independently would be two more implementations of a report that already exists, and they would
disagree long before anybody noticed, in the copies that get archived and mailed around where nothing
can be checked against the screen. It is pure and free of Prisma and of Next, so it is driven with a
real report rather than only through an HTTP call, and **it never recomputes anything** — every figure
is one `report.service.ts` put on the report.

The columns follow the **record types the report holds**, exactly as `ReportSummary` and `ReportTable`
do on screen: a leave-only report carries no check-in columns, and no `Absent: 0` line appears in a
report that never asked about absence. That rule lives in the document once, so the screen and the
three files cannot answer it differently. `roleLabel` and `dayStatusLabel` moved into
`report-labels.ts` for the same reason — a file reading `ON_LEAVE` beside a screen reading "On leave"
is one report described twice.

**Branding is a literal, not `appConfig.name`.** `src/lib/brand.ts` holds `Zovencia` and the tagline,
for the reason `services/email/templates.ts` gives about the letterhead: the app name is an
environment variable, and a stale `APP_NAME` would put the wrong company on a document somebody
archives — the same place as an email, where the mistake cannot be recovered because the file has
already left. Filenames are `Zovencia_Report_2026-08-16` or `Zovencia_Report_2026-08-01_to_2026-08-16`,
one stem across all three formats, ISO-dated so a folder of them sorts.

**Excel is three sheets**, because that is what a spreadsheet is for: sorting, filtering and totalling
do not work with a summary block sitting above the header row. The header is frozen and carries the
autofilter. Figures that are *wholly* a number are written **as numbers** — a column of counts stored
as text cannot be summed and Excel flags every cell of it — while `42 m` and `5:00 PM` stay text,
because a number with its unit stripped off is a different fact. A leading `=` is stored as a string,
not a formula; the CSV's `escapeCsvCell` still neutralises it there, where it would otherwise execute.

**The PDF measures its columns rather than guessing them.** The document's `width` is a character
count, which is exactly what Excel wants and says nothing about millimetres at 7pt: scaling it
directly broke `2026-08-18` into `2026-08` / `-18` and `Administrator` into `Administrat` / `or`. So
`measureColumns` asks jsPDF for the width of each column's widest *unbreakable token* and its widest
whole cell, guarantees the first and shares the remainder in proportion to the second — free text
absorbs the shortfall, dates and enum values stay intact. The letterhead and footer are drawn once per
page through a `Set` of decorated pages, since every table on a page fires autoTable's hook.

**`MAX_PDF_DETAIL_ROWS` bounds the medium, not the report**, which is why only the PDF has one.
Rendering is worse than linear — 500 rows 0.6s, 2,000 rows 1.9s, 5,000 rows 7.4s — and `vercel.json`
sets no `maxDuration`, so a big report would arrive as a timeout with nothing to say why. Above the
cap the records stop and a note says so; the totals, the coverage and every individual summary still
describe the whole report, so a capped PDF is a complete report that stops listing rather than a
partial one. Raise it only alongside `maxDuration`, and re-measure.

`escapeCsvCell` moved to `src/lib/csv.ts` when the third export arrived: two identical copies were
tolerable, a third would have made the formula-injection guard something you have to remember to bring
with you.

Both report endpoints are **`POST` that write nothing**. A period in one of three shapes, a people
selection, up to two hundred ids and a set of record types is past what a query string reliably
carries, and it would land in access logs naming everybody the report was about.
`reportRequestSchema` is a discriminated union of `strictObject`s, following `markAttendanceSchema`:
there is no field for a total, a count or a summary, because the browser computes none of them, and a
payload carrying one is refused loudly rather than stripped.

Verified end to end against the real database, crossing the Zod schema rather than calling the service
directly — 77 checks: every people mode and every record-type combination, the three period shapes,
agreement with `roster()` on present/absent/on-leave/late for a real day, a hand-recorded row keeping
its `markedBy` and its null distance beside a geofenced row keeping its distance, a temporary closure
removing a working day and its withdrawal restoring the day exactly, pages that neither overlap nor
disagree about the total, an empty period reading `NO_RECORD` rather than accusing everybody, a future
period accusing nobody, the CSV holding every row the report did, and every table counted before and
after to prove nothing was written.

The three exports were verified the same way and **against an isolated schema**, not the live one — a
scratch Postgres schema built from the datamodel, seeded with a real August (on-time and late
check-ins, a hand-recorded correction, absences, approved leave, a declared closure, a mid-period
joiner and a suspended account), driven, then dropped. 567 checks: every people mode, every period
shape, every record-type combination and the search/role/status refinements, each producing three
files whose headers, totals and coverage match the screen's payload figure for figure; every detail
row agreeing across the UI, the CSV and the workbook on date, name, record type, status and lateness;
the hand-recorded row keeping its recorder and its blank distance beside a geofenced row keeping its
distance; the closure appearing in no record and counted as a closure instead; a formula-shaped leave
reason neutralised in the CSV and inert in the workbook; the PDF branded, paginated and breaking
nothing mid-word; a suspended account out of the bulk selection and in when named; an employee id
posted as an admin selection reporting on nobody; and all three routes refusing an anonymous caller,
an employee, an administrator without `canViewAdminRecords`, and a payload carrying its own totals.

The per-employee report was verified the same way, against the **live** database and crossing the Zod
schema rather than calling the service directly — 26 checks: every preset resolving coherently, the
calendar covering all 31 days of a month exactly once and in order, coverage and totals counted off
those same verdicts, the rows being exactly the record days and agreeing with the calendar field for
field, paging that neither overlaps nor loses a row, agreement with `roster()` on five real dates and
with `historyFor` over a month, a live remote period reading `REMOTE` and leaving the denominator,
leave spells summing to the approved rows in the period, the trend summing to the tiles at all three
granularities, the super admin reaching everybody including itself, an unknown id and the owner both
refused as *not found*, the grant withdrawn mid-run and biting on the very next call with the same
actor, a granted administrator reaching another administrator and an ungranted one refused while
still reaching employees and their own account, all three files rendering with the right magic bytes
and holding exactly the report's rows, the document naming the person and carrying the rate, and
every table counted around a block of thirty report generations and fifteen file renders to prove
nothing was written. The attendance-rate defect above was found by that run and not by reasoning.

**What this system does not record, and what the report therefore does not invent.** There is no
check-out time on `Attendance` and no leave *type* on `Leave` — so there is no "hours worked" column
and no "Casual / Sick" column, and neither is computed from something adjacent. The leave reason is
the free text the assistant extracted, and it is printed as that. If check-out ever lands, the working
hours belong beside `lateMinutesOf` as another thing derived on read from the row.

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

## Writing to the staff and writing to the administrators are two rights

`canSendEmails` and `canEmailAdmins` are separate grants, and neither is a prerequisite for the
other. The first buys INDIVIDUAL and EMPLOYEES; the second buys ADMINS and SELECTED_ADMINS.
ALL_MEMBERS is bought by nothing — it is the audience that includes the owner, and an announcement to
the entire organisation stays with whoever owns the system. Both are off by default, granted per
administrator from Access, and **read from the row on every send** exactly as the other four
delegable rights are.

They compose rather than nest, and that was decided rather than fallen into. Requiring
`canSendEmails` underneath would leave a super admin flipping the admin switch on its own and seeing
nothing happen — a trap dressed as a safeguard. So an administrator may hold either alone and gets
exactly that half. `email-audience.test.ts` enumerates all eight callers against all five audiences
and asserts the two halves never leak into each other.

**The grant narrows the one-person picker, and that is the whole of why it is a boundary.**
`canSendEmails` used to reach a colleague through INDIVIDUAL, because `individualRecipientRoles`
offered administrators to anybody who could send at all. A permission to write to administrators that
could be walked around one administrator at a time is not a permission, so that function now takes
the grants and offers `[EMPLOYEE]` until `canEmailAdmins` says otherwise. **This narrows what an
existing grant buys** — it is the one part of this that took something away, the migration says so,
and `canEmailAdmins` deliberately does **not** backfill from `canSendEmails`: copying it across would
have handed the new group audiences to everybody who held the old one.

`SELECTED_ADMINS` is a hand-picked set, and the only audience whose membership the *sender* chooses.
Everything else is a population a role decides. Three consequences follow and all three are load-
bearing:

- **The ids are resolved *within* the audience's own population**, by
  `listMailRecipientsByIds(ids, audienceRoles(SELECTED_ADMINS), actor.id)`. An employee's id, a
  suspended or unverified account, the super admin's id or the sender's own posted into that list
  resolves to nobody — so the widest a forged payload reaches is still the administrators the caller
  already had. Don't loosen it to `findMany({ where: { id: { in: ids } } })` and filter afterwards;
  that is the same query with the check somewhere it can be forgotten.
- **A shortfall is refused, never trimmed.** If five ids resolve to four people the send is refused
  outright. A message quietly covering four of five is indistinguishable from one the sender meant,
  and mail cannot be recalled to add the person who was dropped.
- **Its recipients are written down.** `EmailDispatch.recipientNames` holds their names, captured at
  send time, empty for every other audience — where the audience and the count already describe it
  completely. Names rather than a join, for the reason `consecutiveMissed` and `lateBasisMinutes`
  are stored: this is what the record *said*, and a rename or a deleted account must not rewrite who
  was told something. The body is still never stored.

The list travels as **one comma-joined `recipientIds` field**, not a repeated one, because the body
is multipart and `parseMultipart` folds repeated text parts to a single value. The schema splits it,
bounds it, deduplicates it and refuses it empty. `email.schema.test.ts` pins that round trip at the
wire rather than at either end — the lesson `admin-chat.schema.test.ts` records, applied before it
could bite a second time.

`/api/admin/emails/recipients` gained a `scope`, which selects between the one-person picker and the
administrator multi-select and **cannot widen anything**: each branch asserts for itself and builds
its own population, and the default is the narrower. The admin branch asks
`audienceRoles(EMAIL_AUDIENCE.ADMINS)` for its population rather than naming `ADMIN`, so the
searchable list offers exactly who "all administrators" would resolve to.

`AdminRecipientPicker` filters **in the browser**, which is the opposite of `ReportPeoplePicker` and
deliberate: that endpoint is capped, so a client-side filter would search page one of an organisation
and report nobody else exists, while this one returns the administrators — a population bounded by
how many people run the company. The same fetch backs the picker and the "all administrators" count
beside it, so the two cannot disagree about who is eligible. Both admin audiences **name their
recipients** before sending and again in the confirmation, rather than only counting them: a number
tells somebody the send is bigger than they meant, only names tell them it is going to the wrong
people.

Verified end to end against the real database with the mailer stubbed, crossing the Zod schema and
the multipart parsing rather than calling the service directly — 97 checks: the grant off by default,
every route to an administrator refused without it, `canSendEmails` alone refused all three of them
including the one-person path, the grant applied and all four delegable audiences appearing, the
eligible list excluding the sender/suspended/unverified/owner/employees and carrying no addresses,
one selected admin receiving it and the other not, both receiving it when both are picked, a
duplicated selection writing once, an empty selection refused three ways, seven manipulated payloads
refused with nothing delivered, three bodies carrying their own verdict refused by `strictObject`,
"all administrators" matching the picker's list exactly, the audit row naming its recipients and
holding no body, revoking the grant stopping the very next send with no new session, an employee
refused everything, the grant refused on an employee and on the owner, the super admin unaffected
throughout, existing employee email untouched, and an attachment riding along while `payroll.exe`
stopped the whole message.

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

## Complaints — the one screen a grant makes disappear

An employee raises something; an administrator who holds `canManageComplaints` reads it, records what
was decided, and closes it; the employee is emailed once. `canManageComplaints` is the **seventh
delegable right**, off by default, granted per administrator by the super admin, read from the row on
every request like the other six.

**It is the only grant that removes a nav item.** Every other permission-gated screen here stays on
screen and explains itself — "Send email", "Working days" and "Reports" all have a useful ungranted
state, and this file argues elsewhere that an item which silently vanishes reads as a broken sidebar.
Complaints invert that: reading them *is* the privilege, so the ungranted version would be a page
whose only content is its own refusal. `visibleNav` filters it out, `/admin/complaints` redirects,
and `/api/admin/complaints` answers 403. **All three, because a page is as reachable as an
endpoint** — the lesson `staff/[id]/page.tsx` records, where the server-rendered profile had no
seniority check while the endpoint beside it did.

The grant is resolved in the admin **layout** from the database, not from the session, so withdrawing
it takes the item off the sidebar on the next load rather than when a week-old token expires. That is
rendering; the page and the endpoint are the control.

**Reading and resolving are one grant, deliberately not two.** An administrator trusted to read a
grievance is trusted to answer it, and splitting them would produce somebody able to read every
complaint in the company and act on none of them.

### What an employee can and cannot reach

`/api/complaints` is scoped to the session id with **no way to widen it** — there is no `employeeId`
parameter to leave off, deliberately unlike `/api/leaves` where an admin who omits it gets the whole
roster. `myComplaintQuerySchema` has no such field at all, and a test asserts its absence: if that
ever starts failing, the endpoint has gained a way to ask about somebody else.

There is **no `PATCH` or `DELETE` on `/api/complaints/[id]`**, and the absence of the verb is the
enforcement. An employee cannot move their own complaint's status (that would be resolving your own
grievance), cannot withdraw it, and cannot edit what they wrote after an administrator has read and
acted on it.

**`internalNotes` is kept out by a select, not by a filter.** `employeeComplaintSelect` omits it, the
same mechanism `employeeSelect` uses for the password hash — a filter in a service can be forgotten
by the next caller, a column that was never read cannot leak. The two email-notice timestamps are
omitted for a different reason: whether the letter reached them is a fact for the administrator who
has to do something about it.

Ownership is the **query**, never a comparison after the fact. `findOwnedBy(id, employeeId)` means
there is no row to forget to check; fetching by id and then comparing works right up until somebody
drops the second half, and the failure mode is one employee reading another's grievance. A complaint
belonging to somebody else is reported as *not found*, so the endpoint cannot enumerate ids.

Complaints are open to administrators too, like leave — an admin is an `Employee` with the same
workplace problems, and the alternative is telling the group most likely to be affected by a senior
colleague that they have nowhere to report it.

### The status lifecycle, and why nothing is terminal

`PENDING → UNDER_REVIEW → RESOLVED | REJECTED`, and **every transition between two different statuses
is allowed**. The obvious design — resolved and rejected as terminal — breaks the case that actually
happens: a complaint closed by mistake, or one whose problem came back. Refusing that would leave the
row permanently wrong with nothing able to correct it.

What *is* refused is the **no-op**. Setting a complaint to the status it already holds is a
`ConflictError`, which is what stops a double-submitted resolution rewriting `resolvedAt` and
re-crediting the decision. It is the cheap half of the once-only defence, not the whole of it.

**Both closing statuses require words.** Only the resolution email was specified, so demanding text
for a rejection is a judgement — but a complaint refused with nothing said about why is precisely
what produces the next complaint, and the employee sees the field either way. It is checked against
the resolution that would be *stored after* the change rather than against what was sent, so
re-closing a complaint that already carries one is fine while closing a fresh one with nothing said
is refused. The schema cannot make that distinction; it never sees the row.

`src/lib/complaint-status.ts` holds all of it, Prisma-free so it reads and tests alone exactly as
`geo.ts`, `working-days.ts` and `email-audience.ts` do. `complaint-status.test.ts` enumerates all
sixteen ordered pairs rather than testing by example.

### One letter per complaint, ever

The guarantee is **not** in the status rules. `shouldNotifyResolution` answers only "is this an
arrival at RESOLVED" and deliberately returns true again after a reopen; what makes the cycle send
one email is `complaintRepository.claimResolutionNotice`, a conditional `updateMany` on
`resolutionNoticeClaimedAt: null` that exactly one caller can win. Same mechanism as
`holidayRepository.claimNotice` and `attendanceWarningRepository.claim`, and here for the same
reason: claiming *after* sending would leave a crash in between looking identical to a complaint
nobody had touched. Verified by racing eight concurrent resolutions — one email, one winner.

**The claim is never cleared.** That is what makes resolve → reopen → resolve send nothing the second
time, and it is why the once-only property survives a refresh, a double submit and two administrators
working the same row.

`resolutionNoticeSentAt` is written only once the mailer accepted it, so **claimed with sent still
null means tried and failed** — a state the roster surfaces in the row rather than hiding, since
nobody opens a resolved complaint to check. It is deliberately **not retried**, for the reason
`AttendanceWarning` gives: a retry that cannot tell "never sent" from "sent, then the write failed"
is how somebody gets the same letter twice.

A delivery failure is **reported, not thrown**. The complaint is resolved — that write already
happened and is correct — so throwing would report a success as an error and invite somebody to press
the button again. `update` returns a `notification` of `sent | failed | already-sent | null` and the
screen words each differently.

**The recipient is the complaint's own author, read from the database.** Never a field on the
request, never the actor, never anything an administrator typed — resolving somebody's grievance must
not be a way to redirect the answer to it. There is no field for a recipient anywhere in the feature.

**`update` re-reads the row after sending, and that fixed a real defect.** The first version returned
the row fetched *before* the notice fields were written, so the response to the very request that
sent the letter reported `resolutionNoticeClaimedAt: null` — and the admin row reads exactly those
two columns to decide whether to show "email failed". It announced a failure for a message that had
just gone out, and self-corrected on the next reload, which is the worst kind of wrong. Caught by
driving it; one extra query, only on the resolve path.

### Attachments are rows, not files

There is no object storage in this project. Complaint attachments follow `profilePhoto` — a **data
URL**, capped, with the cap counted **after** base64 encoding since that is the string that lands in
the column. `MAX_COMPLAINT_ATTACHMENT_BYTES` is therefore not a number to compare against what a file
browser reports.

They are a **table of their own**, and that is the point: `complaintSelect` takes the filename,
type and size to show a paperclip, and the bytes are fetched only when one file is opened. A blob on
the parent row would be dragged into every page of the admin table by every `findMany` that forgot to
exclude it.

The content type is derived from the payload the schema validated rather than taken as a field, so
the two cannot disagree — the argument `email-attachments.ts` makes for deriving from the extension
instead of believing `file.type`. An **allowlist**: images and PDFs. SVG is absent because it is a
document that can carry script, and this string is rendered back to an administrator.

`/api/complaints/attachments/[id]` re-derives the permission **from the complaint**, never from the
attachment id, so an id is not a bearer token for evidence somebody filed in a grievance.

### The reference

`complaintReference` derives `ZV-XXXXXXXX` from the cuid — never stored, so there is no second
identifier to keep in step. The **last** eight characters, because a cuid's leading characters encode
its timestamp and are near-identical for rows created in the same session, which is the one thing a
reference must not be. It is not unique by construction and nothing looks anybody up by it; every
lookup is still by id. **Don't turn it into a key.**

### Verified

718 unit tests (47 status/reference, 33 schema, and the resolution letter joining the 244-assertion
template suite, so it inherits every branding, palette and letterhead invariant). Then **107
end-to-end checks against the real database with the mailer stubbed**, crossing the Zod schemas: the
filing and its stored fields, an employee refused another's complaint and another's attachment, the
ungranted administrator refused all four surfaces, an employee refused the admin surface and refused
resolving their own, search by subject/description/author, the employee/status/date filters, both
sort orders, notes saved and invisible to the author, closing without words refused twice, the
resolution stored with its actor and moment, the letter reaching the author's registered address with
the right subject and text, no second letter on re-resolve or on reopen-and-resolve, eight concurrent
resolutions producing one, a failed delivery reported and not retried, rejection sending nothing, the
grant withdrawn biting on the next call with no new session, and the tiles summing.

## Remote work — days that are exempt rather than absent

An administrator puts somebody on remote work for a stretch of days; those days become
**attendance-exempt**. Not present, not absent, not leave. Nothing is written to `attendance` or
`leaves` when a period is assigned and nothing is deleted when one is revoked — the exemption is
derived from `remote_work_assignments` on every read, exactly as absence and closures are, so
shortening or revoking a period puts the days straight back on the register with nothing to migrate.
`canManageRemoteWork` is the **eighth delegable right**, off by default, read from the row on every
request like the other seven.

**Almost none of the rule lives in `remote-work.service.ts`.** `describeDay` returns `REMOTE`, in the
one place every other day status is decided, and the roster, the warning sweep, the assistant, the
report and the three exports inherit it for free. Nothing in the sweep had to learn about remote work
to stop chasing remote people: it writes only to rows the roster calls `ABSENT`, and these are not.
That is the whole return on absence being derived in one place — **don't add a second check anywhere.**

### The one coverage predicate

`startDate <= day AND (endDate IS NULL OR endDate >= day)`, written twice and only twice:
`coversDate` in `src/lib/remote-work.ts` for the in-memory walks, and `coveringDay`/`coveringRange`
in the repository for SQL. `buildHistories` applies `coversDate` over rows the SQL already selected,
so the two are checked against each other on every cell of every report rather than only where
somebody remembered to.

`src/lib/remote-work.ts` is free of Prisma so it reads and tests alone exactly as `geo.ts`,
`working-days.ts`, `lateness.ts` and `holiday-notice.ts` do; `remote-work.test.ts` pins every
duration, both month-boundary clamps, the leap year, the empty range and the overlap edges, and
passes under `TZ=America/New_York`.

**`endDate` null means until revoked** — an open period, not a missing value. A far-future sentinel
was the alternative and every comparison in the codebase would have had to know the number.

**There is no `status` column.** Active, scheduled, ended and revoked are all readable off the three
dates against today, and a stored copy would need a sweep to keep honest — the argument
`InvitationStatus` makes for having no "expired" and `AttendanceStatus` for having no `ABSENT`. There
is no sweep, so a period that ended last night would sit at ACTIVE until somebody ran one.
`SCHEDULED` is a fourth state beyond the three the brief named, and it earns its place: "Tomorrow"
and a range starting next week exist and are not yet in force, and calling either ACTIVE would be a
lie on the screen an administrator opens to find out who is remote *today*.

### Where REMOTE sits in `describeDay`, and why

`PRESENT` → `CLOSED` → `NON_WORKING` → `ON_LEAVE` → **`REMOTE`** → `UPCOMING` → `ABSENT`/`NO_RECORD`.

- **A check-in outranks it.** Somebody arranged to work from home who nonetheless walked in *was
  there*, the building proved it, and nothing is taken from them for it. This is also why
  `markPresent` does **not** refuse a remote employee: remote decides who is *expected*, not who is
  *permitted*, and refusing would have the system calling a fact it could verify a mistake. What it
  never becomes is a requirement — `MarkAttendanceCard` shows the button under an explanation rather
  than as a bare duty.
- **A closure outranks it.** The office being shut is a fact about the whole company's calendar; a
  day read as REMOTE for some people and CLOSED for the rest would be one date with two accounts of
  it.
- **Leave outranks it**, and this is the ordering worth arguing. Somebody remote for August who
  booked the 25th off is *not working* on the 25th, and the leave is the fact that cost them a day of
  allowance. Reading it as REMOTE would hide a charge already paid. `planLeave` refuses *new* leave
  inside a remote period, so this only ever arises for leave booked first — exactly the case where
  the employee's own booking should win.
- **It outranks the future**, matching the closure: a period arranged for next week is already
  declared about those days, and "remote" answers more than "hasn't happened yet".

`dayHoldsRecord` is deliberately unchanged: a remote assignment is not evidence that the day was
being watched, so an otherwise empty day still reads `NO_RECORD` for everybody else rather than
`ABSENT`. Don't add remote to it to make a tile look better.

### Revoking keeps the days already served

`revocationEndDate` truncates `endDate` to **today** rather than erasing the row, so the fortnight
somebody has genuinely worked from home stays exempt and only the future returns to the register.
Deleting instead would retroactively mark every one of those days absent, which is the false record
this whole feature exists to prevent — §4's "do not retroactively generate false attendance records",
enforced by arithmetic rather than by remembering.

A period revoked **before it started** is closed to an *empty range*: `endDate` lands one day before
`startDate`, and the coverage predicate then matches nothing at all. That is the honest shape for an
instruction that never took effect, and it is why nothing in the database constrains
`endDate >= startDate` — that rule belongs to *input*, and `remote-work.schema.ts` enforces it there.
Revoking never lengthens anything: an already-finished period keeps the end it had.

The revocation is **claimed** with a conditional `updateMany` on `revokedAt: null`, the same
mechanism `holidayRepository.claimNotice` and `complaintRepository.claimResolutionNotice` use, so two
administrators pressing the button at once produce one audit event and one letter.

Coverage queries **include** revoked rows — that is the point of truncating rather than deleting.
Overlap queries **exclude** them, because a period somebody called off is not a conflict with a new
one however its dates read.

### Overlaps, leave and backdating

**Overlapping live periods are refused, not merged.** Two rows covering one day would make "is this
person remote" a question with two answers, and merging silently would leave an administrator who
meant to *move* a period having *extended* it. The refusal names the period in the way and points at
the two things that resolve it.

**Approved leave inside a new period is reported, never overridden.** Those days stay booked and stay
charged, per the ordering above. Refusing the assignment would force an administrator to cancel
somebody's leave in order to arrange their remote month; absorbing it silently would hand back
allowance nobody asked for. `assign` returns `leaveDatesInPeriod` and the dialog says so.

**Backdating is allowed**, and it is the counterpart of `markPresentFor`: "she was working from home
all last week" turns days that read `ABSENT` into days that read `REMOTE`, which is a correction
somebody genuinely needs. It cannot overwrite anything proved — a check-in still outranks it — and
every such edit is on the audit trail with both periods on it. It does **not** unsend warning letters
already delivered; nothing can.

A **revoked** period cannot be edited: it is the record of an arrangement that was called off, and
editing it would make the audit trail describe something that never ran. An **ended** one can, for
the backdating reason above. Moving the dates makes the type `CUSTOM`, because that is what a
hand-picked pair of dates is — keeping "One week" on a period dragged three days out would leave the
label contradicting the dates beside it.

### Who may arrange whose

`assertMayArrangeFor` is **`assertMayCorrect`'s shape, not `assertMayManage`'s**, for the reason
attendance corrections take that shape: this writes an arrangement about somebody's working days and
touches nothing about their account, so a granted administrator reaches `EMPLOYEE` and `ADMIN` alike.
Two refusals, both load-bearing: **nobody arranges their own** — aimed at yourself it is a way to
mark yourself permanently exempt without ever going in, the geofence defeated rather than excepted —
and **nobody arranges the super admin's**, itself included.

`requireActive` is the whole difference between the two callers of `resolveTarget`. Assigning demands
an active account; editing and revoking do not, because otherwise suspending somebody would strand
their live arrangement, unable to be ended by anybody and still counted among the people working
remotely.

**Reading is not the grant.** Every administrator sees who is remote — the attendance roster beside
it already shows them, and knowing whether a colleague is expected in the office is ordinary
people-management. The screen is read-only without `canManageRemoteWork` rather than hidden, which is
what makes it unlike Complaints. The **population** filter is a third question again and answers to
`canViewAdminRecords` through `populationService`, exactly as it does on the roster.

### The report denominator

`ReportCoverage` gained `remoteDays` and `attendanceEligibleDays`, which is `workingDays` minus
`remoteDays` — §12's arithmetic, derived once in `report.service.ts` so the screen, the PDF, the
workbook and the CSV cannot arrive at four denominators for one report. **Remote days stay inside
`workingDays`**: they are days the organisation works and this person worked, and taking them out
there would leave "22 working days in August" reading differently for two people in one report.

`remoteDays` is the one coverage figure that is a fact about the period *and the person* rather than
about the period alone, so `ReportResult.coverage` reports the first subject's and the individual
summaries each report their own. The screen and the exports label it accordingly and show the pair
whenever **anybody** in the report holds a remote day — not only when the record type was ticked,
because the sum is wrong either way and hiding it does not make it right.

`REMOTE` is a `ReportRecordType`, unlike `CLOSED` and `NON_WORKING`: a remote day is a day somebody
worked and the system can name it, where a weekend is a day nobody was asked to. It prints as a row
reading **Remote**, which is §19's requirement — a file archived and mailed around saying "Absent"
for a day somebody worked from home is the mistake this feature exists to stop, and unlike a screen
there is nothing beside it to check against.

### The audit trail is a table, and that is the exception

`RemoteWorkEvent` breaks this codebase's habit of keeping an audit on the row itself, which
`Attendance.markedById` makes the case for. That argument holds precisely because a check-in is never
amended — one row per person per day, and nothing changes it. A remote period is the opposite kind of
thing: its dates are edited and then it is revoked, so the row can only describe its present state
and the period it used to cover would be lost with every edit. Both periods are copied in by value,
the same argument `EmailDispatch.recipientNames` and `AttendanceWarning.consecutiveMissed` make.

Three letters, all fire-and-forget and all **reported rather than thrown** — `assign`, `update` and
`revoke` return `emailSent` so the administrator can notice a message that never left, exactly as the
invitation panel does. Every one of them says in as many words that **attendance is not required**,
because a person told only "you are remote from Monday" still does not know whether to keep marking
themselves present, and guessing wrong reads as the system being broken. The update letter names both
the old and the new period; a changed reason sends nothing, since a corrected typo is not news. The
revocation letter names **the day attendance resumes**, which is not the day of the revocation and
differs whenever a period is called off before it started.

### Verified

826 unit tests: 38 pinning the pure rules, 22 pinning the wire contract — including that a fixed
duration carrying its own dates is refused rather than ignored, since those dates are the server's to
resolve against the company's calendar day and a browser a day out would otherwise book a week
starting yesterday — and four remote-work letters joining the 292-assertion template suite, so they
inherit every branding, palette and letterhead invariant. `npm run typecheck`, `npm run lint` and
`npm run build` all clean.

**What has not been driven against a live database**: the end-to-end passes the other features here
record — the permission boundaries against real rows, the eight-worker revocation race, a real roster
flipping ABSENT→REMOTE, the warning sweep skipping a remote employee. Those need a database and
secrets; the migration below has not been applied anywhere. Treat the runtime behaviour as reasoned
and typechecked rather than as observed.

## The logo — one component, three files

The official artwork lives in `public/brand/` and is copied in **byte for byte** from the supplied
originals (kept in `zovencia logo/` as the source of truth). It is never cropped, recoloured or
redrawn:

| File | What it is | Where it goes |
| --- | --- | --- |
| `zovencia-mark.png` | the standalone Z | every ground, both themes, permanently |
| `zovencia-full-black.png` | Z + ZOVENCIA, black wordmark | light ground |
| `zovencia-full-white.png` | Z + ZOVENCIA, white wordmark | dark ground |

**`ZovenciaLogo` is the only place a logo path is named.** Every surface asks it for a `variant`
(`mark` or `full`) and a `size`; nothing else imports from `public/brand`, so replacing the artwork
later is one edit rather than eight. `BrandMark` — a `CalendarCheck` in a green tile — is gone.

**Theme switching is CSS, not `useTheme()`.** Both wordmarks are rendered and `dark:hidden` /
`hidden dark:block` shows one, driven by the same `.dark` class `next-themes` already puts on
`<html>`. That is the application's own mechanism read a different way, and it buys two things a
hook could not: the component stays a **Server Component**, so the sign-in and landing headers do not
have to become client components to show a logo, and the file swaps in the same paint as every other
themed colour, so there is no mounted-guard flash of the wrong wordmark. Both images are
`loading="eager"` on purpose — a lazy image that is `display:none` never intersects the viewport, so
the browser would only start fetching it at the moment somebody switched theme, which is the one
moment it has to be there already. Verified: switching themes fires **zero** new requests.

Neither image carries `aria-hidden`. `hidden` is `display:none`, which already takes an element out
of the accessibility tree, so exactly one "Zovencia" is exposed at a time. Marking the second one
hidden reads correctly in light mode and leaves dark mode with a logo no screen reader can see.

**Two lockups, and which one a surface gets depends on how much room it has.**

- **The sidebar** renders the full white wordmark *as the word ZOVENCIA*, with only what the product
  name adds to it — PRESENCE — set as text beside it. `productSuffix` in `brand.ts` derives that
  remainder from `appName` rather than hard-coding it, so changing `APP_NAME` cannot leave the panel
  printing "PRESENCE" next to a wordmark that no longer agrees with it.
- **The sign-in and onboarding headers** pair `variant="mark"` with the whole of `appName`. They have
  no fixed width to design against and the mark is the compact form.
- **The landing page** carries `variant="full"` at `lg`, alone. It is the front door, and the one
  screen that is branding rather than chrome.

Nothing anywhere sets the full wordmark beside the *whole* app name — that reads "ZOVENCIA ZOVENCIA
PRESENCE", which is what the mark-plus-name lockup exists to avoid.

**`surface="dark"` is what makes the sidebar lockup legible.** `--sidebar` is the same dark green in
the light palette as in the dark one — that panel does not follow the theme — so a theme-aware logo
there would put a black wordmark on a near-black slab in light mode. The rule is about contrast, and
on a surface that does not follow the theme, following the theme is what breaks it.

**The sidebar logo is nudged up 2px, and the number is measured rather than eyeballed.** The Z glyph
is taller than the lettering beside it, so the wordmark sits low inside its own file: its optical
centre is 43.5 of 352 art-pixels below the artwork's centre. Centring the file therefore leaves
ZOVENCIA about 3px below PRESENCE's baseline, which at a 16px lockup reads as a mistake. 2px brings
the two optical centres within a third of a pixel and the baselines within one — verified by
screenshotting at 4x device scale and measuring the rendered letterforms.

That correction lives at the **call site**, not in `ZovenciaLogo`, and deliberately: the right amount
depends on the baseline and cap height of the text beside it, which the logo component has no way to
know. It is a fact about this lockup rather than about the asset. `size="xs"` exists for the same
lockup — it matches the artwork to the cap height of the copy, and is the only size the full wordmark
plus PRESENCE fits a 16.5rem panel at (108px + 8px + 78px = 194px of 232px usable).

**`ASSETS` carries each file's measured geometry, and that is load-bearing.** The three exports have
very different transparent padding: the black wordmark's artwork fills 88% of its file's height, the
white one 56%, and the mark's artwork is square inside a box half again as wide. Dropped into one
slot with `object-contain` — the obvious implementation — the wordmark **shrinks by a third** the
moment somebody switches to dark, and the mark sits at 63% of any square slot with the rest as
invisible margin. So a caller asks for the height of the *artwork* and `sizeFor` works back to the
file box that puts it there; the wrapper is sized to the ink and the image is centred on top of it,
free to overhang into transparency. Verified by measuring rendered pixels across a theme switch: the
artwork lands within 1px, and the layout box does not move at all. **Don't "simplify" this into a
plain `object-contain` box**, and don't fix it by trimming the files — they are the official assets
as supplied.

The app icons (`src/app/icon.png`, `apple-icon.png`, `public/favicon.ico`) are generated from the
mark: the transparent margin trimmed, re-padded square, resized. That is a platform requirement — a
favicon has to be square and the source is 1.41:1 — and it changes no artwork. The scaffold
`favicon.ico` that shipped with `create-next-app` is gone.

### The letterhead on outgoing mail

Every message carries the two logos: the standalone Z at one end of the green band and the full
**black** wordmark at the other. `brandHeader()` in `services/email/templates.ts` is the only place
that markup exists and `layout()` pours it into all nineteen templates, so none of them holds a copy
to fall out of step — and `templates.ts` is the only file in the codebase that builds email HTML at
all, verified.

**The logos sit on white inside the green band, and that is a measurement rather than a taste.** The
Z is a gradient running from the brand green to near-black, so against `#0AEA0A` **15.2% of its ink
is the colour of the ground behind it** and the mark renders visibly eaten; the full logo loses 3.9%
the same way, all of it in its Z. On white both lose nothing. Keeping the band green and giving the
artwork the surface it was drawn for is the only arrangement that serves both — the alternative is
altering a logo, which is not ours to do. Don't "clean this up" by dropping the logos straight onto
the green.

**The white wordmark is never used in mail**, and a test pins it. Mail has no theme to follow: the
band is green and the panel is white in every client, so black is the only wordmark that reads.

Images are addressed by **absolute URL off `appConfig.url`** — the mechanism the CTA buttons in these
same templates already depend on, since a recipient's client can reach nothing relative and nothing
local. They point at `public/brand/email/`, which holds the artwork with its transparent margin
trimmed and scaled to twice display size: nothing cropped or recoloured, but email HTML cannot let an
image overhang its box the way the app's CSS does, so the padding has to come off for a `width`
attribute to mean what it says. It also takes the pair from 314KB to 11KB on every message.

**`height` is an attribute and `height:auto` is the style, and the split matters.** Pinning the
height in CSS too looks tidier and breaks the case that actually happens: Gmail hides images by
default for a sender the recipient has never written to, and a box frozen at 22px crops the alt text
to a sliced half-word — a letterhead that reads as broken rather than as a name. Left to grow, the
alt sets in the brand's weight and reads "Zovencia". The attribute stays because Word sizes from it.
Verified with images blocked, not only with them loaded.

The footer stays the word "Zovencia" as a literal — the header carries the branding, and a second
logo under it is repetition.

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

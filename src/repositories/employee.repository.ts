import { EmployeeStatus, type Employee, type Prisma, Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/** Columns safe to return to a client — never includes `password`. */
export const employeeSelect = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  role: true,
  status: true,
  canInviteEmployees: true,
  canManageHolidays: true,
  canSendEmails: true,
  canViewAdminRecords: true,
  canMarkAttendance: true,
  lockedAt: true,
  phone: true,
  department: true,
  position: true,
  profilePhoto: true,
  joiningDate: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EmployeeSelect;

export type EmployeeDto = Prisma.EmployeeGetPayload<{ select: typeof employeeSelect }>;

/** Just enough to name somebody on the attendance roster and show their face. */
export const attendanceRosterSelect = {
  id: true,
  name: true,
  email: true,
  department: true,
  position: true,
  profilePhoto: true,
} satisfies Prisma.EmployeeSelect;

export type AttendanceRosterMember = Prisma.EmployeeGetPayload<{
  select: typeof attendanceRosterSelect;
}>;

/**
 * Enough to be sure who is about to be deleted, before it happens.
 *
 * Carries `role` and `status`, which `attendanceRosterSelect` deliberately does
 * not. That is safe only because `findManageableByNameLike` is the one query
 * that uses it and never returns a row the caller may not already act on — an
 * ordinary administrator is handed `EMPLOYEE` candidates alone, so the role it
 * reads back is the only one it could have been. Don't reuse this select for a
 * search that is not role-scoped first.
 */
export const staffCandidateSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  department: true,
  position: true,
} satisfies Prisma.EmployeeSelect;

export type StaffCandidate = Prisma.EmployeeGetPayload<{ select: typeof staffCandidateSelect }>;

/** Just enough to address somebody, and to show who they are without listing them. */
export const mailRecipientSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  department: true,
} satisfies Prisma.EmployeeSelect;

export type MailRecipient = Prisma.EmployeeGetPayload<{ select: typeof mailRecipientSelect }>;

/**
 * The clean sign-in slate. Written wherever the owner has just proved who they
 * are — by password, by code, or by completing a reset — so the streak and the
 * lock it caused can never drift apart.
 */
const UNLOCKED = { failedLoginAttempts: 0, lockedAt: null } satisfies Prisma.EmployeeUpdateInput;

export type EmployeeListFilters = {
  search?: string;
  department?: string;
  status?: EmployeeStatus;
  role?: Role;
  page: number;
  pageSize: number;
  sortBy: "name" | "createdAt" | "department";
  sortDir: "asc" | "desc";
};

export const employeeRepository = {
  findById(id: string): Promise<EmployeeDto | null> {
    return prisma.employee.findUnique({ where: { id }, select: employeeSelect });
  },

  /** Includes the password hash — for credential verification only. */
  findByEmailWithSecret(email: string): Promise<Employee | null> {
    return prisma.employee.findUnique({ where: { email: normalizeEmail(email) } });
  },

  /** As above, by id — for re-proving the password of an already signed-in user. */
  findByIdWithSecret(id: string): Promise<Employee | null> {
    return prisma.employee.findUnique({ where: { id } });
  },

  findByEmail(email: string): Promise<EmployeeDto | null> {
    return prisma.employee.findUnique({
      where: { email: normalizeEmail(email) },
      select: employeeSelect,
    });
  },

  /**
   * Administrators awaiting a decision, oldest request first.
   *
   * Unverified accounts are excluded: the request only counts as made once the
   * address has been proven, so the super admin is never asked to decide on
   * someone who may have typed a mailbox they do not own.
   */
  listPendingAdmins(): Promise<EmployeeDto[]> {
    return prisma.employee.findMany({
      where: {
        role: Role.ADMIN,
        status: EmployeeStatus.PENDING_APPROVAL,
        emailVerified: { not: null },
      },
      orderBy: { createdAt: "asc" },
      select: employeeSelect,
    });
  },

  updateStatus(id: string, status: EmployeeStatus): Promise<EmployeeDto> {
    return prisma.employee.update({ where: { id }, data: { status }, select: employeeSelect });
  },

  /**
   * Active administrators, for the super admin's permission list. SUPER_ADMIN is
   * excluded: it always may invite, so showing it with a toggle would imply the
   * right is revocable.
   */
  listAdmins(): Promise<EmployeeDto[]> {
    return prisma.employee.findMany({
      where: { role: Role.ADMIN, status: EmployeeStatus.ACTIVE },
      orderBy: { name: "asc" },
      select: employeeSelect,
    });
  },

  setInvitePermission(id: string, canInviteEmployees: boolean): Promise<EmployeeDto> {
    return prisma.employee.update({
      where: { id },
      data: { canInviteEmployees },
      select: employeeSelect,
    });
  },

  setHolidayPermission(id: string, canManageHolidays: boolean): Promise<EmployeeDto> {
    return prisma.employee.update({
      where: { id },
      data: { canManageHolidays },
      select: employeeSelect,
    });
  },

  setEmailPermission(id: string, canSendEmails: boolean): Promise<EmployeeDto> {
    return prisma.employee.update({
      where: { id },
      data: { canSendEmails },
      select: employeeSelect,
    });
  },

  setAdminRecordsPermission(id: string, canViewAdminRecords: boolean): Promise<EmployeeDto> {
    return prisma.employee.update({
      where: { id },
      data: { canViewAdminRecords },
      select: employeeSelect,
    });
  },

  setMarkAttendancePermission(id: string, canMarkAttendance: boolean): Promise<EmployeeDto> {
    return prisma.employee.update({
      where: { id },
      data: { canMarkAttendance },
      select: employeeSelect,
    });
  },

  /**
   * Everyone an organisation-wide announcement should reach.
   *
   * Role plays no part — the office closing applies to the super admin as much
   * as to anyone — so this filters on standing alone: active, and at an address
   * that has been proven. Suspended, rejected and not-yet-approved accounts are
   * not part of the office this week, and an unverified address may not belong
   * to the person who typed it.
   */
  listNotifiable(): Promise<Array<{ id: string; name: string; email: string }>> {
    return prisma.employee.findMany({
      where: { status: EmployeeStatus.ACTIVE, emailVerified: { not: null } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    });
  },

  /**
   * People a custom email may actually be addressed to.
   *
   * The same standing test `listNotifiable` applies — active, and at an address
   * that has been proven — because writing to a suspended account or an
   * unverified mailbox is either pointless or wrong. `roles` narrows to the
   * audience being sent to, and `excludeId` drops the sender: nobody needs a
   * copy of their own announcement, and it keeps the recipient count honest.
   *
   * The email address is selected because the mailer needs it. It is
   * deliberately *not* carried into the recipient picker's payload — see
   * `custom-email.service.ts`.
   */
  listMailRecipients(roles: Role[], excludeId?: string): Promise<MailRecipient[]> {
    return prisma.employee.findMany({
      where: {
        role: { in: roles },
        status: EmployeeStatus.ACTIVE,
        emailVerified: { not: null },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      orderBy: { name: "asc" },
      select: mailRecipientSelect,
    });
  },

  /** One addressable person, checked against the same standing rules. */
  findMailRecipient(id: string, roles: Role[]): Promise<MailRecipient | null> {
    return prisma.employee.findFirst({
      where: {
        id,
        role: { in: roles },
        status: EmployeeStatus.ACTIVE,
        emailVerified: { not: null },
      },
      select: mailRecipientSelect,
    });
  },

  /**
   * Everyone expected at the office, for the attendance roster.
   *
   * Role plays no part, the same way `listNotifiable` ignores it: an
   * administrator turns up to work like anybody else, and the super admin is a
   * person with a desk rather than an abstraction. Standing is what filters —
   * a suspended or not-yet-approved account is not part of the office this week,
   * so counting them absent every day would be noise nobody can act on.
   */
  listAttendanceRoster(filters: {
    employeeId?: string;
    department?: string;
    search?: string;
    /** Narrows to one population, the way the admin overview reports on one. */
    roles?: Role[];
  }): Promise<AttendanceRosterMember[]> {
    const where: Prisma.EmployeeWhereInput = { status: EmployeeStatus.ACTIVE };

    if (filters.roles) where.role = { in: filters.roles };
    if (filters.employeeId) where.id = filters.employeeId;
    if (filters.department) where.department = filters.department;

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
        { department: { contains: filters.search, mode: "insensitive" } },
        { position: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    return prisma.employee.findMany({
      where,
      orderBy: { name: "asc" },
      select: attendanceRosterSelect,
    });
  },

  /**
   * Active people whose **name** looks like `term`, for the admin assistant.
   *
   * Name only, deliberately unlike `listAttendanceRoster`, which also searches
   * email, department and position. That breadth is right for a search box and
   * wrong here: the assistant is resolving "is Sufyan in today" to a person, and
   * a term that matched a department would answer about somebody not called
   * that at all.
   *
   * Returns every candidate rather than a best guess. Picking between them is
   * not this layer's business and not the assistant's either — see
   * `answerPerson` in `admin-chat.service.ts`, which asks instead. `take` caps
   * how many it will offer to choose from.
   */
  findActiveByNameLike(term: string, take = 6): Promise<AttendanceRosterMember[]> {
    return prisma.employee.findMany({
      where: {
        status: EmployeeStatus.ACTIVE,
        name: { contains: term, mode: "insensitive" },
      },
      orderBy: { name: "asc" },
      take,
      select: attendanceRosterSelect,
    });
  },

  /**
   * Candidates for an act on an account, narrowed to roles the caller may touch.
   *
   * `roles` is **required**, unlike everywhere else it is optional, because the
   * whole safety of this query is that it cannot return somebody the caller has
   * no business acting on. An account outside the list is not refused later — it
   * never appears, so the assistant cannot be used to find out who the
   * administrators are by naming people and reading which refusals come back.
   * `SUPER_ADMIN` is therefore excluded simply by never being passed.
   *
   * Every status, unlike `findActiveByNameLike`: a suspended account is exactly
   * the sort somebody wants rid of, and "I can't find them" would be a lie.
   */
  findManageableByNameLike(term: string, roles: Role[], take = 6): Promise<StaffCandidate[]> {
    return prisma.employee.findMany({
      where: { role: { in: roles }, name: { contains: term, mode: "insensitive" } },
      orderBy: { name: "asc" },
      take,
      select: staffCandidateSelect,
    });
  },

  /**
   * One account by id, but only if the caller may act on its role.
   *
   * The id arrives back through the client after a disambiguation, so it is
   * re-checked here rather than trusted. Absent from the result reads as *not
   * found* for a role out of reach, which is how `byIdForActor` phrases the same
   * refusal — an id is guessable in a way a name is not.
   */
  findManageableById(id: string, roles: Role[]): Promise<StaffCandidate | null> {
    return prisma.employee.findFirst({
      where: { id, role: { in: roles } },
      select: staffCandidateSelect,
    });
  },

  /** One person by id, in the shape the roster and the assistant already use. */
  findRosterMember(id: string): Promise<AttendanceRosterMember | null> {
    return prisma.employee.findFirst({
      where: { id, status: EmployeeStatus.ACTIVE },
      select: attendanceRosterSelect,
    });
  },

  /**
   * When these people joined.
   *
   * The warning sweep needs it to stop counting backwards at somebody's first
   * day: without it a person who started yesterday reads as having missed every
   * working day in the lookback window.
   */
  async joiningDatesFor(ids: string[]): Promise<Map<string, Date | null>> {
    if (ids.length === 0) return new Map();

    const rows = await prisma.employee.findMany({
      where: { id: { in: ids } },
      select: { id: true, joiningDate: true },
    });

    return new Map(rows.map((row) => [row.id, row.joiningDate]));
  },

  create(data: {
    name: string;
    email: string;
    password: string;
    role?: Role;
    status?: EmployeeStatus;
    /** Set from the invitation's job role, when it carried one. */
    position?: string;
  }): Promise<EmployeeDto> {
    return prisma.employee.create({
      data: { ...data, email: normalizeEmail(data.email) },
      select: employeeSelect,
    });
  },

  update(id: string, data: Prisma.EmployeeUpdateInput): Promise<EmployeeDto> {
    return prisma.employee.update({ where: { id }, data, select: employeeSelect });
  },

  /**
   * Marks the address proven, and clears the sign-in lock with it: answering a
   * code sent to the mailbox is exactly what the lock asks for, so the two are
   * settled by one write rather than left to a caller to remember.
   */
  markEmailVerified(id: string): Promise<EmployeeDto> {
    return prisma.employee.update({
      where: { id },
      data: { emailVerified: new Date(), ...UNLOCKED },
      select: employeeSelect,
    });
  },

  /**
   * Stores a new password hash. `emailVerified` is set alongside it because
   * completing a reset proves control of the mailbox — the same proof the
   * verification flow asks for — so an unverified account is not left locked
   * out after correctly answering a code sent to its own address. A locked
   * account is released for that same reason: the mailbox has answered.
   */
  updatePassword(id: string, password: string): Promise<EmployeeDto> {
    return prisma.employee.update({
      where: { id },
      data: { password, emailVerified: new Date(), ...UNLOCKED },
      select: employeeSelect,
    });
  },

  /** Counts one failed sign-in, returning the streak it now stands at. */
  async registerFailedLogin(id: string): Promise<number> {
    const { failedLoginAttempts } = await prisma.employee.update({
      where: { id },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });

    return failedLoginAttempts;
  },

  lockAccount(id: string): Promise<EmployeeDto> {
    return prisma.employee.update({
      where: { id },
      data: { lockedAt: new Date() },
      select: employeeSelect,
    });
  },

  /** Forgets the failed streak — for a password that turned out to be right. */
  clearFailedLogins(id: string): Promise<EmployeeDto> {
    return prisma.employee.update({ where: { id }, data: UNLOCKED, select: employeeSelect });
  },

  delete(id: string): Promise<EmployeeDto> {
    return prisma.employee.delete({ where: { id }, select: employeeSelect });
  },

  async list(filters: EmployeeListFilters): Promise<{ items: EmployeeDto[]; total: number }> {
    const where = buildEmployeeWhere(filters);

    const [items, total] = await prisma.$transaction([
      prisma.employee.findMany({
        where,
        select: employeeSelect,
        orderBy: { [filters.sortBy]: filters.sortDir },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      prisma.employee.count({ where }),
    ]);

    return { items, total };
  },

  /**
   * Headcount grouped by role and status, for the roles the caller asks for.
   *
   * Grouped by both so a single query answers "how many people are there" and
   * "how many of them are administrators" — the overview needs the split, and
   * administrators pass through statuses employees never do, so collapsing to
   * status alone would hide anyone awaiting approval.
   */
  countByRoleAndStatus(
    roles: Role[],
  ): Promise<Array<{ role: Role; status: EmployeeStatus; count: number }>> {
    return prisma.employee
      .groupBy({ by: ["role", "status"], where: { role: { in: roles } }, _count: { _all: true } })
      .then((rows) => rows.map((row) => ({ role: row.role, status: row.status, count: row._count._all })));
  },

  countEmployees(where?: Prisma.EmployeeWhereInput): Promise<number> {
    return prisma.employee.count({ where: { role: Role.EMPLOYEE, ...where } });
  },

  /** Distinct department values currently in use, for filter dropdowns. */
  async distinctDepartments(role: Role = Role.EMPLOYEE): Promise<string[]> {
    const rows = await prisma.employee.findMany({
      where: { department: { not: null }, role },
      select: { department: true },
      distinct: ["department"],
      orderBy: { department: "asc" },
    });

    return rows.map((row) => row.department).filter((value): value is string => Boolean(value));
  },

  searchBasic(term: string, limit: number): Promise<EmployeeDto[]> {
    return prisma.employee.findMany({
      where: {
        role: Role.EMPLOYEE,
        OR: [
          { name: { contains: term, mode: "insensitive" } },
          { email: { contains: term, mode: "insensitive" } },
          { department: { contains: term, mode: "insensitive" } },
          { position: { contains: term, mode: "insensitive" } },
        ],
      },
      select: employeeSelect,
      take: limit,
      orderBy: { name: "asc" },
    });
  },
};

function buildEmployeeWhere(filters: EmployeeListFilters): Prisma.EmployeeWhereInput {
  const where: Prisma.EmployeeWhereInput = { role: filters.role ?? Role.EMPLOYEE };

  if (filters.status) where.status = filters.status;
  if (filters.department) where.department = filters.department;

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { email: { contains: filters.search, mode: "insensitive" } },
      { department: { contains: filters.search, mode: "insensitive" } },
      { position: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return where;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

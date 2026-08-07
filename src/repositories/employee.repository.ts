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
  phone: true,
  department: true,
  position: true,
  profilePhoto: true,
  joiningDate: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.EmployeeSelect;

export type EmployeeDto = Prisma.EmployeeGetPayload<{ select: typeof employeeSelect }>;

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

  create(data: {
    name: string;
    email: string;
    password: string;
    role?: Role;
    status?: EmployeeStatus;
    /** Set from the invite key's job role, when it carried one. */
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

  markEmailVerified(id: string): Promise<EmployeeDto> {
    return prisma.employee.update({
      where: { id },
      data: { emailVerified: new Date() },
      select: employeeSelect,
    });
  },

  /**
   * Stores a new password hash. `emailVerified` is set alongside it because
   * completing a reset proves control of the mailbox — the same proof the
   * verification flow asks for — so an unverified account is not left locked
   * out after correctly answering a code sent to its own address.
   */
  updatePassword(id: string, password: string): Promise<EmployeeDto> {
    return prisma.employee.update({
      where: { id },
      data: { password, emailVerified: new Date() },
      select: employeeSelect,
    });
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

  countByStatus(): Promise<Array<{ status: EmployeeStatus; _count: number }>> {
    return prisma.employee
      .groupBy({ by: ["status"], where: { role: Role.EMPLOYEE }, _count: { _all: true } })
      .then((rows) => rows.map((row) => ({ status: row.status, _count: row._count._all })));
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

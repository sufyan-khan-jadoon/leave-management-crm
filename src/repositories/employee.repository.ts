import { type Employee, type EmployeeStatus, type Prisma, Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/** Columns safe to return to a client — never includes `password`. */
export const employeeSelect = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  role: true,
  status: true,
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

  findByEmail(email: string): Promise<EmployeeDto | null> {
    return prisma.employee.findUnique({
      where: { email: normalizeEmail(email) },
      select: employeeSelect,
    });
  },

  create(data: { name: string; email: string; password: string; role?: Role }): Promise<EmployeeDto> {
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
  async distinctDepartments(): Promise<string[]> {
    const rows = await prisma.employee.findMany({
      where: { department: { not: null }, role: Role.EMPLOYEE },
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

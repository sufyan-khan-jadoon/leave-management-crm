import { LeaveStatus, PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Admin123@";
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? "System Administrator";
const SEED_DEMO = process.env.SEED_DEMO_DATA !== "false";

const DEMO_EMPLOYEES = [
  { name: "Ayesha Khan", email: "ayesha@example.com", department: "Engineering", position: "Frontend Engineer" },
  { name: "Bilal Ahmed", email: "bilal@example.com", department: "Engineering", position: "Backend Engineer" },
  { name: "Fatima Noor", email: "fatima@example.com", department: "Design", position: "Product Designer" },
  { name: "Hamza Raza", email: "hamza@example.com", department: "Quality Assurance", position: "QA Analyst" },
  { name: "Zainab Ali", email: "zainab@example.com", department: "Human Resources", position: "HR Associate" },
  { name: "Usman Tariq", email: "usman@example.com", department: "Sales", position: "Account Executive" },
];

const DEMO_REASONS = [
  "Doctor's appointment",
  "University exams",
  "Family wedding",
  "Personal errand",
  "Recovering from flu",
  "Relocating to a new apartment",
  "Attending a conference",
];

function utcDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

async function seedAdmin(): Promise<void> {
  const password = await bcrypt.hash(ADMIN_PASSWORD, 12);

  const admin = await prisma.employee.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: Role.SUPER_ADMIN, emailVerified: new Date() },
    create: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password,
      role: Role.SUPER_ADMIN,
      emailVerified: new Date(),
      department: "Human Resources",
      position: "System Administrator",
      phone: "+923145868205",
      joiningDate: utcDay(2024, 0, 1),
    },
  });

  console.log(`  Super admin ready: ${admin.email}`);
}

async function seedDemoEmployees(): Promise<void> {
  const password = await bcrypt.hash("Employee123@", 12);
  const now = new Date();

  for (const [index, demo] of DEMO_EMPLOYEES.entries()) {
    const employee = await prisma.employee.upsert({
      where: { email: demo.email },
      update: {},
      create: {
        ...demo,
        password,
        emailVerified: new Date(),
        phone: `+9230012345${String(index).padStart(2, "0")}`,
        joiningDate: utcDay(2024, index % 12, 1 + index),
      },
    });

    const existing = await prisma.leave.count({ where: { employeeId: employee.id } });
    if (existing > 0) continue;

    // Spread history across the last three months so charts have shape.
    const leaves = Array.from({ length: 3 + (index % 4) }, (_, i) => {
      const monthOffset = i % 3;
      const date = utcDay(now.getUTCFullYear(), now.getUTCMonth() - monthOffset, 3 + ((i * 5) % 24));
      const statuses = [LeaveStatus.APPROVED, LeaveStatus.APPROVED, LeaveStatus.PENDING, LeaveStatus.REJECTED];

      return {
        employeeId: employee.id,
        leaveDate: date,
        reason: DEMO_REASONS[(index + i) % DEMO_REASONS.length]!,
        status: statuses[(index + i) % statuses.length]!,
      };
    });

    await prisma.leave.createMany({ data: leaves, skipDuplicates: true });
  }

  console.log(`  Demo data ready: ${DEMO_EMPLOYEES.length} employees (password: Employee123@)`);
}

async function main(): Promise<void> {
  console.log("Seeding database...");
  await seedAdmin();

  if (SEED_DEMO) {
    await seedDemoEmployees();
  }

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

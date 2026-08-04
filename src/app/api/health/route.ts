import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { emailService } from "@/services/email/email.service";

export const dynamic = "force-dynamic";

/**
 * Liveness probe for deployments.
 *
 * Reports database reachability. Pass `?smtp=1` to additionally verify the mail
 * transport — kept opt-in so routine probes don't open an SMTP connection every
 * time they run.
 */
export async function GET(request: Request) {
  const checkSmtp = new URL(request.url).searchParams.get("smtp") === "1";

  const [database, smtp] = await Promise.all([
    prisma
      .$queryRaw`SELECT 1`.then(() => true)
      .catch((error: unknown) => {
        console.error("[health] Database check failed:", error);
        return false;
      }),
    checkSmtp ? emailService.verifyConnection() : Promise.resolve(null),
  ]);

  const healthy = database && smtp !== false;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      database: database ? "up" : "down",
      ...(smtp === null ? {} : { smtp: smtp ? "up" : "down" }),
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}

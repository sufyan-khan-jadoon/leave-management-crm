/**
 * Applies pending migrations during a Vercel **production** build, and nowhere
 * else.
 *
 * This exists because the build and the schema it expects have to arrive
 * together. Code that selects a column shipped ahead of the migration that adds
 * it does not fail at deploy time — it fails later, on whichever screen touches
 * that table first, which is how a green deploy comes to mean nothing.
 *
 * Written in Node rather than as a shell test in package.json on purpose. The
 * obvious `[ "$VERCEL_ENV" = production ] && ...` is POSIX, and npm runs scripts
 * through cmd.exe on Windows, so it would break `npm run build` for anybody
 * developing here while working perfectly in CI — the worst division of labour
 * available. `process.env` reads the same on both.
 *
 * The environment check is the whole safety argument. Vercel runs this build
 * command for preview deployments too, against whatever DATABASE_URL that
 * environment carries — which for most projects is the production database. An
 * unguarded `prisma migrate deploy` here would let a half-finished branch apply
 * its migrations to live data simply by being pushed.
 *
 * A failure deliberately fails the build. Deploying anyway is the outcome this
 * script exists to prevent, so a migration that cannot be applied has to stop
 * the release rather than be reported and stepped over.
 */
import { execFileSync } from "node:child_process";

const environment = process.env.VERCEL_ENV;

if (environment !== "production") {
  console.log(
    `[migrate] VERCEL_ENV=${environment ?? "(unset)"} — not a production build, skipping migrations.`,
  );
  process.exit(0);
}

console.log("[migrate] Production build — applying pending migrations.");

// `shell: true` so this resolves npx the same way on any runner. stdio is
// inherited so Prisma's own account of what it applied lands in the build log,
// which is the only record of when a migration ran.
execFileSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit", shell: true });

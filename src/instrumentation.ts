/**
 * Runs once when the Next.js server starts (before it accepts requests):
 * applies database migrations so a fresh deploy is always schema-consistent.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.DATABASE_URL) {
    console.warn("[startup] DATABASE_URL is not set, skipping migrations");
    return;
  }
  const { runMigrations } = await import("./db/migrate");
  await runMigrations();
  console.log("[startup] migrations applied");
  const { seedDemoUsers } = await import("./lib/server/demo-users");
  await seedDemoUsers();
  console.log("[startup] demo users ready");
}

import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./index";

/** Applies pending SQL migrations from /drizzle. Idempotent; runs on every server start. */
export async function runMigrations(): Promise<void> {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  await migrate(db, { migrationsFolder });
}

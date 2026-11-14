import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { db, schema } from "@/db";

/**
 * No passwords, no sign-up: a signed cookie carries the user id. The jury logs in through demo buttons;
 * anyone else gets an anonymous user on their first session.
 */
const COOKIE = "hl_uid";
const MAX_AGE = 60 * 60 * 24 * 30;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET is missing or too short");
  return s;
}

const mac = (v: string) => createHmac("sha256", secret()).update(v).digest("base64url");

function sign(userId: string): string {
  return `${userId}.${mac(userId)}`;
}

function verify(token: string | undefined): string | null {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i < 0) return null;
  const id = token.slice(0, i);
  const a = Buffer.from(token.slice(i + 1));
  const b = Buffer.from(mac(id));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export async function setUserCookie(userId: string): Promise<void> {
  (await cookies()).set(COOKIE, sign(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export type AppUser = typeof schema.users.$inferSelect;

export async function currentUser(): Promise<AppUser | null> {
  const id = verify((await cookies()).get(COOKIE)?.value);
  if (!id) return null;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return u ?? null;
}

/** Current user, or a fresh anonymous one (cookie set). */
export async function ensureUser(): Promise<AppUser> {
  const u = await currentUser();
  if (u) return u;
  const [created] = await db.insert(schema.users).values({ displayName: "You" }).returning();
  await setUserCookie(created.id);
  return created;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

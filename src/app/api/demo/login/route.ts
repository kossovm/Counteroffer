import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { setUserCookie } from "@/lib/server/auth";
import { DEMO_USERS } from "@/lib/server/demo-users";
import { handle, readJson } from "@/lib/server/http";
import { ApiError } from "@/lib/server/sessions";

/** One-click login as a demo person. No password: these accounts hold only fictional data. */
export async function POST(req: Request) {
  return handle(async () => {
    const { key } = z.object({ key: z.string() }).parse(await readJson(req));
    const demo = DEMO_USERS.find((d) => d.key === key);
    if (!demo) throw new ApiError(404, "unknown_demo_user");
    const [u] = await db.select().from(schema.users).where(eq(schema.users.demoKey, key));
    if (!u) throw new ApiError(503, "demo_not_seeded");
    await setUserCookie(u.id);
    return { user: { id: u.id, name: u.displayName, demoKey: key }, quiz: demo.quiz, blurb: demo.blurb };
  });
}

/** The list of demo people for the start screen. */
export async function GET() {
  return Response.json({ users: DEMO_USERS.map(({ key, name, blurb, quiz }) => ({ key, name, blurb, kind: quiz.kind })) });
}

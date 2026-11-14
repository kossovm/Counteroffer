import { z } from "zod";
import { clientIp, ensureUser } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { createSession, quizSchema } from "@/lib/server/sessions";

const body = z.union([z.object({ quiz: quizSchema }).strict(), z.object({ replayOf: z.string().uuid() }).strict()]);

/** Start a conversation from quiz answers, or replay an earlier one with the same hidden setup. */
export async function POST(req: Request) {
  return handle(async () => {
    const input = body.parse(await readJson(req));
    const user = await ensureUser();
    return createSession(user.id, await clientIp(), input);
  });
}

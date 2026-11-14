import { currentUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { ApiError, finishSession } from "@/lib/server/sessions";

/** Ends the conversation (if still open) and returns the debrief, including the hidden limit. */
export async function POST(_req: Request, ctx: RouteContext<"/api/sessions/[id]/debrief">) {
  return handle(async () => {
    const u = await currentUser();
    if (!u) throw new ApiError(401, "no_user");
    const { id } = await ctx.params;
    return { debrief: await finishSession(id, u.id) };
  });
}

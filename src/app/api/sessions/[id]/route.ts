import { currentUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { ApiError, getSession } from "@/lib/server/sessions";

export async function GET(_req: Request, ctx: RouteContext<"/api/sessions/[id]">) {
  return handle(async () => {
    const u = await currentUser();
    if (!u) throw new ApiError(401, "no_user");
    const { id } = await ctx.params;
    return getSession(id, u.id);
  });
}

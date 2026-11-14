import { z } from "zod";
import { currentUser } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { ApiError, deliverySchema, MAX_MESSAGE_CHARS, playTurn } from "@/lib/server/sessions";

const body = z
  .object({ text: z.string().max(MAX_MESSAGE_CHARS * 2), delivery: deliverySchema.optional() })
  .strict();

/** One user message in, the counterpart's reply and the new public state out. */
export async function POST(req: Request, ctx: RouteContext<"/api/sessions/[id]/turns">) {
  return handle(async () => {
    const u = await currentUser();
    if (!u) throw new ApiError(401, "no_user");
    const { id } = await ctx.params;
    const { text, delivery } = body.parse(await readJson(req));
    return playTurn(id, u.id, text, delivery);
  });
}

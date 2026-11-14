import { currentUser } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { listSessions } from "@/lib/server/sessions";

export async function GET() {
  return handle(async () => {
    const u = await currentUser();
    if (!u) return { user: null, sessions: [] };
    return { user: { id: u.id, name: u.displayName, demoKey: u.demoKey }, sessions: await listSessions(u.id) };
  });
}

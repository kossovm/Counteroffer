import { demoSession } from "@/engine/demo";

/** "See an example debrief": a scripted conversation run through the real engine, no login needed. */
export async function GET() {
  const d = demoSession();
  return Response.json({
    title: d.config.title,
    persona: d.config.persona,
    opening: d.opening,
    turns: d.turns.map((t) => ({
      turn: t.turn,
      userText: t.userText,
      counterpartText: t.counterpartText,
      derived: t.derived,
      offerAfter: t.offerAfter,
      meterDelta: t.meterDelta,
      delivery: t.delivery,
    })),
    debrief: d.debrief,
  });
}

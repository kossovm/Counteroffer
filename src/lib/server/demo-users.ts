import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { buildDebrief, buildScenario, openSession, step, type QuizAnswers, type TurnRecord } from "@/engine";
import { DEMO_QUIZ, demoSession } from "@/engine/demo";
import { FALLBACK_LINES } from "@/llm/notes";

/** Fictional demo people the jury can log in as. Each has a real conversation ahead. */
export const DEMO_USERS: { key: string; name: string; blurb: string; quiz: QuizAnswers }[] = [
  {
    key: "sam",
    name: "Sam Rivera",
    blurb: "Backend engineer. Raise conversation in 9 days.",
    quiz: { ...DEMO_QUIZ, conversationDate: "2026-11-23" },
  },
  {
    key: "priya",
    name: "Priya Nair",
    blurb: "Data scientist. Offer call with the recruiter tomorrow.",
    quiz: {
      kind: "offer",
      current: 145_000,
      target: 165_000,
      marketLow: 150_000,
      marketHigh: 175_000,
      archetype: "next_quarter",
      conversationDate: "2026-11-15",
    },
  },
  {
    key: "alex",
    name: "Alex Chen",
    blurb: "Product designer. Lease renewal, rent going up $200.",
    quiz: {
      kind: "rent",
      current: 2_200,
      target: 2_200,
      marketLow: 2_100,
      marketHigh: 2_350,
      announced: 2_400,
      archetype: "hardliner",
      conversationDate: "2026-12-01",
    },
  },
];

/**
 * Creates the demo users once, and gives Sam one finished conversation so the debrief can be
 * opened in one click. The finished conversation is played through the real engine.
 */
export async function seedDemoUsers(): Promise<void> {
  for (const d of DEMO_USERS) {
    const [existing] = await db.select().from(schema.users).where(eq(schema.users.demoKey, d.key));
    if (existing) continue;
    const [u] = await db
      .insert(schema.users)
      .values({ displayName: d.name, isDemo: true, demoKey: d.key })
      .returning();

    if (d.key !== "sam") continue;
    const demo = demoSession();
    const debrief = buildDebrief(demo.config, finalState(demo.turns, demo.config), demo.turns);
    const withLines = {
      ...debrief,
      rows: debrief.rows.map((r) =>
        r.mistakes.length > 0 ? { ...r, betterLine: FALLBACK_LINES[r.mistakes[0]] } : r,
      ),
    };
    const [s] = await db
      .insert(schema.sessions)
      .values({
        userId: u.id,
        kind: "raise",
        seed: demo.config.id,
        quiz: d.quiz,
        config: demo.config,
        state: finalState(demo.turns, demo.config),
        openingText: demo.opening,
        status: withLines.outcome,
        debrief: withLines,
        clientIp: "seed",
      })
      .returning({ id: schema.sessions.id });
    for (const t of demo.turns) {
      await db.insert(schema.turns).values({
        sessionId: s.id,
        turn: t.turn,
        record: t,
        classifiedBy: "script",
        voicedBy: "template",
      });
    }
  }
}

function finalState(turns: TurnRecord[], config: ReturnType<typeof buildScenario>) {
  let { state } = openSession(config);
  for (const t of turns) state = step(config, state, t.move).state;
  return state;
}


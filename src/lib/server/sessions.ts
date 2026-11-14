import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { TEMPLATES } from "@/content/scenarios";
import { db, schema } from "@/db";
import {
  ARCHETYPES,
  buildDebrief,
  buildScenario,
  openSession,
  publicView,
  step,
  type CoreState,
  type Debrief,
  type PublicSessionView,
  type QuizAnswers,
  type ScenarioConfig,
  type TurnDelivery,
  type TurnRecord,
} from "@/engine";
import { voice } from "@/llm/actor";
import { classify } from "@/llm/classifier";
import { detectFillers } from "@/llm/heuristics";
import { addBetterLines } from "@/llm/notes";

export const MAX_SESSIONS_PER_IP_PER_DAY = Number(process.env.MAX_SESSIONS_PER_IP_PER_DAY ?? 25);
export const MAX_MESSAGE_CHARS = 600;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

const money = z.number().int().positive().max(10_000_000);
export const quizSchema = z
  .object({
    kind: z.enum(["raise", "offer", "rent", "bill"]),
    current: money,
    target: money,
    marketLow: money,
    marketHigh: money,
    announced: money.optional(),
    archetype: z.enum(Object.keys(ARCHETYPES) as [keyof typeof ARCHETYPES, ...(keyof typeof ARCHETYPES)[]]),
    conversationDate: z.string().max(40).optional(),
    fear: z.string().max(300).optional(),
  })
  .strict();

export const deliverySchema = z
  .object({
    wpm: z.number().min(0).max(600).optional(),
    wpmVsBaseline: z.number().min(-5).max(5).optional(),
    pauseBeforeNumberMs: z.number().int().min(0).max(120_000).optional(),
    fillers: z.array(z.string().max(20)).max(100).optional(),
  })
  .strict();

/** Turn as the client sees it during the session: no engine events (they reveal the hidden limit). */
export interface PublicTurn {
  turn: number;
  userText: string;
  counterpartText: string;
  derived: TurnRecord["derived"];
  actionKind: TurnRecord["action"]["kind"];
  offerAfter: number;
  meterDelta: TurnRecord["meterDelta"];
  delivery?: TurnDelivery;
}

const toPublic = (r: TurnRecord): PublicTurn => ({
  turn: r.turn,
  userText: r.userText,
  counterpartText: r.counterpartText,
  derived: r.derived,
  actionKind: r.action.kind,
  offerAfter: r.offerAfter,
  meterDelta: r.meterDelta,
  delivery: r.delivery,
});

type SessionRow = typeof schema.sessions.$inferSelect;

async function loadOwned(id: string, userId: string): Promise<SessionRow> {
  if (!z.string().uuid().safeParse(id).success) throw new ApiError(404, "not_found");
  const [row] = await db
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.id, id), eq(schema.sessions.userId, userId)));
  if (!row) throw new ApiError(404, "not_found");
  return row;
}

async function loadTurns(sessionId: string): Promise<TurnRecord[]> {
  const rows = await db
    .select({ record: schema.turns.record })
    .from(schema.turns)
    .where(eq(schema.turns.sessionId, sessionId))
    .orderBy(asc(schema.turns.turn));
  return rows.map((r) => r.record as TurnRecord);
}

export async function createSession(
  userId: string,
  ip: string,
  input: { quiz: QuizAnswers } | { replayOf: string },
): Promise<{ id: string; view: PublicSessionView; opening: string }> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.sessions)
    .where(and(eq(schema.sessions.clientIp, ip), gte(schema.sessions.createdAt, since)));
  if (n >= MAX_SESSIONS_PER_IP_PER_DAY) throw new ApiError(429, "too_many_sessions");

  let quiz: QuizAnswers;
  let seed: string;
  let replayOf: string | null = null;
  if ("replayOf" in input) {
    const orig = await loadOwned(input.replayOf, userId);
    quiz = orig.quiz as QuizAnswers;
    seed = orig.seed; // same seed -> same hidden limit, same counterpart
    replayOf = orig.id;
  } else {
    quiz = input.quiz;
    seed = randomUUID();
  }

  const config = buildScenario(quiz, TEMPLATES[quiz.kind], seed);
  const opened = openSession(config);
  const opening = await voice(config, opened.state, opened.action, []);

  const [row] = await db
    .insert(schema.sessions)
    .values({
      userId,
      kind: quiz.kind,
      seed,
      quiz,
      config,
      state: opened.state,
      openingText: opening.text,
      status: opened.state.status,
      replayOf,
      clientIp: ip,
    })
    .returning({ id: schema.sessions.id });

  return { id: row.id, view: publicView(config, opened.state), opening: opening.text };
}

export async function getSession(id: string, userId: string) {
  const row = await loadOwned(id, userId);
  const config = row.config as ScenarioConfig;
  const turns = await loadTurns(id);
  return {
    id: row.id,
    kind: row.kind,
    title: config.title,
    replayOf: row.replayOf,
    view: publicView(config, row.state as CoreState),
    opening: row.openingText,
    turns: turns.map(toPublic),
    debrief: (row.debrief as Debrief | null) ?? null,
  };
}

export async function playTurn(
  id: string,
  userId: string,
  text: string,
  clientDelivery?: z.infer<typeof deliverySchema>,
): Promise<{ view: PublicSessionView; turn: PublicTurn; ended: boolean }> {
  const t0 = Date.now();
  const clean = text.trim().slice(0, MAX_MESSAGE_CHARS);
  const row = await loadOwned(id, userId);
  if (row.debrief) throw new ApiError(409, "session_finished");
  const config = row.config as ScenarioConfig;
  const state = row.state as CoreState;
  if (state.status === "deal" || state.status === "walked_away") throw new ApiError(409, "session_finished");

  const history = await loadTurns(id);
  const lastLine = history.at(-1)?.counterpartText ?? row.openingText;
  const transcript = [
    { role: "counterpart" as const, text: row.openingText },
    ...history.flatMap((h) => [
      { role: "user" as const, text: h.userText },
      { role: "counterpart" as const, text: h.counterpartText },
    ]),
  ];

  const { move, by: classifiedBy } = await classify(clean, config, {
    offer: state.offer,
    userAsk: state.userAsk,
    lastCounterpartLine: lastLine,
  });
  const result = step(config, state, move);
  const spoken = await voice(config, result.state, result.action, [...transcript, { role: "user", text: clean }]);

  const delivery: TurnDelivery = { hedges: move.hedges, ...clientDelivery };
  if (clientDelivery && !clientDelivery.fillers) delivery.fillers = detectFillers(clean); // voice turn
  const record: TurnRecord = {
    turn: result.state.turn,
    userText: clean,
    move,
    derived: result.derived,
    action: result.action,
    events: result.events,
    meterDelta: result.meterDelta,
    offerBefore: state.offer,
    offerAfter: result.state.offer,
    counterpartText: spoken.text,
    delivery,
  };

  await db.transaction(async (tx) => {
    // Optimistic lock: the turn we computed from must still be the stored one.
    const updated = await tx
      .update(schema.sessions)
      .set({ state: result.state, status: result.state.status, updatedAt: new Date() })
      .where(and(eq(schema.sessions.id, id), sql`(${schema.sessions.state}->>'turn')::int = ${state.turn}`))
      .returning({ id: schema.sessions.id });
    if (updated.length === 0) throw new ApiError(409, "concurrent_turn");
    await tx.insert(schema.turns).values({
      sessionId: id,
      turn: record.turn,
      record,
      classifiedBy,
      voicedBy: spoken.by,
      latencyMs: Date.now() - t0,
    });
  });

  const ended = result.state.status === "deal" || result.state.status === "walked_away";
  return { view: publicView(config, result.state), turn: toPublic(record), ended };
}

/** Ends the session (if still open) and returns the debrief. Computed once, then cached. */
export async function finishSession(id: string, userId: string): Promise<Debrief> {
  const row = await loadOwned(id, userId);
  if (row.debrief) return row.debrief as Debrief;
  const config = row.config as ScenarioConfig;
  const turns = await loadTurns(id);
  const base = buildDebrief(config, row.state as CoreState, turns);
  const debrief = await addBetterLines(config, base);
  await db
    .update(schema.sessions)
    .set({ debrief, status: debrief.outcome, updatedAt: new Date() })
    .where(eq(schema.sessions.id, id));
  return debrief;
}

export async function listSessions(userId: string) {
  const rows = await db
    .select({
      id: schema.sessions.id,
      kind: schema.sessions.kind,
      status: schema.sessions.status,
      replayOf: schema.sessions.replayOf,
      createdAt: schema.sessions.createdAt,
      debrief: schema.sessions.debrief,
    })
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, userId))
    .orderBy(desc(schema.sessions.createdAt))
    .limit(50);
  return rows.map(({ debrief, ...r }) => {
    const d = debrief as Debrief | null;
    return { ...r, leftOnTable: d?.leftOnTable ?? null, gained: d?.gained ?? null, finalAmount: d?.finalAmount ?? null };
  });
}

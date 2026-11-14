import { z } from "zod";
import type { Debrief, MistakeCode, ScenarioConfig } from "@/engine/types";
import { usd } from "@/engine/money";
import { callJson, MODELS } from "./client";
import { parseAmounts } from "./heuristics";

/** Static coaching line per mistake, used when the LLM is unavailable. */
export const FALLBACK_LINES: Record<MistakeCode, string> = {
  no_number: "Name your number first, with one reason attached.",
  anchored_below_limit: "Open higher than you expect to land, at the top of your range, and say why.",
  number_without_reason: "Attach one concrete reason to every number you say.",
  conceded_without_reason: "Do not lower your own number unless you get something back for it.",
  accepted_first_offer: "Thank them, then ask what flexibility exists before you say yes.",
  settled_early: "Before you say yes, ask once more: is this the best you can do on base?",
  ignored_objection: "Answer the objection in front of you before repeating your number.",
  ultimatum_without_trust: "Build trust with reasons first. A threat without it ends the talk.",
  walked_into_walkaway: "When patience drops, slow down and ask a question instead of pushing.",
};

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["lines"],
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["turn", "betterLine"],
        properties: { turn: { type: "integer" }, betterLine: { type: "string" } },
      },
    },
  },
} as const;
const parsed = z.object({ lines: z.array(z.object({ turn: z.number().int(), betterLine: z.string() })) });

/**
 * Adds a "better line" to every costly turn. Code picks the turns and the mistakes; the model only
 * rephrases. Numbers in a better line must come from the user's own inputs or the debrief.
 */
export async function addBetterLines(config: ScenarioConfig, debrief: Debrief): Promise<Debrief> {
  const costly = debrief.rows.filter((r) => r.mistakes.length > 0 || r.askDrop > 0 || r.moneyEffect < 0);
  if (costly.length === 0) return debrief;

  const allowed = [config.userTarget, config.marketLow, config.marketHigh, debrief.limit, debrief.userFirstAsk]
    .filter((x): x is number => typeof x === "number");
  const fallbackFor = (codes: MistakeCode[]) =>
    codes.length > 0 ? FALLBACK_LINES[codes[0]] : FALLBACK_LINES.conceded_without_reason;

  let byTurn = new Map<number, string>();
  try {
    const raw = await callJson({
      purpose: "debrief",
      model: MODELS.deep,
      system: `You coach people on money conversations. For each turn, write the one line they should have said instead: first person, spoken, under 25 words, specific to their situation. No praise, no exclamation marks. Only use these dollar amounts if you need a number: ${allowed.map(usd).join(", ")}.`,
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            situation: config.title,
            counterpart: `${config.persona.name}, ${config.persona.role}`,
            userRange: `${usd(config.marketLow)}–${usd(config.marketHigh)}`,
            turns: costly.map((r) => ({
              turn: r.turn,
              theySaid: r.userText,
              counterpartReplied: r.counterpartText,
              mistakes: r.mistakes,
            })),
          }),
        },
      ],
      maxTokens: 900,
      schema,
    });
    const p = parsed.safeParse(raw);
    if (p.success) {
      byTurn = new Map(
        p.data.lines
          .filter((l) => parseAmounts(l.betterLine).every((n) => allowed.some((a) => Math.abs(a - n) < 1)))
          .map((l) => [l.turn, l.betterLine.trim()]),
      );
    }
  } catch {
    // fall through to static lines
  }

  return {
    ...debrief,
    rows: debrief.rows.map((r) =>
      costly.includes(r) ? { ...r, betterLine: byTurn.get(r.turn) ?? fallbackFor(r.mistakes) } : r,
    ),
  };
}

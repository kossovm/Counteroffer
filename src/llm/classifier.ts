import { z } from "zod";
import { MOVE_TYPES, REASON_TAGS, type Move, type ScenarioConfig } from "@/engine/types";
import { usd } from "@/engine/money";
import { callJson, MODELS } from "./client";
import { detectHedges, heuristicClassify, parseAmounts } from "./heuristics";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "amount", "reasons"],
  properties: {
    type: { type: "string", enum: [...MOVE_TYPES] },
    amount: { type: ["number", "null"], description: "The number the user is asking for in this message, whole USD, or null" },
    reasons: { type: "array", items: { type: "string", enum: [...REASON_TAGS] } },
  },
} as const;

const parsed = z.object({
  type: z.enum(MOVE_TYPES),
  amount: z.number().nullable(),
  reasons: z.array(z.enum(REASON_TAGS)),
});

const SYSTEM = `You label one message from a person negotiating money. Output JSON only.

type (choose one):
- state_number: names the number they want now (including agreeing to a specific number).
- justify: gives reasons or evidence without naming a new number.
- ask_question: asks the other side about budget, constraints, process or what is possible.
- hold: pushes back without a new number ("that doesn't work for me"), or deliberately says very little.
- ultimatum: says they will leave, take another offer, move out or cancel if this is not met.
- accept: accepts the other side's current offer.
- offtopic: anything else.

amount: the number they are asking for in this message, in whole US dollars ("118k" = 118000). If they mention their current pay or the other side's number only as context, that is not the amount. null if none.

reasons (zero or more): market_data (market range, comparable pay or rents), performance (results they delivered),
scope (new or bigger responsibilities), competing_offer (another offer or cheaper option exists),
replacement_cost (cost or time to replace them or re-let the unit), loyalty (tenure, on-time payment, reliability),
commitment (longer lease, multi-year stay, prepayment), timing (flexible dates, budget cycle).
Only include a reason if the message actually makes that argument.`;

export interface Classified {
  move: Move;
  by: "llm" | "heuristic";
}

/**
 * Message → Move. The LLM labels; code checks the label: the amount must literally appear in the text,
 * and hedges are always counted by code. Any failure falls back to the deterministic classifier.
 */
export async function classify(
  text: string,
  config: ScenarioConfig,
  context: { offer: number; userAsk: number | null; lastCounterpartLine: string },
): Promise<Classified> {
  const hedges = detectHedges(text);
  const amounts = parseAmounts(text);
  const fallback = (): Classified => ({ move: heuristicClassify(text, config.direction), by: "heuristic" });
  if (!text.trim()) return { move: { type: "hold", amount: null, reasons: [], hedges }, by: "heuristic" };

  const user = [
    `Situation: ${config.title}. The person wants a ${config.direction === "up" ? "higher" : "lower"} number (${config.period === "year" ? "per year" : "per month"}).`,
    `Other side's current offer: ${usd(context.offer)}.`,
    context.userAsk !== null ? `Person's previous ask: ${usd(context.userAsk)}.` : "The person has not named a number yet.",
    `Other side just said: "${context.lastCounterpartLine}"`,
    `Message to label: """${text}"""`,
  ].join("\n");

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callJson({
        purpose: "classify",
        model: MODELS.fast,
        system: SYSTEM,
        messages: [{ role: "user", content: user }],
        maxTokens: 200,
        schema,
      });
      const p = parsed.safeParse(raw);
      if (!p.success) continue;
      let { type, amount } = p.data;

      // The amount must be a number that is actually in the message.
      if (amount !== null && !amounts.some((a) => Math.abs(a - amount!) < 1)) {
        amount = amounts.length > 0 ? (config.direction === "up" ? Math.max(...amounts) : Math.min(...amounts)) : null;
      }
      if (type === "state_number" && amount === null) type = amounts.length > 0 ? type : "hold";
      if (type === "state_number" && amount === null && amounts.length > 0) amount = amounts.at(-1)!;
      return { move: { type, amount: type === "state_number" || type === "ultimatum" ? amount : null, reasons: [...new Set(p.data.reasons)], hedges }, by: "llm" };
    } catch {
      break; // budget, key or network problem: no point retrying
    }
  }
  return fallback();
}

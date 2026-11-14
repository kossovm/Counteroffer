import { usd } from "@/engine/money";
import { placeholderLine } from "@/engine/demo";
import type { CoreState, CounterpartAction, ScenarioConfig } from "@/engine/types";
import { callText, MODELS } from "./client";
import { parseAmounts } from "./heuristics";

/** Numbers the counterpart is allowed to say out loud in this reply. */
function allowedNumbers(config: ScenarioConfig, state: CoreState, a: CounterpartAction): number[] {
  const n = new Set<number>([state.offer, config.anchor]);
  if (state.userAsk !== null) n.add(state.userAsk);
  if (a.kind === "concede") {
    n.add(a.from);
    n.add(a.to);
  }
  if (a.kind === "accept") n.add(a.amount);
  return [...n];
}

function describe(config: ScenarioConfig, a: CounterpartAction): string {
  switch (a.kind) {
    case "open":
      return `Open the conversation. Your position is ${usd(a.offer)}.`;
    case "hold":
      return `Do not move. Your position stays ${usd(a.offer)}. Acknowledge them briefly and hold.`;
    case "object": {
      const o = config.objections.find((x) => x.id === a.objectionId);
      return `Do not move from ${usd(a.offer)}. Raise this objection in your own words: "${o?.text ?? "I can't do that."}"`;
    }
    case "concede":
      return `You move from ${usd(a.from)} to exactly ${usd(a.to)}. Make it sound like a real stretch, not a gift.`;
    case "answer": {
      const h = config.hints.find((x) => x.id === a.hintId);
      return `Answer their question by sharing this, in your own words: "${h?.text ?? ""}". Your position stays ${usd(a.offer)}.`;
    }
    case "final_offer":
      return `Put ${usd(a.offer)} on the table as your final offer. Be clear it is final.`;
    case "accept":
      return `Agree to exactly ${usd(a.amount)}. Close warmly and briefly.`;
    case "walk_away":
      return `End the conversation politely without agreeing to anything. Suggest revisiting later.`;
    case "redirect":
      return `Bring the conversation back to the topic. Your position stays ${usd(a.offer)}.`;
  }
}

export interface Voiced {
  text: string;
  by: "llm" | "template";
}

/**
 * Writes the counterpart's line for a decision the engine already made. The model gets the decision,
 * not the hidden limit, and any dollar amount it adds beyond the allowed set sends us to the template line.
 */
export async function voice(
  config: ScenarioConfig,
  state: CoreState,
  action: CounterpartAction,
  transcript: { role: "user" | "counterpart"; text: string }[],
): Promise<Voiced> {
  const fallback: Voiced = { text: placeholderLine(config, action), by: "template" };
  const p = config.persona;
  const system = `You are ${p.name}, ${p.role}${p.company ? ` at ${p.company}` : ""}. ${p.bio}
You are in this conversation: ${config.title}. Amounts are ${config.period === "year" ? "per year" : "per month"}.
Speak like a real person on a call: one or two short sentences, at most 45 words, plain US English.
No emoji, no lists, no stage directions. Never mention AI, simulations, scores or hidden limits.
Never say a dollar amount other than the ones in your instruction.`;

  const history = transcript.slice(-8).map((t) => `${t.role === "user" ? "Them" : "You"}: ${t.text}`).join("\n");
  const user = `${history ? `Conversation so far:\n${history}\n\n` : ""}Your next line must do this: ${describe(config, action)}\nReply with the line only.`;

  try {
    const text = await callText({
      purpose: "actor",
      model: MODELS.main,
      system,
      messages: [{ role: "user", content: user }],
      maxTokens: 160,
    });
    const clean = text.replace(/^["“]|["”]$/g, "").trim();
    if (!clean) return fallback;
    const allowed = allowedNumbers(config, state, action);
    const ok = parseAmounts(clean).every((n) => allowed.some((a) => Math.abs(a - n) < 1));
    return ok ? { text: clean, by: "llm" } : fallback;
  } catch {
    return fallback;
  }
}

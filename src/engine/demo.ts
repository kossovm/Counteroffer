import { TEMPLATES } from "@/content/scenarios";
import { openSession, publicView, step } from "./core";
import { buildDebrief } from "./debrief";
import { buildScenario } from "./scenario";
import type { CounterpartAction, Debrief, Move, PublicSessionView, QuizAnswers, ScenarioConfig, TurnRecord } from "./types";

/**
 * A scripted raise conversation run through the real engine. Used for UI work before the API exists
 * and for the "see an example debrief" button. Every number comes out of the engine, nothing is typed in.
 */
export const DEMO_QUIZ: QuizAnswers = {
  kind: "raise",
  current: 100_000,
  target: 118_000,
  marketLow: 105_000,
  marketHigh: 120_000,
  archetype: "budget_frozen",
};

const SCRIPT: { text: string; move: Move }[] = [
  {
    text: "Thanks for making time. I'd like to talk about my compensation. I was thinking maybe $108,000?",
    move: { type: "state_number", amount: 108_000, reasons: [], hedges: ["maybe", "I was thinking"] },
  },
  {
    text: "I understand. What would it take to get an exception approved?",
    move: { type: "ask_question", amount: null, reasons: [], hedges: [] },
  },
  {
    text: "This year I shipped the billing migration two months early and cut on-call pages by 40%. That's the case I'd bring.",
    move: { type: "justify", amount: null, reasons: ["performance"], hedges: [] },
  },
  {
    text: "Sorry, I just don't want to make this hard. Would $105,000 work?",
    move: { type: "state_number", amount: 105_000, reasons: [], hedges: ["sorry", "just"] },
  },
];

/** Placeholder counterpart lines until the actor LLM is wired in. Template text only, numbers from the engine. */
export function placeholderLine(config: ScenarioConfig, a: CounterpartAction): string {
  const money = (n: number) => "$" + n.toLocaleString("en-US");
  switch (a.kind) {
    case "open":
      return `I can do ${money(a.offer)}, that's the standard merit increase this cycle.`;
    case "hold":
      return `I hear you. Right now I'm still at ${money(a.offer)}.`;
    case "object":
      return config.objections.find((o) => o.id === a.objectionId)?.text ?? "I can't move on that.";
    case "concede":
      return `Let me see what I can do. I can get to ${money(a.to)}.`;
    case "answer":
      return config.hints.find((h) => h.id === a.hintId)?.text ?? "Good question.";
    case "final_offer":
      return `${money(a.offer)} is the best I can do. That's final.`;
    case "accept":
      return `Okay. ${money(a.amount)} it is. I'll put it through.`;
    case "walk_away":
      return "I think we should pick this up next cycle.";
    case "redirect":
      return "Let's stay on the compensation question.";
  }
}

export interface DemoSession {
  config: ScenarioConfig;
  opening: string;
  turns: TurnRecord[];
  views: PublicSessionView[];
  debrief: Debrief;
}

export function demoSession(): DemoSession {
  const config = buildScenario(DEMO_QUIZ, TEMPLATES.raise, "demo-raise-1");
  const opened = openSession(config);
  let state = opened.state;
  const turns: TurnRecord[] = [];
  const views: PublicSessionView[] = [publicView(config, state)];

  for (const { text, move } of SCRIPT) {
    if (state.status === "deal" || state.status === "walked_away") break;
    const before = state.offer;
    const r = step(config, state, move);
    turns.push({
      turn: r.state.turn,
      userText: text,
      move,
      derived: r.derived,
      action: r.action,
      events: r.events,
      meterDelta: r.meterDelta,
      offerBefore: before,
      offerAfter: r.state.offer,
      counterpartText: placeholderLine(config, r.action),
      delivery: { hedges: move.hedges },
    });
    state = r.state;
    views.push(publicView(config, state));
  }

  return {
    config,
    opening: placeholderLine(config, opened.action),
    turns,
    views,
    debrief: buildDebrief(config, state, turns),
  };
}

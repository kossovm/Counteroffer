import { roundTo, usd } from "./money";
import { seededBetween } from "./rng";
import type {
  Direction,
  HintDef,
  ObjectionDef,
  Persona,
  QuizAnswers,
  QuizEstimate,
  ScenarioConfig,
  ScenarioKind,
} from "./types";

/** Content for one scenario kind + archetype: what the counterpart says, not the numbers. */
export interface ScenarioTemplate {
  kind: Exclude<ScenarioKind, "custom">;
  title: string;
  persona: Persona;
  objections: ObjectionDef[];
  hints: HintDef[];
}

const KIND_META: Record<ScenarioTemplate["kind"], { direction: Direction; period: "year" | "month"; rounding: number }> = {
  raise: { direction: "up", period: "year", rounding: 500 },
  offer: { direction: "up", period: "year", rounding: 1000 },
  rent: { direction: "down", period: "month", rounding: 25 },
  bill: { direction: "down", period: "month", rounding: 5 },
};

/** Standard merit increase a manager opens with (share of current salary). */
export const DEFAULT_MERIT_RAISE = 0.03;
export const MAX_TURNS = 12;

/**
 * Turns the user's quiz answers into a full scenario. The hidden limit is drawn from the user's own
 * range with a seeded position, so the same seed always rebuilds the same scenario (replay).
 */
export function buildScenario(quiz: QuizAnswers, template: ScenarioTemplate, seed: string): ScenarioConfig {
  const meta = KIND_META[quiz.kind];
  const r = meta.rounding;
  const low = Math.min(quiz.marketLow, quiz.marketHigh);
  const high = Math.max(quiz.marketLow, quiz.marketHigh);

  let anchor: number;
  let limit: number;
  let limitExplanation: string;

  switch (quiz.kind) {
    case "raise": {
      anchor = roundTo(quiz.current * (1 + DEFAULT_MERIT_RAISE), r);
      const f = seededBetween(seed, 0.45, 0.85);
      limit = roundTo(low + (high - low) * f, r);
      limit = Math.max(limit, anchor + 4 * r);
      limitExplanation = `Set ${Math.round(f * 100)}% of the way through the market range you entered (${usd(low)}–${usd(high)}). The opening is a ${Math.round(DEFAULT_MERIT_RAISE * 100)}% merit raise on ${usd(quiz.current)}. This is a scenario setting, not a prediction of what your manager will pay.`;
      break;
    }
    case "offer": {
      anchor = roundTo(quiz.current, r);
      const base = Math.max(anchor, low);
      const f = seededBetween(seed, 0.4, 0.8);
      limit = roundTo(base + (Math.max(high, base) - base) * f, r);
      limit = Math.max(limit, anchor + 4 * r);
      limitExplanation = `Set ${Math.round(f * 100)}% of the way from the offer (or the bottom of your range) to the top of your range (${usd(high)}). A scenario setting, not a prediction.`;
      break;
    }
    case "rent":
    case "bill": {
      const announced = quiz.announced ?? quiz.current;
      anchor = roundTo(announced, r);
      const g = seededBetween(seed, 0.2, 0.55);
      if (anchor > quiz.current) {
        // The landlord raised the price: the floor sits part of the way back toward the current price.
        limit = roundTo(anchor - (anchor - quiz.current) * g, r);
        limitExplanation = `Set ${Math.round(g * 100)}% of the way back from the announced ${usd(anchor)} to your current ${usd(quiz.current)}. A scenario setting, not a prediction.`;
      } else {
        // No increase announced: the floor is a discount off the current price, bounded by your range.
        limit = roundTo(Math.max(low > 0 ? low : 0, anchor * (1 - g * 0.3)), r);
        limitExplanation = `Set ${Math.round(g * 30)}% below the current price, not below the bottom of your range. A scenario setting, not a prediction.`;
      }
      limit = Math.min(limit, anchor - 2 * r);
      break;
    }
  }

  return {
    id: seed,
    kind: quiz.kind,
    direction: meta.direction,
    title: template.title,
    currency: "USD",
    period: meta.period,
    anchor,
    limit,
    userCurrent: quiz.current,
    userTarget: quiz.target,
    marketLow: low,
    marketHigh: high,
    rounding: r,
    objections: template.objections,
    hints: template.hints,
    persona: { ...template.persona, archetype: quiz.archetype },
    maxTurns: MAX_TURNS,
    limitExplanation,
  };
}

/** "Against your range you could be leaving $X a year", computed from the user's own numbers only. */
export function quizEstimate(quiz: QuizAnswers): QuizEstimate {
  const low = Math.min(quiz.marketLow, quiz.marketHigh);
  const high = Math.max(quiz.marketLow, quiz.marketHigh);
  const mid = Math.round((low + high) / 2);
  switch (quiz.kind) {
    case "raise":
    case "offer": {
      const gap = Math.max(0, mid - quiz.current);
      return {
        atStakePerYear: gap,
        formula: `(${usd(mid)} middle of your range − ${usd(quiz.current)} ${quiz.kind === "raise" ? "today" : "offered"}) × 1 year`,
      };
    }
    case "rent":
    case "bill": {
      const announced = quiz.announced ?? quiz.current;
      const gap = Math.max(0, announced - quiz.current);
      return {
        atStakePerYear: gap * 12,
        formula: `(${usd(announced)} announced − ${usd(quiz.current)} now) × 12 months`,
      };
    }
  }
}

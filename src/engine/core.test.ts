import { describe, expect, it } from "vitest";
import { RAISE, RENT } from "@/content/scenarios";
import { ARCHETYPES } from "./archetypes";
import { EngineError, MAX_PRODUCTIVE_HOLDS, openSession, publicView, step } from "./core";
import { mulberry32 } from "./rng";
import type { CoreState, Move, MoveType, ReasonTag, ScenarioConfig } from "./types";
import { MOVE_TYPES, REASON_TAGS } from "./types";

const mv = (type: MoveType, amount: number | null = null, reasons: ReasonTag[] = []): Move => ({
  type,
  amount,
  reasons,
  hedges: [],
});

/** Raise scenario with fixed numbers so every expectation is readable. */
function raiseConfig(over: Partial<ScenarioConfig> = {}): ScenarioConfig {
  return {
    id: "t",
    kind: "raise",
    direction: "up",
    title: "t",
    currency: "USD",
    period: "year",
    anchor: 103_000,
    limit: 112_000,
    userCurrent: 100_000,
    userTarget: 118_000,
    marketLow: 105_000,
    marketHigh: 120_000,
    rounding: 500,
    objections: RAISE.objections,
    hints: RAISE.hints,
    persona: { ...RAISE.persona, archetype: "budget_frozen" },
    maxTurns: 12,
    limitExplanation: "test",
    ...over,
  };
}

function rentConfig(): ScenarioConfig {
  return {
    ...raiseConfig(),
    kind: "rent",
    direction: "down",
    period: "month",
    anchor: 2400,
    limit: 2250,
    userCurrent: 2200,
    userTarget: 2200,
    marketLow: 2100,
    marketHigh: 2350,
    rounding: 25,
    objections: RENT.objections,
    hints: RENT.hints,
    persona: { ...RENT.persona, archetype: "hardliner" },
  };
}

function run(config: ScenarioConfig, moves: Move[]) {
  let { state } = openSession(config);
  const results = [];
  for (const m of moves) {
    const r = step(config, state, m);
    results.push(r);
    state = r.state;
    if (state.status === "deal" || state.status === "walked_away") break;
  }
  return { state, results };
}

describe("openSession", () => {
  it("opens at the anchor with archetype meters", () => {
    const c = raiseConfig();
    const { state, action } = openSession(c);
    expect(action).toEqual({ kind: "open", offer: 103_000 });
    expect(state.offer).toBe(103_000);
    expect(state.patience).toBe(ARCHETYPES.budget_frozen.patience0);
    expect(state.trust).toBe(ARCHETYPES.budget_frozen.trust0);
  });
});

describe("state_number", () => {
  it("a number with no reason meets the first objection and costs patience", () => {
    const c = raiseConfig();
    const { results } = run(c, [mv("state_number", 115_000)]);
    const r = results[0];
    expect(r.action).toEqual({ kind: "object", offer: 103_000, objectionId: "budget_frozen" });
    expect(r.events).toContainEqual({ type: "number_without_reason", amount: 115_000 });
    expect(r.meterDelta.patience).toBeLessThan(0);
    expect(r.state.userFirstAsk).toBe(115_000);
  });

  it("a number with a reason that clears an objection makes the counterpart move, not past the limit", () => {
    const c = raiseConfig({ objections: [RAISE.objections[0]] });
    const { results } = run(c, [mv("state_number", 115_000, ["performance"])]);
    const r = results[0];
    expect(r.action.kind).toBe("concede");
    if (r.action.kind !== "concede") return;
    expect(r.action.from).toBe(103_000);
    expect(r.action.to).toBeGreaterThan(103_000);
    expect(r.action.to).toBeLessThanOrEqual(112_000);
    expect(r.action.to % 500).toBe(0);
    expect(r.events).toContainEqual({ type: "objection_cleared", objectionId: "budget_frozen", by: ["performance"] });
    expect(r.meterDelta.trust).toBeGreaterThan(0);
  });

  it("flags a first ask that is already below the hidden limit", () => {
    const { results } = run(raiseConfig(), [mv("state_number", 108_000, ["performance"])]);
    expect(results[0].events).toContainEqual({ type: "anchored_below_limit", amount: 108_000, limit: 112_000 });
  });

  it("asking for no more than the current offer closes the deal at the user's number", () => {
    const { state, results } = run(raiseConfig(), [mv("state_number", 103_000)]);
    expect(state.status).toBe("deal");
    expect(state.finalAmount).toBe(103_000);
    expect(results[0].events).toContainEqual({ type: "accepted_below_limit", amount: 103_000, limit: 112_000 });
  });

  it("lowering your own number is a concession, detected by the engine", () => {
    const { results } = run(raiseConfig(), [mv("state_number", 118_000), mv("state_number", 110_000)]);
    expect(results[1].derived).toBe("concede");
    expect(results[1].events).toContainEqual({ type: "user_conceded", from: 118_000, to: 110_000 });
  });

  it("a number far above the limit is out of range and hurts both meters", () => {
    const { results } = run(raiseConfig(), [mv("state_number", 140_000, ["market_data"])]);
    const r = results[0];
    expect(r.action).toEqual({ kind: "hold", offer: 103_000 });
    expect(r.events).toContainEqual({ type: "out_of_range", amount: 140_000 });
    expect(r.meterDelta.patience).toBe(-8);
    expect(r.meterDelta.trust).toBe(-4);
  });

  it("repeating a number while an objection stands is recorded as ignoring it", () => {
    const { results } = run(raiseConfig(), [mv("state_number", 115_000), mv("state_number", 115_000)]);
    expect(results[1].events).toContainEqual({ type: "objection_ignored", objectionId: "budget_frozen" });
  });
});

describe("other moves", () => {
  it("questions reveal hints in order, then nothing", () => {
    const c = raiseConfig();
    const moves = [...c.hints.map(() => mv("ask_question")), mv("ask_question")];
    const { results } = run(c, moves);
    c.hints.forEach((h, i) => expect(results[i].action).toEqual({ kind: "answer", offer: 103_000, hintId: h.id }));
    expect(results[c.hints.length].action.kind).toBe("hold");
  });

  it("holding firm earns a half concession at most twice", () => {
    const c = raiseConfig({ objections: [] });
    const moves = [mv("state_number", 112_000, ["performance"]), ...Array(MAX_PRODUCTIVE_HOLDS + 1).fill(mv("hold"))];
    const { results } = run(c, moves);
    const holdResults = results.slice(1);
    const worked = holdResults.filter((r) => r.events.some((e) => e.type === "hold_worked"));
    expect(worked.length).toBeLessThanOrEqual(MAX_PRODUCTIVE_HOLDS);
    const last = holdResults[holdResults.length - 1];
    if (last.state.status === "open") expect(last.events.some((e) => e.type === "hold_worked")).toBe(false);
  });

  it("an ultimatum without trust backfires into a final offer; anything but yes ends the talk", () => {
    const c = raiseConfig();
    const { results, state } = run(c, [mv("ultimatum"), mv("state_number", 110_000)]);
    expect(results[0].events).toContainEqual({ type: "ultimatum_backfired" });
    expect(results[0].action.kind).toBe("final_offer");
    expect(results[0].state.status).toBe("closing");
    expect(state.status).toBe("walked_away");
  });

  it("accepting a final offer closes the deal at that offer", () => {
    const { state } = run(raiseConfig(), [mv("ultimatum"), mv("accept")]);
    expect(state.status).toBe("deal");
    expect(state.finalAmount).toBe(103_000);
  });

  it("running out of patience ends the conversation", () => {
    const { state, results } = run(raiseConfig(), Array(30).fill(mv("offtopic")));
    expect(state.status).toBe("walked_away");
    expect(results[results.length - 1].action.kind).toBe("walk_away");
  });

  it("hits a final offer at the turn cap", () => {
    const c = raiseConfig({ maxTurns: 3 });
    const { results } = run(c, [mv("ask_question"), mv("ask_question"), mv("ask_question")]);
    expect(results[2].action.kind).toBe("final_offer");
  });

  it("refuses to move after the session is closed", () => {
    const c = raiseConfig();
    const { state } = run(c, [mv("accept")]);
    expect(() => step(c, state, mv("hold"))).toThrow(EngineError);
  });

  it("rejects invalid amounts", () => {
    const c = raiseConfig();
    const { state } = openSession(c);
    expect(() => step(c, state, mv("state_number", -5))).toThrow(EngineError);
  });
});

describe("direction down (rent)", () => {
  it("concessions lower the price and stop at the hidden floor", () => {
    const c = rentConfig();
    const { results, state } = run(c, [
      mv("ask_question"),
      mv("state_number", 2200, ["replacement_cost", "market_data", "commitment"]),
      mv("justify", null, ["loyalty", "timing"]),
      mv("hold"),
      mv("hold"),
    ]);
    for (const r of results) {
      expect(r.state.offer).toBeLessThanOrEqual(2400);
      expect(r.state.offer).toBeGreaterThanOrEqual(2250);
    }
    expect(state.offer).toBeLessThan(2400);
  });
});

describe("invariants under random play", () => {
  const configs = [raiseConfig(), rentConfig()];
  for (const c of configs) {
    it(`never crosses the hidden limit and never moves against the user (${c.direction})`, () => {
      for (let seed = 1; seed <= 300; seed++) {
        const rand = mulberry32(seed);
        let { state } = openSession(c);
        let prev: CoreState = state;
        for (let i = 0; i < 20 && (state.status === "open" || state.status === "closing"); i++) {
          const type = MOVE_TYPES[Math.floor(rand() * MOVE_TYPES.length)];
          const span = Math.abs(c.limit - c.anchor) * 2;
          const amount = type === "state_number" ? Math.round(c.anchor + (rand() - 0.3) * span * (c.direction === "up" ? 1 : -1)) : null;
          const reasons = REASON_TAGS.filter(() => rand() < 0.25);
          const r = step(c, state, mv(type, amount !== null && amount > 0 ? amount : 1, reasons));
          state = r.state;
          if (c.direction === "up") {
            expect(state.offer).toBeLessThanOrEqual(c.limit);
            expect(state.offer).toBeGreaterThanOrEqual(prev.offer);
          } else {
            expect(state.offer).toBeGreaterThanOrEqual(c.limit);
            expect(state.offer).toBeLessThanOrEqual(prev.offer);
          }
          expect(state.patience).toBeGreaterThanOrEqual(0);
          expect(state.trust).toBeLessThanOrEqual(100);
          prev = state;
        }
      }
    });
  }

  it("is deterministic", () => {
    const c = raiseConfig();
    const moves = [mv("ask_question"), mv("state_number", 116_000, ["performance"]), mv("hold"), mv("justify", null, ["market_data"])];
    expect(run(c, moves)).toEqual(run(c, moves));
  });
});

describe("publicView", () => {
  it("never exposes the hidden limit or the voice id", () => {
    const c = raiseConfig();
    const view = publicView(c, openSession(c).state);
    const json = JSON.stringify(view);
    expect(json).not.toContain(String(c.limit));
    expect(json).not.toContain("limit");
    expect(view.persona).not.toHaveProperty("voiceId");
  });
});

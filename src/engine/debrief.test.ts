import { describe, expect, it } from "vitest";
import { RAISE, TEMPLATES } from "@/content/scenarios";
import { openSession, step } from "./core";
import { buildDebrief } from "./debrief";
import { buildScenario, quizEstimate } from "./scenario";
import type { CoreState, Move, MoveType, QuizAnswers, ReasonTag, ScenarioConfig, TurnRecord } from "./types";

const mv = (type: MoveType, amount: number | null = null, reasons: ReasonTag[] = []): Move => ({
  type,
  amount,
  reasons,
  hedges: [],
});

const config: ScenarioConfig = {
  id: "d",
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
  objections: [RAISE.objections[0]],
  hints: RAISE.hints,
  persona: { ...RAISE.persona, archetype: "budget_frozen" },
  maxTurns: 12,
  limitExplanation: "test",
};

function play(moves: Move[]): { final: CoreState; history: TurnRecord[] } {
  let { state } = openSession(config);
  const history: TurnRecord[] = [];
  for (const m of moves) {
    const before = state.offer;
    const r = step(config, state, m);
    history.push({
      turn: r.state.turn,
      userText: "",
      move: m,
      derived: r.derived,
      action: r.action,
      events: r.events,
      meterDelta: r.meterDelta,
      offerBefore: before,
      offerAfter: r.state.offer,
      counterpartText: "",
    });
    state = r.state;
    if (state.status === "deal" || state.status === "walked_away") break;
  }
  return { final: state, history };
}

describe("buildDebrief", () => {
  it("computes gained and left on the table from the hidden limit", () => {
    const { final, history } = play([mv("state_number", 118_000, ["performance"]), mv("state_number", 106_000)]);
    const d = buildDebrief(config, final, history);
    expect(d.outcome).toBe("deal");
    expect(d.finalAmount).toBe(106_000);
    expect(d.gained).toBe(3_000);
    expect(d.leftOnTable).toBe(6_000);
  });

  it("charges the user's own concession to the turn, capped at the limit", () => {
    const { final, history } = play([mv("state_number", 118_000, ["performance"]), mv("state_number", 106_000)]);
    const d = buildDebrief(config, final, history);
    const row = d.rows[1];
    expect(row.derived).toBe("concede");
    // gave up 118k -> 106k, but only 112k was reachable: 6,000 of own ask given away
    expect(row.askDrop).toBe(6_000);
    expect(row.moneyEffect).toBe(0); // the table stayed at 106k
    expect(row.mistakes).toContain("conceded_without_reason");
    expect(d.costliestTurn).toBe(2);
  });

  it("settling below what is already on the table shows as a negative turn, and rows sum to gained", () => {
    // counterpart moves to 106k, then the user asks for 105k and gets exactly that
    const { final, history } = play([mv("state_number", 118_000, ["performance"]), mv("state_number", 105_000)]);
    const d = buildDebrief(config, final, history);
    expect(d.finalAmount).toBe(105_000);
    expect(d.rows[1].moneyEffect).toBe(-1_000);
    expect(d.rows[1].offerAfter).toBe(105_000);
    expect(d.rows.reduce((a, r) => a + r.moneyEffect, 0)).toBe(d.gained);
  });

  it("an immediate yes is flagged and leaves the whole gap", () => {
    const { final, history } = play([mv("accept")]);
    const d = buildDebrief(config, final, history);
    expect(d.rows[0].mistakes).toContain("accepted_first_offer");
    expect(d.leftOnTable).toBe(9_000);
    expect(d.gained).toBe(0);
  });

  it("no deal leaves the distance from the opening offer, and flags never naming a number", () => {
    const { final, history } = play(Array(30).fill(mv("offtopic")));
    const d = buildDebrief(config, final, history);
    expect(d.outcome).toBe("walked_away");
    expect(d.leftOnTable).toBe(9_000);
    expect(d.mistakeCounts.no_number).toBe(1);
  });

  it("lists objections never cleared and hints never asked for", () => {
    const { final, history } = play([mv("state_number", 115_000)]);
    const d = buildDebrief(config, final, history);
    expect(d.openObjections).toEqual(["budget_frozen"]);
    expect(d.missedHints).toEqual(RAISE.hints.map((h) => h.id));
  });
});

describe("buildScenario and quizEstimate", () => {
  const quiz: QuizAnswers = {
    kind: "raise",
    current: 100_000,
    target: 118_000,
    marketLow: 105_000,
    marketHigh: 120_000,
    archetype: "next_quarter",
  };

  it("is reproducible from the seed and keeps the limit inside the user's range", () => {
    const a = buildScenario(quiz, TEMPLATES.raise, "seed-1");
    const b = buildScenario(quiz, TEMPLATES.raise, "seed-1");
    expect(a).toEqual(b);
    expect(a.anchor).toBe(103_000);
    expect(a.limit).toBeGreaterThanOrEqual(105_000);
    expect(a.limit).toBeLessThanOrEqual(120_000);
    expect(a.limit % 500).toBe(0);
    expect(a.persona.archetype).toBe("next_quarter");
  });

  it("puts the rent floor between the current and the announced price", () => {
    const rent = buildScenario(
      { kind: "rent", current: 2200, target: 2200, marketLow: 2100, marketHigh: 2350, announced: 2400, archetype: "hardliner" },
      TEMPLATES.rent,
      "seed-2",
    );
    expect(rent.direction).toBe("down");
    expect(rent.anchor).toBe(2400);
    expect(rent.limit).toBeGreaterThan(2200);
    expect(rent.limit).toBeLessThan(2400);
  });

  it("estimates what is at stake from the user's own numbers", () => {
    expect(quizEstimate(quiz)).toEqual({
      atStakePerYear: 12_500,
      formula: "($112,500 middle of your range − $100,000 today) × 1 year",
    });
  });
});

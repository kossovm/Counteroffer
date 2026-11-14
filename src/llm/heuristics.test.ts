import { describe, expect, it } from "vitest";
import { detectFillers, detectHedges, heuristicClassify, parseAmounts } from "./heuristics";

describe("parseAmounts", () => {
  it.each([
    ["I'm asking for $118,000", [118_000]],
    ["something like 118k", [118_000]],
    ["$2,250 a month", [2250]],
    ["I make $100k and I'm asking $118K", [100_000, 118_000]],
    ["a 3% raise in 2026 for 2 years", []],
    ["1.5k more", [1500]],
    ["120 thousand", [120_000]],
  ])("%s", (text, expected) => {
    expect(parseAmounts(text)).toEqual(expected);
  });
});

describe("hedges and fillers", () => {
  it("counts hedges, not substrings", () => {
    expect(detectHedges("Sorry, I just think maybe we could adjust it")).toEqual(["maybe", "just", "sorry"]);
    expect(detectHedges("I adjusted the justification")).toEqual([]);
  });
  it("finds fillers", () => {
    expect(detectFillers("um, so, uh, I was um thinking")).toEqual(["um", "um", "uh"]);
  });
});

describe("heuristicClassify", () => {
  it("picks the ask, not the current salary", () => {
    const m = heuristicClassify("I make $100k now. Given the market band I'm asking $118k.", "up");
    expect(m).toMatchObject({ type: "state_number", amount: 118_000 });
    expect(m.reasons).toContain("market_data");
  });
  it("picks the lowest number for rent", () => {
    expect(heuristicClassify("You want $2,400, I can do $2,250.", "down")).toMatchObject({ amount: 2250 });
  });
  it("recognises an ultimatum", () => {
    expect(heuristicClassify("I have another offer, so I'll have to leave.", "up").type).toBe("ultimatum");
  });
  it("recognises a question", () => {
    expect(heuristicClassify("What would it take to get an exception?", "up").type).toBe("ask_question");
  });
  it("recognises reasons without a number", () => {
    expect(heuristicClassify("I led the migration and cut on-call pages by 40%.", "up")).toMatchObject({
      type: "justify",
      reasons: ["performance"],
    });
  });
  it("recognises acceptance", () => {
    expect(heuristicClassify("Okay, deal.", "up").type).toBe("accept");
  });
});

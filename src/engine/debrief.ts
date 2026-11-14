import { favour, worst } from "./money";
import type { CoreState, Debrief, DebriefRow, MistakeCode, ScenarioConfig, TurnRecord } from "./types";

/**
 * Money side of the debrief, computed from the turn history only.
 * The LLM later adds `betterLine` text to costly rows; it never touches a number here.
 */
export function buildDebrief(config: ScenarioConfig, final: CoreState, history: TurnRecord[]): Debrief {
  const d = config.direction;
  const limit = config.limit;
  const outcome: Debrief["outcome"] =
    final.status === "deal" ? "deal" : final.status === "walked_away" ? "walked_away" : "no_deal";

  const rows: DebriefRow[] = history.map((t) => {
    const mistakes: MistakeCode[] = [];
    const dealAt = t.events.find((e) => e.type === "deal");
    const after = dealAt && dealAt.type === "deal" ? dealAt.amount : t.offerAfter;
    const moneyEffect = favour(d, after, t.offerBefore);
    let askDrop = 0;

    for (const e of t.events) {
      switch (e.type) {
        case "anchored_below_limit":
          mistakes.push("anchored_below_limit");
          break;
        case "number_without_reason":
          mistakes.push("number_without_reason");
          break;
        case "objection_ignored":
          mistakes.push("ignored_objection");
          break;
        case "ultimatum_backfired":
          mistakes.push("ultimatum_without_trust");
          break;
        case "walked_away":
          mistakes.push("walked_into_walkaway");
          break;
        case "user_conceded": {
          // Only money up to the hidden limit was ever reachable, so cap both sides at it.
          askDrop += Math.max(0, favour(d, worst(d, e.from, limit), worst(d, e.to, limit)));
          if (t.move.reasons.length === 0) mistakes.push("conceded_without_reason");
          break;
        }
      }
    }
    if (t.derived === "accept" && t.turn === 1) mistakes.push("accepted_first_offer");
    else if (t.events.some((e) => e.type === "accepted_below_limit")) mistakes.push("settled_early");

    return {
      turn: t.turn,
      derived: t.derived,
      userText: t.userText,
      counterpartText: t.counterpartText,
      offerBefore: t.offerBefore,
      offerAfter: after,
      moneyEffect,
      askDrop,
      meterDelta: t.meterDelta,
      mistakes,
      events: t.events,
      delivery: t.delivery,
    };
  });

  if (final.userFirstAsk === null && rows.length > 0) rows[rows.length - 1].mistakes.push("no_number");

  const finalAmount = outcome === "deal" ? final.finalAmount : null;
  const reference = finalAmount ?? config.anchor;
  const gained = finalAmount === null ? 0 : Math.max(0, favour(d, finalAmount, config.anchor));
  const leftOnTable = Math.max(0, favour(d, limit, reference));

  // Costliest turn: the biggest self-inflicted loss (own concession or settling below the table).
  let costliestTurn: number | null = null;
  let worstLoss = 0;
  for (const r of rows) {
    const loss = r.askDrop + Math.max(0, -r.moneyEffect);
    if (loss > worstLoss) {
      worstLoss = loss;
      costliestTurn = r.turn;
    }
  }
  if (costliestTurn === null && outcome === "deal" && leftOnTable > 0 && rows.length > 0) {
    costliestTurn = rows[rows.length - 1].turn; // the turn that closed below the limit
  }

  const mistakeCounts: Debrief["mistakeCounts"] = {};
  for (const r of rows) for (const m of r.mistakes) mistakeCounts[m] = (mistakeCounts[m] ?? 0) + 1;

  return {
    outcome,
    direction: d,
    period: config.period,
    anchor: config.anchor,
    limit,
    limitExplanation: config.limitExplanation,
    finalAmount,
    userFirstAsk: final.userFirstAsk,
    gained,
    leftOnTable,
    costliestTurn,
    rows,
    mistakeCounts,
    openObjections: config.objections.filter((o) => !final.clearedObjections.includes(o.id)).map((o) => o.id),
    missedHints: config.hints.filter((h) => !final.revealedHints.includes(h.id)).map((h) => h.id),
  };
}

import { ARCHETYPES } from "./archetypes";
import { atLeast, better, clamp, favour, stepToward } from "./money";
import type {
  CoreState,
  CounterpartAction,
  DerivedMove,
  EngineEvent,
  Move,
  PublicSessionView,
  ReasonTag,
  ScenarioConfig,
  StepResult,
} from "./types";

export class EngineError extends Error {
  constructor(public code: "session_closed" | "invalid_move") {
    super(code);
  }
}

/** How far beyond the hidden limit a number counts as out of range (share of the limit). */
export const OUT_OF_RANGE_SHARE = 0.12;
/** Number of times plain pushback ("that doesn't work for me") can earn a concession. */
export const MAX_PRODUCTIVE_HOLDS = 2;

export function openSession(config: ScenarioConfig): { state: CoreState; action: CounterpartAction } {
  const a = ARCHETYPES[config.persona.archetype];
  const state: CoreState = {
    turn: 0,
    status: "open",
    offer: config.anchor,
    userAsk: null,
    userFirstAsk: null,
    patience: a.patience0,
    trust: a.trust0,
    clearedObjections: [],
    activeObjection: null,
    revealedHints: [],
    holdsUsed: 0,
    finalAmount: null,
  };
  return { state, action: { kind: "open", offer: config.anchor } };
}

/**
 * The whole negotiation logic: one user move in, one counterpart action out.
 * Pure and deterministic: same config + state + move always gives the same result.
 */
export function step(config: ScenarioConfig, prev: CoreState, move: Move): StepResult {
  if (prev.status === "deal" || prev.status === "walked_away") throw new EngineError("session_closed");
  if (move.amount !== null && (!Number.isFinite(move.amount) || move.amount <= 0)) {
    throw new EngineError("invalid_move");
  }

  const d = config.direction;
  const limit = config.limit;
  const arch = ARCHETYPES[config.persona.archetype];
  const cost = (x: number) => Math.round(x * arch.patienceCost);

  const s: CoreState = {
    ...prev,
    clearedObjections: [...prev.clearedObjections],
    revealedHints: [...prev.revealedHints],
    turn: prev.turn + 1,
  };
  const events: EngineEvent[] = [];
  let dP = 0;
  let dT = 0;
  let derived: DerivedMove = move.type;
  let action: CounterpartAction;

  const openObjections = () => config.objections.filter((o) => !s.clearedObjections.includes(o.id));

  const clearBy = (reasons: ReasonTag[]): string[] => {
    const cleared: string[] = [];
    for (const o of openObjections()) {
      const by = o.clearedBy.filter((t) => reasons.includes(t));
      if (by.length > 0) {
        cleared.push(o.id);
        s.clearedObjections.push(o.id);
        events.push({ type: "objection_cleared", objectionId: o.id, by });
      }
    }
    if (s.activeObjection && cleared.includes(s.activeObjection)) s.activeObjection = null;
    return cleared;
  };

  const closeDeal = (amount: number): CounterpartAction => {
    s.status = "deal";
    s.finalAmount = amount;
    if (better(d, limit, amount)) events.push({ type: "accepted_below_limit", amount, limit });
    events.push({ type: "deal", amount });
    return { kind: "accept", amount };
  };

  const finalOffer = (): CounterpartAction => {
    s.status = "closing";
    return { kind: "final_offer", offer: s.offer };
  };

  /** Counterpart moves toward `target` by `fraction` of the remaining room to the hidden limit. */
  const concedeToward = (target: number, fraction: number, kind: "concede" | "hold"): CounterpartAction => {
    const from = s.offer;
    const to = stepToward(d, from, target, limit, fraction, config.rounding);
    if (to === from) return finalOffer(); // nothing left to give
    s.offer = to;
    if (kind === "hold") events.push({ type: "hold_worked", from, to });
    events.push({ type: "counterpart_conceded", from, to });
    if (to === target) return closeDeal(to);
    return { kind: "concede", from, to };
  };

  // ---- closing: the counterpart has put a final offer on the table -------------------------
  if (prev.status === "closing") {
    if (move.type === "accept") {
      action = closeDeal(s.offer);
    } else if (move.type === "state_number" && move.amount !== null && atLeast(d, s.offer, move.amount)) {
      action = closeDeal(move.amount);
    } else {
      s.status = "walked_away";
      events.push({ type: "walked_away" });
      dP = -s.patience;
      action = { kind: "walk_away", offer: s.offer };
    }
    return finish();
  }

  // ---- open ------------------------------------------------------------------------------------
  switch (move.type) {
    case "accept": {
      action = closeDeal(s.offer);
      break;
    }

    case "state_number": {
      if (move.amount === null) {
        dP -= cost(3);
        action = s.activeObjection
          ? { kind: "object", offer: s.offer, objectionId: s.activeObjection }
          : { kind: "hold", offer: s.offer };
        break;
      }
      const amt = move.amount;

      if (s.userFirstAsk === null) {
        s.userFirstAsk = amt;
        events.push({ type: "anchored", amount: amt });
        if (better(d, limit, amt)) events.push({ type: "anchored_below_limit", amount: amt, limit });
      }
      if (s.userAsk !== null && better(d, s.userAsk, amt)) {
        derived = "concede";
        events.push({ type: "user_conceded", from: s.userAsk, to: amt });
        dP += 2; // the counterpart likes it
      }
      s.userAsk = amt;

      // The user asked for no more than is already offered: the counterpart takes it.
      if (atLeast(d, s.offer, amt)) {
        action = closeDeal(amt);
        break;
      }

      if (favour(d, amt, limit) > Math.abs(limit) * OUT_OF_RANGE_SHARE) {
        events.push({ type: "out_of_range", amount: amt });
        dP -= cost(8);
        dT -= 4;
        action = { kind: "hold", offer: s.offer };
        break;
      }

      const cleared = clearBy(move.reasons);
      if (move.reasons.length > 0) dT += 3 + 2 * cleared.length;
      else {
        events.push({ type: "number_without_reason", amount: amt });
        dP -= cost(4);
      }

      const standing = openObjections();
      if (standing.length > 0 && cleared.length === 0) {
        if (s.activeObjection) {
          events.push({ type: "objection_ignored", objectionId: s.activeObjection });
          dP -= cost(3);
        }
        s.activeObjection = s.activeObjection ?? standing[0].id;
        action = { kind: "object", offer: s.offer, objectionId: s.activeObjection };
      } else if (move.reasons.length === 0) {
        action = { kind: "hold", offer: s.offer };
      } else {
        action = concedeToward(amt, arch.concessionRate, "concede");
      }
      break;
    }

    case "justify": {
      const cleared = clearBy(move.reasons);
      if (cleared.length > 0) {
        dT += 3 + 2 * cleared.length;
        action =
          s.userAsk !== null && better(d, s.userAsk, s.offer)
            ? concedeToward(s.userAsk, arch.concessionRate, "concede")
            : { kind: "hold", offer: s.offer };
      } else if (move.reasons.length > 0) {
        dT += 1;
        action = s.activeObjection
          ? { kind: "object", offer: s.offer, objectionId: s.activeObjection }
          : { kind: "hold", offer: s.offer };
      } else {
        dP -= cost(2);
        action = { kind: "hold", offer: s.offer };
      }
      break;
    }

    case "ask_question": {
      dT += 2;
      dP -= cost(1);
      const hint = config.hints.find((h) => !s.revealedHints.includes(h.id));
      if (hint) {
        s.revealedHints.push(hint.id);
        events.push({ type: "hint_revealed", hintId: hint.id });
        action = { kind: "answer", offer: s.offer, hintId: hint.id };
      } else {
        action = { kind: "hold", offer: s.offer };
      }
      break;
    }

    case "hold": {
      if (s.userAsk === null) {
        dP -= cost(3);
        action = { kind: "hold", offer: s.offer };
      } else if (s.holdsUsed < MAX_PRODUCTIVE_HOLDS && better(d, s.userAsk, s.offer)) {
        s.holdsUsed += 1;
        dP -= cost(3);
        dT += 1;
        action = concedeToward(s.userAsk, arch.concessionRate / 2, "hold");
      } else {
        dP -= cost(6);
        action = { kind: "hold", offer: s.offer };
      }
      break;
    }

    case "ultimatum": {
      if (s.trust >= arch.ultimatumTrust) {
        const from = s.offer;
        const target = s.userAsk !== null && better(d, s.userAsk, s.offer) ? s.userAsk : limit;
        const to = stepToward(d, from, target, limit, Math.min(1, arch.concessionRate * 2), config.rounding);
        if (to !== from) {
          s.offer = to;
          events.push({ type: "ultimatum_worked", from, to });
          events.push({ type: "counterpart_conceded", from, to });
        }
        action = to === target ? closeDeal(to) : finalOffer();
      } else {
        events.push({ type: "ultimatum_backfired" });
        dP -= cost(15);
        dT -= 8;
        action = finalOffer();
      }
      break;
    }

    case "offtopic":
    default: {
      dP -= cost(3);
      action = { kind: "redirect", offer: s.offer };
      break;
    }
  }

  return finish();

  function finish(): StepResult {
    const patience = clamp(s.patience + dP, 0, 100);
    const trust = clamp(s.trust + dT, 0, 100);
    const meterDelta = { patience: patience - s.patience, trust: trust - s.trust };
    s.patience = patience;
    s.trust = trust;

    if (s.status === "open" || s.status === "closing") {
      if (s.patience <= 0) {
        s.status = "walked_away";
        events.push({ type: "walked_away" });
        action = { kind: "walk_away", offer: s.offer };
      } else if (s.status === "open" && s.turn >= config.maxTurns) {
        action = finalOffer();
      }
    }
    return { state: s, action, derived, events, meterDelta };
  }
}

/** What the client may see while the session runs. The hidden limit never leaves the server. */
export function publicView(config: ScenarioConfig, s: CoreState): PublicSessionView {
  const { voiceId: _voiceId, ...persona } = config.persona;
  void _voiceId;
  return {
    turn: s.turn,
    maxTurns: config.maxTurns,
    status: s.status,
    offer: s.offer,
    userAsk: s.userAsk,
    patience: s.patience,
    trust: s.trust,
    direction: config.direction,
    period: config.period,
    persona,
  };
}

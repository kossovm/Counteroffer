/**
 * Holdline engine contract. Shared by the engine, the API and the UI.
 *
 * Money convention: all amounts are whole USD. `direction` says which way is good for the user:
 *   "up"   — the user wants a higher number (raise, job offer)
 *   "down" — the user wants a lower number (rent, bill)
 * The counterpart's hidden `limit` is the best number the user could possibly get
 * (ceiling for "up", floor for "down"). It is never sent to the client before the debrief.
 */

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

export type ScenarioKind = "raise" | "offer" | "rent" | "bill" | "custom";
export type Direction = "up" | "down";

/** How the counterpart behaves. Tunes concessions, patience and trust. */
export type Archetype = "budget_frozen" | "next_quarter" | "friendly_dodger" | "hardliner";

/** Kinds of argument a user can make. Objections are cleared by specific tags. */
export const REASON_TAGS = [
  "market_data", // market range, comparable salaries or rents, published bands
  "performance", // results, impact, numbers the user delivered
  "scope", // new or larger responsibilities
  "competing_offer", // another offer or option exists
  "replacement_cost", // cost and time to replace the user (or re-let the unit)
  "loyalty", // tenure, on-time payments, being a reliable tenant/customer
  "commitment", // longer lease, multi-year stay, prepayment
  "timing", // flexible start/effective date, aligning with budget cycle
] as const;
export type ReasonTag = (typeof REASON_TAGS)[number];

export interface ObjectionDef {
  id: string;
  /** What the counterpart says. Used by the actor; the engine only needs the id. */
  text: string;
  /** Any of these argument tags clears the objection. */
  clearedBy: ReasonTag[];
}

export interface HintDef {
  id: string;
  /** Information the counterpart reveals when the user asks a good question. */
  text: string;
  /** The argument this hint points at, shown in the debrief. */
  pointsTo?: ReasonTag;
}

export interface Persona {
  name: string;
  role: string; // "Engineering Manager", "Property manager"
  company?: string;
  yearsInRole?: number;
  archetype: Archetype;
  avatarId: string;
  voiceId?: string; // ElevenLabs voice
  /** One or two sentences of character for the actor. */
  bio: string;
}

export interface ScenarioConfig {
  id: string;
  kind: ScenarioKind;
  direction: Direction;
  title: string; // "Raise conversation with your manager"
  currency: "USD";
  /** Unit the user thinks in, for copy: "per year", "per month". */
  period: "year" | "month";
  /** The counterpart's opening position. */
  anchor: number;
  /** Hidden best possible number for the user (ceiling for up, floor for down). */
  limit: number;
  /** The user's own numbers from the quiz, shown back in the debrief. */
  userCurrent: number;
  userTarget: number;
  marketLow: number;
  marketHigh: number;
  /** Concessions are rounded to this (e.g. 500 for salary, 25 for rent). */
  rounding: number;
  objections: ObjectionDef[];
  hints: HintDef[];
  persona: Persona;
  maxTurns: number;
  /** How the hidden limit was derived, shown in the debrief. */
  limitExplanation: string;
}

// ---------------------------------------------------------------------------
// Moves (produced by the classifier from the user's message)
// ---------------------------------------------------------------------------

export const MOVE_TYPES = [
  "state_number", // names a number (a new ask, or agreeing to a number)
  "justify", // gives reasons without a new number
  "ask_question", // asks about budget, constraints, process
  "hold", // pushes back without a new number ("that doesn't work for me"), or stays silent
  "ultimatum", // threatens to leave / take another offer / move out
  "accept", // accepts the counterpart's current offer
  "offtopic", // anything else
] as const;
export type MoveType = (typeof MOVE_TYPES)[number];

export interface Move {
  type: MoveType;
  /** Number the user named in this message, if any (whole USD). */
  amount: number | null;
  /** Argument tags found in the message. Empty = no reason given. */
  reasons: ReasonTag[];
  /** Softening words found in the message ("maybe", "just", "sorry", "I think"). Measured, not judged. */
  hedges: string[];
}

/** Move after the engine's own interpretation (the classifier never says "concede"). */
export type DerivedMove = MoveType | "concede";

// ---------------------------------------------------------------------------
// Engine state and counterpart actions
// ---------------------------------------------------------------------------

export type SessionStatus = "open" | "closing" | "deal" | "walked_away";

export interface CoreState {
  turn: number;
  status: SessionStatus;
  /** Counterpart's current position. */
  offer: number;
  /** User's latest named number. */
  userAsk: number | null;
  /** First number the user named (their anchor). */
  userFirstAsk: number | null;
  patience: number; // 0..100
  trust: number; // 0..100
  clearedObjections: string[];
  /** Objection the counterpart is currently pressing, if any. */
  activeObjection: string | null;
  revealedHints: string[];
  holdsUsed: number;
  finalAmount: number | null;
}

export type CounterpartAction =
  | { kind: "open"; offer: number }
  | { kind: "hold"; offer: number }
  | { kind: "object"; offer: number; objectionId: string }
  | { kind: "concede"; from: number; to: number }
  | { kind: "answer"; offer: number; hintId: string }
  | { kind: "final_offer"; offer: number }
  | { kind: "accept"; amount: number }
  | { kind: "walk_away"; offer: number }
  | { kind: "redirect"; offer: number };

/** Machine-readable facts about a turn, used by the debrief and the UI ledger. */
export type EngineEvent =
  | { type: "anchored"; amount: number }
  | { type: "anchored_below_limit"; amount: number; limit: number }
  | { type: "out_of_range"; amount: number }
  | { type: "number_without_reason"; amount: number }
  | { type: "user_conceded"; from: number; to: number }
  | { type: "objection_cleared"; objectionId: string; by: ReasonTag[] }
  | { type: "objection_ignored"; objectionId: string }
  | { type: "hint_revealed"; hintId: string }
  | { type: "counterpart_conceded"; from: number; to: number }
  | { type: "hold_worked"; from: number; to: number }
  | { type: "ultimatum_backfired" }
  | { type: "ultimatum_worked"; from: number; to: number }
  | { type: "accepted_below_limit"; amount: number; limit: number }
  | { type: "deal"; amount: number }
  | { type: "walked_away" };

export interface StepResult {
  state: CoreState;
  action: CounterpartAction;
  derived: DerivedMove;
  events: EngineEvent[];
  meterDelta: { patience: number; trust: number };
}

/** One full exchange, as stored and replayed. */
export interface TurnRecord {
  turn: number;
  userText: string;
  move: Move;
  derived: DerivedMove;
  action: CounterpartAction;
  events: EngineEvent[];
  meterDelta: { patience: number; trust: number };
  offerBefore: number;
  offerAfter: number;
  /** Counterpart's line as spoken (written by the actor from `action`). */
  counterpartText: string;
  delivery?: TurnDelivery;
}

// ---------------------------------------------------------------------------
// Delivery metrics (voice layer; hedges also work in text mode)
// ---------------------------------------------------------------------------

export interface TurnDelivery {
  /** Words per minute for this turn (voice only). */
  wpm?: number;
  /** wpm relative to the user's baseline, e.g. +0.18 = 18% faster. */
  wpmVsBaseline?: number;
  /** Silence before the first number in the turn, ms (voice only). */
  pauseBeforeNumberMs?: number;
  /** "um", "uh", "like" ... (voice only, needs verbatim STT). */
  fillers?: string[];
  /** "maybe", "just", "sorry", "I think" ... (text and voice). */
  hedges: string[];
}

// ---------------------------------------------------------------------------
// Public view (what the client may see during a session)
// ---------------------------------------------------------------------------

export interface PublicSessionView {
  turn: number;
  maxTurns: number;
  status: SessionStatus;
  offer: number;
  userAsk: number | null;
  patience: number;
  trust: number;
  direction: Direction;
  period: ScenarioConfig["period"];
  persona: Omit<Persona, "voiceId">;
}

// ---------------------------------------------------------------------------
// Debrief
// ---------------------------------------------------------------------------

export type MistakeCode =
  | "no_number" // never named a number
  | "anchored_below_limit" // first ask already left money on the table
  | "number_without_reason" // named a number with no argument
  | "conceded_without_reason" // lowered own ask with nothing in return
  | "accepted_first_offer"
  | "settled_early" // said yes while the counterpart still had room
  | "ignored_objection" // kept pushing a number while an objection stood
  | "ultimatum_without_trust"
  | "walked_into_walkaway"; // pushed patience to zero

export interface DebriefRow {
  turn: number;
  derived: DerivedMove;
  userText: string;
  counterpartText: string;
  offerBefore: number;
  offerAfter: number;
  /**
   * Change of the number on the table in the user's favour (+ the counterpart moved, − the user
   * settled below what was already offered). Rows sum to `gained` when there is a deal.
   */
  moneyEffect: number;
  /** How much the user lowered their own ask this turn, counted only up to the hidden limit (≥ 0). */
  askDrop: number;
  meterDelta: { patience: number; trust: number };
  mistakes: MistakeCode[];
  events: EngineEvent[];
  delivery?: TurnDelivery;
  /** Better line for costly turns, written by the LLM from the mistake codes. */
  betterLine?: string;
}

export interface Debrief {
  outcome: "deal" | "walked_away" | "no_deal";
  direction: Direction;
  period: ScenarioConfig["period"];
  anchor: number;
  limit: number;
  limitExplanation: string;
  finalAmount: number | null;
  userFirstAsk: number | null;
  /** Moved in the user's favour from the counterpart's opening (≥ 0). */
  gained: number;
  /** Distance between the final number (or the opening if no deal) and the hidden limit (≥ 0). */
  leftOnTable: number;
  /** The single costliest turn, if any. */
  costliestTurn: number | null;
  rows: DebriefRow[];
  mistakeCounts: Partial<Record<MistakeCode, number>>;
  /** Objections that were never cleared. */
  openObjections: string[];
  /** Hints the user never asked for. */
  missedHints: string[];
}

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------

export interface QuizAnswers {
  kind: Exclude<ScenarioKind, "custom">;
  /** raise: current salary; offer: the offer on the table; rent/bill: current price. */
  current: number;
  /** What the user hopes to get. */
  target: number;
  /** Market range the user believes in (salary band, comparable rents). */
  marketLow: number;
  marketHigh: number;
  /** rent/bill only: the new price the counterpart announced. */
  announced?: number;
  archetype: Archetype;
  /** ISO date of the real conversation, if known. */
  conversationDate?: string;
  fear?: string;
}

export interface QuizEstimate {
  /** Yearly amount at stake, computed from the user's own numbers. */
  atStakePerYear: number;
  /** Human-readable formula, e.g. "($118,000 − $100,000) × 1 year". */
  formula: string;
}

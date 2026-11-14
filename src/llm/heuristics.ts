import type { Direction, Move, ReasonTag } from "@/engine/types";

/**
 * Deterministic text analysis. Used to check the LLM (amounts must appear in the text),
 * to measure hedges and fillers, and as the full fallback classifier when the LLM is unavailable.
 */

const AMOUNT_RE = /(\$)?\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(k|K|thousand|grand)?(?![\d%])/g;

/** All money amounts in the text, in order. Skips percentages, small counts and bare years. */
export function parseAmounts(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(AMOUNT_RE)) {
    const [, dollar, digits, suffix] = m;
    const after = text.slice((m.index ?? 0) + m[0].length).trimStart();
    if (/^(%|percent|months?|years?|weeks?|days?|hours?|people|units|times)\b/i.test(after)) continue;
    let n = parseFloat(digits.replace(/,/g, ""));
    if (suffix) n *= 1000;
    n = Math.round(n);
    if (!dollar && !suffix) {
      if (n >= 1900 && n <= 2100 && !digits.includes(",")) continue; // a year, not money
      if (n < 100) continue;
    }
    if (n < 10) continue;
    out.push(n);
  }
  return out;
}

const HEDGES = [
  "maybe",
  "perhaps",
  "just",
  "sorry",
  "i think",
  "i guess",
  "kind of",
  "sort of",
  "if possible",
  "if that's okay",
  "if that's ok",
  "i was hoping",
  "i was thinking",
  "hopefully",
  "probably",
  "a little",
  "i feel like",
  "would it be possible",
];

const FILLERS = ["um", "uh", "erm", "uhm", "you know"];

const findAll = (text: string, words: string[]): string[] => {
  const t = text.toLowerCase().replace(/[’]/g, "'");
  const found: string[] = [];
  for (const w of words) {
    const re = new RegExp(`(^|[^a-z'])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z'])`, "g");
    const count = (t.match(re) ?? []).length;
    for (let i = 0; i < count; i++) found.push(w);
  }
  return found;
};

export const detectHedges = (text: string) => findAll(text, HEDGES);
export const detectFillers = (text: string) => findAll(text, FILLERS);

const REASON_PATTERNS: Record<ReasonTag, RegExp> = {
  market_data:
    /\b(market|glassdoor|levels\.fyi|payscale|salary range|pay range|band|comparable|similar (roles|units|apartments)|average|median|going rate|zillow|listings?)\b/i,
  performance:
    /\b(shipped|delivered|led|launched|increased|reduced|cut|saved|grew|results?|impact|exceeded|revenue|on-?call|migration|promot)/i,
  scope: /\b(responsibilit|took over|taken on|managing|scope|mentor|leading the|lead the|own(ing)? the)/i,
  competing_offer: /\b(offer from|another offer|other offer|competing|competitor|recruiter|switch(ing)? to|cheaper plan)/i,
  replacement_cost: /\b(replace|replacing|hiring|backfill|vacan|turnover|re-?list|empty units?|cost you|onboard)/i,
  loyalty: /\b(on time|years here|been here|loyal|never late|reliable|tenant for|customer for|long-?time)/i,
  commitment: /\b(longer lease|two-?year|2-?year|18-?month|multi-?year|commit|prepay|sign today)/i,
  timing: /\b(start date|start earlier|next cycle|effective|budget cycle|flexible|retroactive|this quarter)\b/i,
};

export function detectReasons(text: string): ReasonTag[] {
  return (Object.keys(REASON_PATTERNS) as ReasonTag[]).filter((tag) => REASON_PATTERNS[tag].test(text));
}

/** Deterministic classifier: the safe fallback when the LLM is down, slow or over budget. */
export function heuristicClassify(text: string, direction: Direction): Move {
  const t = text.trim();
  const amounts = parseAmounts(t);
  const reasons = detectReasons(t);
  const hedges = detectHedges(t);
  const lower = t.toLowerCase();

  if (/(another offer|other offer|competing offer|i('ll| will)( have to)? (leave|quit|walk|move out|cancel|switch)|otherwise i('ll| will))/.test(lower)) {
    return { type: "ultimatum", amount: amounts.at(-1) ?? null, reasons, hedges };
  }
  if (amounts.length === 0 && /\b(deal|i accept|i'll take it|that works|sounds good|agreed|let's do it|okay,? let's go)\b/.test(lower)) {
    return { type: "accept", amount: null, reasons, hedges };
  }
  if (amounts.length > 0) {
    // When several numbers appear ("I make $100k, I'm asking $118k"), the ask is the most ambitious one.
    const amount = direction === "up" ? Math.max(...amounts) : Math.min(...amounts);
    return { type: "state_number", amount, reasons, hedges };
  }
  if (t.endsWith("?")) return { type: "ask_question", amount: null, reasons, hedges };
  if (reasons.length > 0) return { type: "justify", amount: null, reasons, hedges };
  if (/(doesn't work|does not work|not enough|too low|too high|can't accept|cannot accept|not what i|i'll pass|no\.?$|^\.{3}$|^$)/.test(lower)) {
    return { type: "hold", amount: null, reasons, hedges };
  }
  return { type: "offtopic", amount: null, reasons, hedges };
}

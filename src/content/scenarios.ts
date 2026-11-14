import type { ScenarioTemplate } from "@/engine/scenario";

/**
 * Scenario content: who the counterpart is and what they say. Numbers come from the quiz and the engine.
 * Owner: content (Jafar). Objection `clearedBy` tags decide which arguments work, so keep them realistic.
 */

export const RAISE: ScenarioTemplate = {
  kind: "raise",
  title: "Raise conversation with your manager",
  persona: {
    name: "Dana Whitaker",
    role: "Engineering Manager",
    company: "Northwind Software (fictional)",
    yearsInRole: 6,
    archetype: "budget_frozen",
    avatarId: "dana",
    bio: "Likes you, protects her budget, has run this conversation many times. Short sentences, no promises she cannot keep.",
  },
  objections: [
    {
      id: "budget_frozen",
      text: "Raise budget is frozen for this cycle. The 3% merit increase is what I have.",
      clearedBy: ["performance", "replacement_cost", "timing"],
    },
    {
      id: "already_in_band",
      text: "You're already in the middle of the band for your level.",
      clearedBy: ["market_data", "scope"],
    },
    {
      id: "team_fairness",
      text: "If I do this for you, I have to explain it to the whole team.",
      clearedBy: ["performance", "scope"],
    },
  ],
  hints: [
    {
      id: "exception_path",
      text: "Exceptions to the cycle go through my director, and she wants a business case, not a feeling.",
      pointsTo: "performance",
    },
    {
      id: "backfill_pain",
      text: "We lost two people this year, and backfilling took us almost five months each.",
      pointsTo: "replacement_cost",
    },
    {
      id: "band_update",
      text: "The bands were refreshed in the summer, but most people haven't been moved yet.",
      pointsTo: "market_data",
    },
  ],
};

export const OFFER: ScenarioTemplate = {
  kind: "offer",
  title: "Job offer call with the recruiter",
  persona: {
    name: "Marcus Lee",
    role: "Senior Technical Recruiter",
    company: "Brightline Health (fictional)",
    yearsInRole: 4,
    archetype: "next_quarter",
    avatarId: "marcus",
    bio: "Warm, fast, wants to close this week. Has some room but will not volunteer it.",
  },
  objections: [
    {
      id: "top_of_band",
      text: "This offer is already near the top of the band for the level.",
      clearedBy: ["market_data", "scope"],
    },
    {
      id: "equity_instead",
      text: "We'd rather move on equity or a signing bonus than on base.",
      clearedBy: ["competing_offer", "market_data"],
    },
    {
      id: "approval_needed",
      text: "Anything above this needs the hiring manager to sign off again.",
      clearedBy: ["competing_offer", "timing", "performance"],
    },
  ],
  hints: [
    {
      id: "start_date",
      text: "Honestly, the team needs someone before the end of the quarter.",
      pointsTo: "timing",
    },
    {
      id: "other_candidates",
      text: "You're our first choice. The second candidate is a few weeks behind in the process.",
      pointsTo: "replacement_cost",
    },
  ],
};

export const RENT: ScenarioTemplate = {
  kind: "rent",
  title: "Lease renewal with your property manager",
  persona: {
    name: "Gary Novak",
    role: "Property Manager",
    company: "Elm Street Residences (fictional)",
    yearsInRole: 9,
    archetype: "hardliner",
    avatarId: "gary",
    bio: "Polite, busy, manages 120 units. Hates vacancies more than he lets on.",
  },
  objections: [
    {
      id: "market_went_up",
      text: "Every unit in the building went up this year. That's the market.",
      clearedBy: ["market_data", "loyalty"],
    },
    {
      id: "costs_went_up",
      text: "Taxes and insurance went up, and I'm passing that through.",
      clearedBy: ["commitment", "timing"],
    },
    {
      id: "easy_to_relist",
      text: "I could re-list this unit tomorrow.",
      clearedBy: ["replacement_cost", "loyalty"],
    },
  ],
  hints: [
    {
      id: "turnover_cost",
      text: "A turnover costs me about a month of rent plus paint and cleaning.",
      pointsTo: "replacement_cost",
    },
    {
      id: "empty_units",
      text: "Two units on your floor have been empty since August, between us.",
      pointsTo: "market_data",
    },
    {
      id: "longer_lease",
      text: "I'd rather lock in a longer lease than go through a renewal every year.",
      pointsTo: "commitment",
    },
  ],
};

export const TEMPLATES: Record<ScenarioTemplate["kind"], ScenarioTemplate> = {
  raise: RAISE,
  offer: OFFER,
  rent: RENT,
  bill: {
    ...RENT,
    kind: "bill",
    title: "Call with your internet provider",
    persona: {
      name: "Priya Shah",
      role: "Customer Retention Specialist",
      company: "Lumen Fiber (fictional)",
      yearsInRole: 3,
      archetype: "friendly_dodger",
      avatarId: "priya",
      bio: "Friendly, scripted, has retention offers she only shows if you mention leaving.",
    },
    objections: [
      {
        id: "promo_ended",
        text: "Your promotional rate ended, this is the standard price.",
        clearedBy: ["loyalty", "competing_offer"],
      },
      {
        id: "no_discounts",
        text: "I don't see any discounts available on your account.",
        clearedBy: ["competing_offer", "commitment"],
      },
    ],
    hints: [
      {
        id: "retention_team",
        text: "Retention offers exist for customers who are thinking of switching.",
        pointsTo: "competing_offer",
      },
    ],
  },
};

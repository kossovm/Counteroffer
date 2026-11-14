import type { Archetype } from "./types";

export interface ArchetypeParams {
  label: string;
  patience0: number;
  trust0: number;
  /** Share of the remaining distance to the limit given up in one concession. */
  concessionRate: number;
  /** Trust needed for an ultimatum to be taken seriously. */
  ultimatumTrust: number;
  /** Multiplier on patience losses. */
  patienceCost: number;
}

export const ARCHETYPES: Record<Archetype, ArchetypeParams> = {
  budget_frozen: {
    label: "Budget is frozen",
    patience0: 65,
    trust0: 45,
    concessionRate: 0.35,
    ultimatumTrust: 60,
    patienceCost: 1,
  },
  next_quarter: {
    label: "Let's revisit next quarter",
    patience0: 75,
    trust0: 50,
    concessionRate: 0.4,
    ultimatumTrust: 55,
    patienceCost: 0.8,
  },
  friendly_dodger: {
    label: "Friendly, but never commits",
    patience0: 85,
    trust0: 60,
    concessionRate: 0.25,
    ultimatumTrust: 65,
    patienceCost: 0.7,
  },
  hardliner: {
    label: "Hard line",
    patience0: 50,
    trust0: 35,
    concessionRate: 0.5,
    ultimatumTrust: 50,
    patienceCost: 1.4,
  },
};

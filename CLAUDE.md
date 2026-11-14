# Counteroffer — rules for every Claude Code session in this repo

@AGENTS.md

## Product in one breath
B2C web app for US adults 25–45. Users rehearse money conversations (raise, job offer, rent, bills)
against an AI counterpart that does not fold, then see how much they left on the table and why.
Hackathon deadline: **15 Nov 2026, 11:00 Asia/Almaty (code freeze)**. Prod: https://counter.aqy.kz

## Architecture (do not break these invariants)
- `src/engine/` — **deterministic** negotiation engine, pure TypeScript, no I/O, no LLM, no `Date.now()`/`Math.random()`
  without an injected seed. It owns all hidden state (ceiling, walk-away, patience, trust, objections)
  and decides every counterpart action. Every rule is unit-tested.
- LLMs never decide outcomes. They only: **classify** a user message into a closed set of moves,
  **voice** a decision the engine already made, **draft** a scenario config that is then schema-validated.
- Every number shown to a user (offers, "left on the table", scores) comes from engine state. Never invent,
  hardcode or let an LLM produce a number that is displayed as fact. The jury reads the repo and checks this.
- `src/engine/types.ts` is the contract between engine, API and UI. Changing it = tell the owner first.

## Who owns what (stay inside your folder unless asked)
| Area | Paths | Owner session |
|---|---|---|
| Engine, LLM layer, DB, API routes | `src/engine/**`, `src/llm/**`, `src/db/**`, `src/app/api/**`, `drizzle/**` | maksim |
| UI, design system, pages | `src/app/(app)/**`, `src/app/(marketing)/**`, `src/components/**`, `src/app/globals.css` | kerey |
| Scenarios, archetypes, quiz copy | `src/content/**` | aziz |
| Pitch deck, market numbers, docs | `docs/**`, `deck/**` | jafar |

## Workflow
- Never commit to `main` directly and never push `main`. Work on a branch `<owner>/<topic>`, push the branch;
  maksim merges. `main` auto-deploys to production.
- Before every commit: `npm run typecheck && npm run lint && npm test`. Do not commit if any fails.
- Small commits, imperative subject lines in English.
- Never commit `.env*` files, keys, tokens or real personal data. Demo data must be clearly fictional.
- Do not run `docker`, `sudo`, `systemctl` or anything touching other projects on this server.
- Dev server: `npm run dev -- -H 127.0.0.1 -p <your port>` (ports in `docs/TEAM.md`). Never bind 0.0.0.0.

## Design rules (jury asked for "not AI design", inspired by Zimran products)
- Dark indigo base, single violet accent, bold grotesque headings, flat blocks, generous spacing.
- No glassmorphism, no rainbow gradients, no emoji as icons, no default component-library look.
- Text first: short sentences, US English, numbers in USD.

## Next.js
This is Next.js 16 (see AGENTS.md). Read `node_modules/next/dist/docs/` before using an API you are unsure of.
`cacheComponents` is OFF on purpose: pages render dynamically, `cookies()`/`headers()` are async.

# Counter

**Rehearse the conversations that cost you money.**
Practice the raise, the job offer and the rent talk against an AI counterpart who does not fold, then see exactly how much you left on the table and which line would have won it back.

> Zimran Business Cup 2.0 · Track: Skills · Audience: US adults 25–45 · B2C · Web

## Live demo

Production: _link added after first deploy_ — no sign-up, use the demo-account buttons on the start page.

## How it works

The counterpart is not a prompt. Every session runs on a deterministic negotiation engine with hidden state
(budget ceiling, walk-away point, patience, trust, objection list). LLMs only:

1. **Scenarist** — turns the user's situation into a validated scenario config (once per scenario).
2. **Classifier** — maps each user message to a closed set of moves (anchor, justify, concede, ask, hold, ultimatum, off-topic) plus any number mentioned.
3. **Actor** — voices the decision the engine already made, in character. Numbers in the reply are checked against engine state.

The **engine** (`src/engine`, pure TypeScript, unit-tested) decides concessions, objections and walk-aways.
That is why the debrief can say "her ceiling was $112k, you stopped at $104k, move #4 is where you conceded first" — and why the same session can be replayed.

## Stack

Next.js 16 (App Router, TypeScript) · PostgreSQL 16 + Drizzle ORM · Polar (payments, sandbox) · Vitest · Docker · GitHub Actions → GHCR → VPS behind Caddy.

## Local development

```bash
cp .env.example .env.local          # fill in values
npm install
npm run dev                         # migrations run automatically on server start
```

Needs a local PostgreSQL 16 matching `DATABASE_URL`.

| Command | What it does |
|---|---|
| `npm run dev` | dev server on :3000 |
| `npm test` | engine unit tests |
| `npm run typecheck` | route type generation + `tsc` |
| `npm run db:generate` | new SQL migration from `src/db/schema.ts` |

## Deployment

Push to `main` → CI runs typecheck, lint and tests → builds the image in GitHub Actions (never on the server) → pushes to GHCR → SSH deploy restarts only the `counter` compose project and waits for the health check.
The production stack publishes no ports, is memory-capped, and is reached by the existing Caddy reverse proxy over a shared Docker network. See `docker-compose.yml` and `deploy/Caddyfile.snippet`.

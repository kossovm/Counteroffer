# Team workflow

Maksim is the registered participant and the only commit author. Kerey and Jafar work in Claude Code
sessions on the shared server (Linux user `maksim`, one tmux session each). Every commit is authored as Maksim.

| Person | tmux session | Working copy | Dev port | Branch prefix | Area |
|---|---|---|---|---|---|
| maksim | — | main Claude session | 3104 | `maksim/` | engine, LLM, DB, API, merges to `main` |
| kerey | `kerey` | `~/work/kerey/counteroffer` | 3101 | `kerey/` | UI, design system, browser audio |
| jafar | `jafar` | `~/work/jafar/counteroffer` | 3102 | `jafar/` | content, eval cases, research, deck, QA |

## Flow
1. `bash scripts/dev-setup.sh <name>` once (clone, git identity, `.env.local`, push guard for `main`, Claude Code deny rules).
2. `git switch -c <name>/<topic>` → work → checks pass → `git push -u origin <name>/<topic>`.
3. Maksim merges into `main`. Every push to `main` deploys to https://counter.aqy.kz.

## Checks before every commit
`npm run typecheck && npm run lint && npm test`

## Preview from your laptop
`ssh -N -L <port>:127.0.0.1:<port> maksim@185.113.132.64`, then open `http://localhost:<port>`.

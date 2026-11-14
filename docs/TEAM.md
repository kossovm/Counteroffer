# Team workflow

Maksim is the registered participant and the only commit author. All work happens in Claude Code
sessions on the shared server that Maksim starts and supervises; every commit is authored as Maksim.

| Person | Linux user | Dev port | Branch prefix | Area |
|---|---|---|---|---|
| maksim | maksim | 3104 | `maksim/` | engine, LLM, DB, API, merges to `main` |
| kerey | team | 3101 | `kerey/` | UI, design system |
| jafar | team | 3102 | `jafar/` | deck, market, docs |
| aziz | team | 3103 | `aziz/` | scenarios, archetypes, quiz copy |

## Flow
1. `bash scripts/dev-setup.sh <name>` once.
2. `git switch -c <name>/<topic>` → work → checks pass → `git push -u origin <name>/<topic>`.
3. Maksim merges into `main`. Every push to `main` deploys to https://counter.aqy.kz.

## Checks before every commit
`npm run typecheck && npm run lint && npm test`

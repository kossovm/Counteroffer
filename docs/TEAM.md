# Team workflow

Maksim is the registered participant and the only commit author. Kerey and Jafar develop on their own
laptops with their own Claude Code accounts. Their commits are authored as Maksim and reach GitHub only
through the relay on Maksim's server, which rejects anything else.

| Person | Branch prefix | Area |
|---|---|---|
| maksim | `maksim/` (merges to `main`) | engine, LLM, DB, API, voice server endpoints |
| kerey | `kerey/` | UI, design system, browser audio |
| jafar | `jafar/` | content, classifier eval cases, research, deck, QA |

## One-time setup on your laptop
```bash
git clone https://github.com/kossovm/Counteroffer.git holdline && cd holdline
git config user.name "Maksim Kossov"
git config user.email "185616214+kossovm@users.noreply.github.com"
git remote set-url --push origin maksim@185.113.132.64:holdline.git   # fetch from GitHub, push to the relay
npm install
cp .env.example .env.local
```
In `.env.local` set:
```
DATABASE_URL=postgres://counter:counter-dev@127.0.0.1:55433/counter_<your name>
ANTHROPIC_API_KEY=<dev key from Maksim>
ELEVENLABS_API_KEY=<Kerey's key>
```
The dev database lives on the server. Keep this tunnel open while you work:
```bash
ssh -N -L 55433:127.0.0.1:55433 maksim@185.113.132.64
```

## Daily loop
```bash
git fetch origin && git switch -c kerey/<topic> origin/main     # new branch from the latest main
npm run dev                                                      # http://localhost:3000
npm run typecheck && npm run lint && npm test                    # before every commit
git push -u origin kerey/<topic>                                 # goes to the relay, then to GitHub
```
Then tell Maksim the branch name. He merges into `main`; every push to `main` deploys to https://counter.aqy.kz.

If the relay rejects a push because of the author, run the fix it prints (it rewrites only your branch).

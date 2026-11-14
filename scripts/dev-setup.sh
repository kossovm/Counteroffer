#!/usr/bin/env bash
# Sets up a personal working copy on the shared server (run as Linux user maksim).
# Usage:  bash dev-setup.sh <kerey|jafar|maksim>
set -euo pipefail

NAME="${1:?usage: dev-setup.sh <kerey|jafar|maksim>}"
case "$NAME" in
  kerey)  PORT=3101 ;;
  jafar)  PORT=3102 ;;
  maksim) PORT=3104 ;;
  *) echo "unknown name: $NAME"; exit 1 ;;
esac

DIR="$HOME/work/$NAME/counteroffer"
REMOTE="${COUNTEROFFER_REMOTE:-git@github-counteroffer:kossovm/Counteroffer.git}"

mkdir -p "$(dirname "$DIR")"
if [ ! -d "$DIR/.git" ]; then
  git clone "$REMOTE" "$DIR"
fi
cd "$DIR"

# Every commit in this repo is authored by the registered participant.
git config user.name "Maksim Kossov"
git config user.email "185616214+kossovm@users.noreply.github.com"
git config pull.rebase true

# Hard guard: only Maksim's main session pushes main. Branch pushes are fine.
if [ "$NAME" != "maksim" ]; then
  cat > .git/hooks/pre-push <<'HOOK'
#!/bin/sh
while read local_ref local_sha remote_ref remote_sha; do
  if [ "$remote_ref" = "refs/heads/main" ]; then
    echo "Pushing main is blocked in this working copy. Push your branch; Maksim merges." >&2
    exit 1
  fi
done
HOOK
  chmod +x .git/hooks/pre-push

  # Claude Code deny rules for this working copy (not committed).
  mkdir -p .claude
  cat > .claude/settings.local.json <<'JSON'
{
  "permissions": {
    "deny": [
      "Bash(docker:*)",
      "Bash(sudo:*)",
      "Bash(systemctl:*)",
      "Bash(git push origin main:*)",
      "Bash(git push --force:*)",
      "Read(~/nice-almaty/**)",
      "Edit(~/nice-almaty/**)",
      "Read(~/counter/**)",
      "Edit(~/counter/**)"
    ]
  }
}
JSON
fi

if [ ! -f .env.local ]; then
  cp .env.example .env.local
  sed -i "s#^DATABASE_URL=.*#DATABASE_URL=postgres://counter:counter-dev@127.0.0.1:55433/counter_${NAME}#" .env.local
  sed -i "s#^APP_URL=.*#APP_URL=http://127.0.0.1:${PORT}#" .env.local
  sed -i "s#^SESSION_SECRET=.*#SESSION_SECRET=dev-${NAME}-$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')#" .env.local
  if [ -f "$HOME/.holdline-dev-keys" ]; then
    # shared dev keys (ANTHROPIC_API_KEY=..., ELEVENLABS_API_KEY=...), kept outside any repo
    while IFS='=' read -r k v; do
      [ -n "$k" ] && sed -i "s#^${k}=.*#${k}=${v}#" .env.local
    done < "$HOME/.holdline-dev-keys"
  fi
fi

npm install

cat <<EOF

Ready: $DIR
  dev server : npm run dev -- -H 127.0.0.1 -p $PORT
  preview    : on your laptop  ssh -N -L $PORT:127.0.0.1:$PORT maksim@185.113.132.64  then http://localhost:$PORT
  branch     : git switch -c $NAME/<topic>
EOF

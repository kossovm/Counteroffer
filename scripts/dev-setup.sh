#!/usr/bin/env bash
# Sets up a personal working copy on the shared server.
# Usage (run as the Linux user who will work in it):  bash dev-setup.sh <name>
# name: maksim | kerey | aziz | jafar
set -euo pipefail

NAME="${1:?usage: dev-setup.sh <maksim|kerey|aziz|jafar>}"
case "$NAME" in
  maksim) PORT=3104 ;;
  kerey)  PORT=3101 ;;
  aziz)   PORT=3103 ;;
  jafar)  PORT=3102 ;;
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

if [ ! -f .env.local ]; then
  cp .env.example .env.local
  sed -i "s#^DATABASE_URL=.*#DATABASE_URL=postgres://counter:counter-dev@127.0.0.1:55433/counter_${NAME}#" .env.local
  sed -i "s#^APP_URL=.*#APP_URL=http://127.0.0.1:${PORT}#" .env.local
  sed -i "s#^SESSION_SECRET=.*#SESSION_SECRET=dev-${NAME}-$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')#" .env.local
fi

npm install

cat <<EOF

Ready: $DIR
  dev server : npm run dev -- -H 127.0.0.1 -p $PORT
  preview    : on your laptop run  ssh -N -L $PORT:127.0.0.1:$PORT <user>@185.113.132.64
               then open http://localhost:$PORT
  branch     : git switch -c $NAME/<topic>
EOF

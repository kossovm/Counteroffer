#!/usr/bin/env bash
# Git relay on the server: teammates push branches to maksim@server:holdline.git,
# the server checks every commit is authored as Maksim, refuses `main`, and forwards
# the branch to GitHub with the server's deploy key. Run once as user maksim.
set -euo pipefail

ALLOWED_EMAIL="185616214+kossovm@users.noreply.github.com"
BARE="$HOME/holdline.git"

if [ ! -d "$BARE" ]; then
  git clone --bare https://github.com/kossovm/Counteroffer.git "$BARE"
fi
git -C "$BARE" remote remove github 2>/dev/null || true
git -C "$BARE" remote add github git@github-counteroffer:kossovm/Counteroffer.git

cat > "$BARE/hooks/pre-receive" <<HOOK
#!/bin/sh
ALLOWED="$ALLOWED_EMAIL"
ZERO=0000000000000000000000000000000000000000
while read old new ref; do
  case "\$ref" in
    refs/heads/main) echo "Pushing main is not allowed here. Push your branch; Maksim merges." >&2; exit 1 ;;
  esac
  [ "\$new" = "\$ZERO" ] && continue
  if [ "\$old" = "\$ZERO" ]; then commits=\$(git rev-list "\$new" --not --all); else commits=\$(git rev-list "\$old..\$new"); fi
  for c in \$commits; do
    ae=\$(git log -1 --format=%ae "\$c"); ce=\$(git log -1 --format=%ce "\$c")
    if [ "\$ae" != "\$ALLOWED" ] || [ "\$ce" != "\$ALLOWED" ]; then
      echo "Commit \$c is authored by \$ae (committer \$ce)." >&2
      echo "Fix: git config user.name 'Maksim Kossov' && git config user.email \$ALLOWED, then rewrite: git rebase -r origin/main --exec 'git commit --amend --no-edit --reset-author'" >&2
      exit 1
    fi
  done
done
exit 0
HOOK

cat > "$BARE/hooks/post-receive" <<'HOOK'
#!/bin/sh
ZERO=0000000000000000000000000000000000000000
while read old new ref; do
  if [ "$new" = "$ZERO" ]; then
    git push github ":$ref" 2>&1 | sed 's/^/[github] /'
  else
    git push --force github "$new:$ref" 2>&1 | sed 's/^/[github] /'
  fi
done
HOOK

chmod +x "$BARE/hooks/pre-receive" "$BARE/hooks/post-receive"

echo "Testing GitHub write access with the deploy key..."
if ssh -o BatchMode=yes -T git@github-counteroffer 2>&1 | grep -qi "successfully authenticated"; then
  echo "OK: GitHub accepts the deploy key."
else
  echo "WARNING: GitHub did not accept the key. Add ~/.ssh/counteroffer_rw.pub as a deploy key with write access."
fi
echo "Relay ready: maksim@<server>:holdline.git"

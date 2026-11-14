#!/usr/bin/env bash
# End-to-end API check. Usage: B=https://counter.aqy.kz bash scripts/smoke.sh
J=/tmp/cj.txt; rm -f $J
B=${B:-http://127.0.0.1:3999}
echo "--- demo users"; curl -s $B/api/demo/login | head -c 300; echo
echo "--- login sam"; curl -s -c $J -b $J -X POST $B/api/demo/login -H 'content-type: application/json' -d '{"key":"sam"}' | head -c 160; echo
echo "--- me"; curl -s -b $J $B/api/me | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["user"], [(s["kind"], s["status"], s["leftOnTable"]) for s in d["sessions"]])'
echo "--- new session"; S=$(curl -s -c $J -b $J -X POST $B/api/sessions -H 'content-type: application/json' -d '{"quiz":{"kind":"raise","current":100000,"target":118000,"marketLow":105000,"marketHigh":120000,"archetype":"budget_frozen"}}'); echo "$S" | head -c 300; echo
ID=$(echo "$S" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
for msg in "Thanks for the time. Given the market band for my level, I am asking for 118k." "What would it take to get an exception approved?" "This year I shipped the billing migration two months early and cut on-call pages by 40%." "That doesn't work for me." "OK, deal."; do
  echo "--- turn: $msg"; curl -s -b $J -X POST $B/api/sessions/$ID/turns -H 'content-type: application/json' -d "$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1]}))' "$msg")" | python3 -c 'import sys,json; d=json.load(sys.stdin); t=d.get("turn",{}); print(d.get("error") or (t["derived"], t["actionKind"], t["offerAfter"], t["meterDelta"], "|", t["counterpartText"], "| ended", d["ended"]))'
done
echo "--- debrief"; curl -s -b $J -X POST $B/api/sessions/$ID/debrief | python3 -c 'import sys,json; d=json.load(sys.stdin)["debrief"]; print(d["outcome"], "final", d["finalAmount"], "limit", d["limit"], "gained", d["gained"], "left", d["leftOnTable"], d["mistakeCounts"]); [print(" ", r["turn"], r["derived"], r["moneyEffect"], r["askDrop"], r["mistakes"], "|", r.get("betterLine")) for r in d["rows"]]'
echo "--- replay"; curl -s -b $J -X POST $B/api/sessions -H 'content-type: application/json' -d "{\"replayOf\":\"$ID\"}" | head -c 160; echo
echo "--- stranger cannot read"; curl -s $B/api/sessions/$ID; echo
echo "--- example"; curl -s $B/api/demo/example | python3 -c 'import sys,json; d=json.load(sys.stdin); print("left", d["debrief"]["leftOnTable"], "turns", len(d["turns"]))'

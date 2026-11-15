A=https://api.maplefm.gg; UA="Mozilla/5.0 clubfm-battle-test"
t(){ m=$1; p=$2; shift 2; r=$(curl -sS -m 20 -o /tmp/b.txt -w "%{http_code} %{size_download}" -X $m -A "$UA" -H "Origin: https://maplefm.gg" -D /tmp/h.txt "$@" "$A$p"); cors=$(grep -i "^access-control-allow-origin" /tmp/h.txt | tr -d '\r' | cut -d' ' -f2); printf "%-6s %-26s %-10s cors=%-22s %s\n" "$m" "$p" "$r" "$cors" "$(head -c 110 /tmp/b.txt | tr '\n' ' ')"; sleep 1; }
for p in /admin /admin/traffic /admin/market /admin/stats-report /admin/brand /admin/refs /admin/note; do t GET $p; done
for p in /admin/weekly/post /admin/score/post /admin/setup-commands /admin/gone-need /admin/rdraft/post /admin/traffic/post /admin/watchdog/test; do t POST $p; done
for p in /me /me/alerts /me/settings /me/build /me/quests /me/digest/test; do t GET $p; done
t POST /me/settings --data '{"settings":{}}'
for p in /inbox /inbox/fast /inbox/miss /inbox/pull /inbox/rejects /inbox/wrong /watcher/quests; do t POST $p --data '{}'; done
for p in /data/live /data/sig /data/snap-status /public/stats /public/popular /public/gone /public/scanners /public/beacons /public/links /public/supporters /public/kofi-income /public/coin /market /market/stats /shop /chat/price; do t GET $p; done
t GET "/chat/price?q=work%20gloves"
t GET "/chat/price?q=$(python3 -c 'print("a"*600)')"
t POST /gone --data '{"k":"bad"}'
t POST /hit --data 'not json'
t POST /interactions --data '{"type":1}'
t POST /kofi --data 'data={}'
t GET /twitchbot/eventsub
t POST /twitchbot/eventsub --data '{}'
t GET "/r?u=https://evil.example"
t GET "/l/zzzz"
t GET "/login?back=https://evil.example"
t GET /no-such-route

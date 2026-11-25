#!/usr/bin/env bash
# Club FM stream reader: fetch the newest files from maplefm.gg (the reader restarts itself when its code changes)
# and, once an hour, report in to data/stream-status.json in the private archive so the watchdog sees it alive.
# install.sh runs this with --files-only; the systemd timer runs it every 15 minutes.
set -uo pipefail
SITE="https://maplefm.gg/download"
DIR=/opt/clubfm; APP="$DIR/app"; NEW="$DIR/new"
mkdir -p "$APP"; rm -rf "$NEW"; mkdir -p "$NEW"

ok=1
curl -fsSL "$SITE/FMWatcher.zip" -o "$NEW/w.zip" && unzip -qo "$NEW/w.zip" -d "$NEW" || ok=0
for f in stream_reader.py plateverify.py plategaps.json shop_buttons.png update.sh; do
  curl -fsSL "$SITE/stream/$f" -o "$NEW/FMWatcher/$f" || ok=0
done
if [ "$ok" = 1 ] && [ -s "$NEW/FMWatcher/stream_reader.py" ] && [ -s "$NEW/FMWatcher/watcher.py" ]; then
  changed=0
  for f in "$NEW"/FMWatcher/*; do
    b=$(basename "$f")
    case "$b" in config.json|*.bat|install.*|README.txt) continue;; esac
    if [ "$b" = update.sh ]; then cmp -s "$f" "$DIR/update.sh" || cp "$f" "$DIR/update.sh"; continue; fi
    cmp -s "$f" "$APP/$b" || { cp "$f" "$APP/$b"; changed=1; }
  done
  [ "$changed" = 1 ] && echo "updated files"
else
  echo "could not fetch the newest files; keeping what is here"
fi
rm -rf "$NEW"

# Settings: written once, kept after that (edit /opt/clubfm/app/config.json to change them)
if [ ! -s "$APP/config.json" ]; then
cat > "$APP/config.json" <<'EOF'
{
  "publish": true,
  "publish_every_minutes": 3,
  "keep_days": 14,
  "save_review": false,
  "github_repo": "maplefm/clubfm-archive",
  "github_branch": "live",
  "token_file": "token.txt",
  "name": "streams",
  "streams": {"max_streams": 6, "max_full": 2}
}
EOF
fi
id clubfm >/dev/null 2>&1 && chown -R clubfm:clubfm "$DIR"
[ "${1:-}" = "--files-only" ] && exit 0

# Report in, at most once an hour
stamp="$DIR/.last_report"
if [ -s "$APP/token.txt" ] && { [ ! -f "$stamp" ] || [ $(( $(date +%s) - $(stat -c %Y "$stamp") )) -ge 3300 ]; }; then
  TOKEN=$(cat "$APP/token.txt")
  API=https://api.github.com/repos/maplefm/clubfm-archive/contents/data/stream-status.json
  active=$(systemctl is-active clubfm-stream 2>/dev/null || echo unknown)
  body=$("$DIR/venv/bin/python" - "$APP" "$active" <<'PY'
import json, sys, os, datetime, glob
app, active = sys.argv[1], sys.argv[2]
st = {}
try: st = json.load(open(os.path.join(app, "stream_status.json"), encoding="utf-8"))
except Exception: pass
shops_hour = 0
cut = (datetime.datetime.now() - datetime.timedelta(hours=1)).strftime("%H:%M:%S")
try:
    for line in open(os.path.join(app, "stream.log"), encoding="utf-8", errors="ignore").readlines()[-5000:]:
        if " shop " in line and line[:8] >= cut: shops_hour += 1
except Exception: pass
out = {"at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "service": active,
       "status_at": st.get("at"), "watching": st.get("watching", []), "live_classic": st.get("live_classic", []),
       "shops_last_hour": shops_hour, "host": "cloud"}
print(json.dumps(out, separators=(",", ":")))
PY
)
  sha=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$API?ref=live" 2>/dev/null | "$DIR/venv/bin/python" -c "import json,sys;print(json.load(sys.stdin).get('sha',''))" 2>/dev/null)
  payload=$("$DIR/venv/bin/python" -c "import json,sys,base64;b=sys.argv[1];s=sys.argv[2];d={'message':'Stream server status','branch':'live','content':base64.b64encode(b.encode()).decode()};d.update({'sha':s} if s else {});print(json.dumps(d))" "$body" "$sha")
  code=$(curl -s -o /dev/null -w '%{http_code}' -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$payload" "$API")
  unset TOKEN
  case "$code" in 200|201) touch "$stamp"; echo "reported in";; *) echo "report failed ($code)";; esac
fi

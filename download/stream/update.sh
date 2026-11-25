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
for f in stream_reader.py plateverify.py plategaps.json shop_buttons.png platforms.py keys.sh update.sh; do
  curl -fsSL "$SITE/stream/$f" -o "$NEW/FMWatcher/$f" || ok=0
done
if [ "$ok" = 1 ] && [ -s "$NEW/FMWatcher/stream_reader.py" ] && [ -s "$NEW/FMWatcher/watcher.py" ]; then
  changed=0
  for f in "$NEW"/FMWatcher/*; do
    b=$(basename "$f")
    case "$b" in config.json|*.bat|install.*|README.txt) continue;; esac
    if [ "$b" = update.sh ] || [ "$b" = keys.sh ]; then cmp -s "$f" "$DIR/$b" || cp "$f" "$DIR/$b"; continue; fi
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
# Stream settings from maplefm.gg (download/stream/settings.json) win over the ones here, so how many channels it
# watches can change without logging in. A change restarts the reader.
if curl -fsSL "$SITE/stream/settings.json" -o "$DIR/settings.json" 2>/dev/null && [ -x "$DIR/venv/bin/python" ]; then
  if "$DIR/venv/bin/python" - "$APP/config.json" "$DIR/settings.json" <<'PY'
import json, sys
cfg = json.load(open(sys.argv[1], encoding="utf-8")); new = json.load(open(sys.argv[2], encoding="utf-8"))
st = cfg.get("streams") or {}
if all(st.get(k) == v for k, v in new.items()): sys.exit(1)
st.update(new); cfg["streams"] = st
json.dump(cfg, open(sys.argv[1], "w", encoding="utf-8"), indent=2)
PY
  then echo "stream settings changed"; restart=1; fi
fi
id clubfm >/dev/null 2>&1 && chown -R clubfm:clubfm "$DIR"
[ "${1:-}" = "--files-only" ] && exit 0
[ "${restart:-0}" = 1 ] && systemctl restart clubfm-stream && echo "reader restarted"

# Count live Classic streams on Kick and YouTube (only where keys.sh put a key); cheap, every run
if [ -x "$DIR/venv/bin/python" ] && { [ -s "$APP/kick_client.txt" ] || [ -s "$APP/youtube_key.txt" ]; }; then
  (cd "$APP" && timeout 120 "$DIR/venv/bin/python" platforms.py >/dev/null 2>&1) || echo "platform count failed"
  chown clubfm:clubfm "$APP/platforms.json" 2>/dev/null
fi

# Report in, at most once an hour
stamp="$DIR/.last_report"
if [ -s "$APP/token.txt" ] && { [ ! -f "$stamp" ] || [ $(( $(date +%s) - $(stat -c %Y "$stamp") )) -ge 3300 ]; }; then
  TOKEN=$(cat "$APP/token.txt")
  API=https://api.github.com/repos/maplefm/clubfm-archive/contents/data/stream-status.json
  active=$(systemctl is-active clubfm-stream 2>/dev/null || echo unknown)
  body=$("$DIR/venv/bin/python" - "$APP" "$active" <<'PY'
import json, sys, os, datetime, re
app, active = sys.argv[1], sys.argv[2]
st = {}
try: st = json.load(open(os.path.join(app, "stream_status.json"), encoding="utf-8"))
except Exception: pass
shops_hour = 0
cut = (datetime.datetime.now() - datetime.timedelta(hours=1)).strftime("%H:%M:%S")
try:
    for line in open(os.path.join(app, "stream.log"), encoding="utf-8", errors="ignore").readlines()[-5000:]:
        if re.match(r"\d\d:\d\d:\d\d \S+\s+shop ", line) and line[:8] >= cut: shops_hour += 1
except Exception: pass
out = {"at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "service": active,
       "status_at": st.get("at"), "watching": st.get("watching", []), "live_classic": st.get("live_classic", []),
       "shops_last_hour": shops_hour, "host": "cloud"}
if st.get("mega"): out["mega"] = st["mega"]      # megaphone lines read, reused, posted, and their CPU seconds
try:
    sys.path.insert(0, app); os.chdir(app)
    import platforms
    out["platforms"] = platforms.summary()
except Exception: pass
try:
    out["load"] = [round(x, 2) for x in os.getloadavg()]; out["cpus"] = os.cpu_count()
    m = dict(l.split(":", 1) for l in open("/proc/meminfo"))
    out["mem_used_mb"] = (int(m["MemTotal"].split()[0]) - int(m["MemAvailable"].split()[0])) // 1024
except Exception: pass
print(json.dumps(out, separators=(",", ":")))
PY
)
  sha=$(curl -fsS -H "Authorization: Bearer $TOKEN" "$API?ref=live" 2>/dev/null | "$DIR/venv/bin/python" -c "import json,sys;print(json.load(sys.stdin).get('sha',''))" 2>/dev/null)
  payload=$("$DIR/venv/bin/python" -c "import json,sys,base64;b=sys.argv[1];s=sys.argv[2];d={'message':'Stream server status','branch':'live','content':base64.b64encode(b.encode()).decode()};d.update({'sha':s} if s else {});print(json.dumps(d))" "$body" "$sha")
  code=$(curl -s -o /dev/null -w '%{http_code}' -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$payload" "$API")
  unset TOKEN
  case "$code" in 200|201) touch "$stamp"; echo "reported in";; *) echo "report failed ($code)";; esac
fi

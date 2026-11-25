#!/usr/bin/env bash
# Add the Kick and YouTube keys the stream server uses to count live MapleStory Classic streams. Run as root:
#   bash /opt/clubfm/keys.sh
# Each key is typed in (nothing shows on screen), checked against the site, and kept on this server only.
set -uo pipefail
APP=/opt/clubfm/app; PY=/opt/clubfm/venv/bin/python
[ "$(id -u)" = 0 ] || { echo "Run this as root."; exit 1; }
umask 077
echo "Kick: paste the Client ID (press Enter to skip Kick):"
read -rs KID </dev/tty; echo
if [ -n "$KID" ]; then
  echo "Kick: paste the Client Secret:"
  read -rs KSEC </dev/tty; echo
  printf '%s\n%s\n' "$(printf '%s' "$KID" | tr -d '[:space:]')" "$(printf '%s' "$KSEC" | tr -d '[:space:]')" > "$APP/kick_client.txt"; unset KID KSEC
fi
echo "YouTube: paste the API key (press Enter to skip YouTube):"
read -rs YK </dev/tty; echo
[ -n "$YK" ] && { printf '%s\n' "$(printf '%s' "$YK" | tr -d '[:space:]')" > "$APP/youtube_key.txt"; unset YK; }
chown clubfm:clubfm "$APP"/kick_client.txt "$APP"/youtube_key.txt 2>/dev/null
echo "Checking them now..."
cd "$APP" && "$PY" - <<'PY'
import json, subprocess, sys
r = subprocess.run([sys.executable, "platforms.py"], capture_output=True, text=True, timeout=120)
try: s = json.loads(r.stdout.strip().splitlines()[-1])
except Exception: print("The check didn't run:", (r.stderr or r.stdout)[-300:]); sys.exit(1)
for p in ("kick", "youtube"):
    v = s.get(p) or {}
    if v.get("error") == "no key": print(f"{p}: skipped, no key")
    elif "error" in v: print(f"{p}: NOT working: {v['error']}")
    else: print(f"{p}: working. {v['live']} MapleStory streams live right now, {v['classic']} say Classic")
PY
chown clubfm:clubfm "$APP/platforms.json" 2>/dev/null
echo "Done. The server counts every 15 minutes from now on."

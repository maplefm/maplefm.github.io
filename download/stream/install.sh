#!/usr/bin/env bash
# Club FM stream reader, set up on a fresh Ubuntu server (Hetzner, 24.04). Run as root:
#   curl -fsSL https://maplefm.gg/download/stream/install.sh | bash
# It installs the reader from maplefm.gg, asks once for the GitHub upload key (typed in, never shown or sent
# anywhere but GitHub), and runs it as a service that restarts itself. Running it again updates everything and
# keeps the key. Nothing here touches the game: it only reads public Twitch video.
set -euo pipefail
main() {
SITE="https://maplefm.gg/download"
DIR=/opt/clubfm
say() { printf '\n== %s\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "Run this as root."; exit 1; }

say "Installing system packages (a minute or two)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip tesseract-ocr ffmpeg unzip curl ca-certificates >/dev/null

id clubfm >/dev/null 2>&1 || useradd --system --home "$DIR" --shell /usr/sbin/nologin clubfm
mkdir -p "$DIR"

say "Getting the reader from maplefm.gg"
bash -c "$(curl -fsSL "$SITE/stream/update.sh")" -- --files-only

say "Python packages (a few minutes the first time)"
[ -x "$DIR/venv/bin/python" ] || python3 -m venv "$DIR/venv"
"$DIR/venv/bin/pip" install -q --upgrade pip
"$DIR/venv/bin/pip" install -q streamlink imageio-ffmpeg opencv-python-headless pillow numpy rapidocr-onnxruntime

if [ ! -s "$DIR/app/token.txt" ]; then
  say "Upload key"
  echo "Paste the GitHub token you made (it will not show on screen), then press Enter:"
  read -rs TOKEN </dev/tty; echo
  TOKEN="$(printf '%s' "$TOKEN" | tr -d '[:space:]')"
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $TOKEN" https://api.github.com/repos/maplefm/clubfm-archive/contents/data/streams.json?ref=live)
  if [ "$code" != 200 ]; then echo "GitHub did not accept that token (answer $code). Check it can read and write clubfm-archive, then run this again."; exit 1; fi
  umask 077; printf '%s' "$TOKEN" > "$DIR/app/token.txt"; unset TOKEN
  echo "Key accepted."
fi
chown -R clubfm:clubfm "$DIR"; chmod 600 "$DIR/app/token.txt"

say "Starting it"
cat > /etc/systemd/system/clubfm-stream.service <<'EOF'
[Unit]
Description=Club FM stream reader
After=network-online.target
Wants=network-online.target
[Service]
User=clubfm
WorkingDirectory=/opt/clubfm/app
ExecStart=/opt/clubfm/venv/bin/python -u stream_reader.py
Restart=always
RestartSec=10
Nice=5
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/clubfm-update.service <<'EOF'
[Unit]
Description=Club FM stream reader update and heartbeat
[Service]
Type=oneshot
ExecStart=/bin/bash /opt/clubfm/update.sh
EOF
cat > /etc/systemd/system/clubfm-update.timer <<'EOF'
[Unit]
Description=Club FM stream reader: check for updates and report in, every 15 minutes
[Timer]
OnBootSec=3min
OnUnitActiveSec=15min
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable -q --now clubfm-update.timer
systemctl enable -q clubfm-stream
systemctl restart clubfm-stream

for i in $(seq 1 30); do
  if grep -q "Stream Reader started" "$DIR/app/stream.log" 2>/dev/null; then break; fi
  sleep 2
done
if systemctl is-active -q clubfm-stream && grep -q "Stream Reader started" "$DIR/app/stream.log" 2>/dev/null; then
  /bin/bash "$DIR/update.sh" || true
  echo; echo "Club FM stream reader is running."; echo "Last lines of its log:"; tail -n 5 "$DIR/app/stream.log"
else
  echo; echo "It did not start. Last lines:"; journalctl -u clubfm-stream -n 20 --no-pager; exit 1
fi
}
main "$@"

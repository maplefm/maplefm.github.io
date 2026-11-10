"""Start scheduled jobs on time from the always-running pump.

GitHub runs these crons 6 to 8 hours late, and the Worker's job starter (GH_JOBS in worker/src/index.js) has no
GH_DISPATCH token, so it never starts anything. The pump calls this every 10 minutes: a job whose Eastern start time
has passed today, inside its window, with no run of that workflow created since that time, gets started once.
Runs started by GitHub's own cron count too, so nothing runs twice for the same slot.

  python3 tools/jobstart.py OWNER/REPO [--dry]
"""
import datetime, json, subprocess, sys
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
# wf, Eastern start hour, hours the window stays open, weekday (Mon=0) or None for every day
JOBS = [
    ("report.yml", 0, 10, None),   # market close, right after midnight; report.py closes the day before until noon
    ("seo.yml", 7, 6, 0),          # Monday search check
]


def runs_since(repo, wf, since):
    out = subprocess.run(["gh", "run", "list", "-R", repo, "--workflow", wf, "--json", "createdAt", "--limit", "10"],
                         capture_output=True, text=True, timeout=60)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip()[:200])
    for r in json.loads(out.stdout or "[]"):
        t = datetime.datetime.fromisoformat(r["createdAt"].replace("Z", "+00:00"))
        if t >= since:
            return True
    return False


def due(now):
    for wf, hour, span, dow in JOBS:
        if dow is not None and now.weekday() != dow:
            continue
        start = now.replace(hour=hour, minute=0, second=0, microsecond=0)
        if start <= now < start + datetime.timedelta(hours=span):
            yield wf, start


def main():
    repo, dry = sys.argv[1], "--dry" in sys.argv
    now = datetime.datetime.now(ET)
    for wf, start in due(now):
        try:
            if runs_since(repo, wf, start.astimezone(datetime.timezone.utc)):
                continue
            print("jobstart: starting", wf, "for", start.isoformat())
            if not dry:
                subprocess.run(["gh", "workflow", "run", wf, "--ref", "main", "-R", repo], timeout=60, check=False)
        except Exception as e:
            print("jobstart:", wf, e)


if __name__ == "__main__":
    main()

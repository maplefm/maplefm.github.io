"""Count live MapleStory Classic streams on Kick and YouTube, without watching them, so the owner can decide with real
numbers whether the stream server should read those sites too. Run every 15 minutes by update.sh.

Keys (made by the owner, put on the server by keys.sh, never in the repo):
  kick_client.txt    Kick app client id and secret, one per line (kick.com, Settings, Developer)
  youtube_key.txt    YouTube Data API key (Google Cloud console)
Both are optional: a site without a key is skipped and reported as "no key".

Writes platforms.json beside it: {"samples": [{"at", "kick": {...}, "youtube": {...}}]}, 7 days kept.
Uses only the sites' official APIs. YouTube allows 10,000 units a day; one search is 100, so 96 a day fits."""
import json, os, re, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "platforms.json")
UA = {"User-Agent": "ClubFM stream counter (maplefm.gg)"}


def stream_rules():
    try:
        import stream_reader as SR
        d = dict(SR.STREAM_DEFAULTS)
    except Exception:
        d = {"title_must_match": r"classic|\bmscw\b|\bcw\b", "title_must_not_match": r"kronos|hyperion|reboot|heroic|artale"}
    try:
        d.update((json.load(open(os.path.join(HERE, "config.json"), encoding="utf-8")).get("streams") or {}))
    except Exception:
        pass
    return re.compile(d["title_must_match"], re.I), re.compile(d["title_must_not_match"], re.I)


def req(url, data=None, headers=None, timeout=20):
    h = dict(UA); h.update(headers or {})
    r = urllib.request.Request(url, data=data, headers=h)
    with urllib.request.urlopen(r, timeout=timeout) as f:
        return json.load(f)


def read_key(name):
    try:
        return [l.strip() for l in open(os.path.join(HERE, name), encoding="utf-8") if l.strip()]
    except OSError:
        return []


def sort(items, yes, no):
    """items: [(name, title, viewers)] -> counts, with the Classic ones named"""
    classic = [(n, v) for n, t, v in items if yes.search(t or "") and not no.search(t or "")]
    classic.sort(key=lambda x: -(x[1] or 0))
    return {"live": len(items), "classic": len(classic), "classic_viewers": sum(v or 0 for _, v in classic),
            "names": [n for n, _ in classic[:25]]}


def kick(yes, no):
    k = read_key("kick_client.txt")
    if len(k) < 2:
        return {"error": "no key"}
    body = urllib.parse.urlencode({"grant_type": "client_credentials", "client_id": k[0], "client_secret": k[1]}).encode()
    tok = req("https://id.kick.com/oauth/token", data=body, headers={"Content-Type": "application/x-www-form-urlencoded"})["access_token"]
    auth = {"Authorization": "Bearer " + tok, "Accept": "application/json"}
    cats = req("https://api.kick.com/public/v1/categories?q=" + urllib.parse.quote("MapleStory"), headers=auth).get("data") or []
    ids = [c["id"] for c in cats if "maplestory" in str(c.get("name", "")).lower().replace(" ", "")]
    items = []
    for cid in ids[:3]:
        for s in req(f"https://api.kick.com/public/v1/livestreams?category_id={cid}&limit=100", headers=auth).get("data") or []:
            items.append((s.get("slug") or str(s.get("broadcaster_user_id")), s.get("stream_title") or "", s.get("viewer_count") or 0))
    out = sort(items, yes, no); out["categories"] = len(ids)
    return out


def youtube(yes, no):
    k = read_key("youtube_key.txt")
    if not k:
        return {"error": "no key"}
    q = urllib.parse.urlencode({"part": "snippet", "eventType": "live", "type": "video", "maxResults": 50,
                                "q": "maplestory classic", "key": k[0]})
    items = []
    for it in req("https://www.googleapis.com/youtube/v3/search?" + q).get("items") or []:
        sn = it.get("snippet") or {}
        items.append((sn.get("channelTitle") or "", sn.get("title") or "", 0))   # search gives no viewer counts
    return sort(items, yes, no)


def main():
    yes, no = stream_rules()
    sample = {"at": int(time.time())}
    for name, fn in (("kick", kick), ("youtube", youtube)):
        try:
            sample[name] = fn(yes, no)
        except Exception as e:
            msg = type(e).__name__ + ": " + str(e)
            try:   # Google and Kick put the reason in the body; keep it so a 403 can be told apart
                b = json.loads(e.read().decode("utf-8", "replace"))
                er = b.get("error") or {}
                if isinstance(er, dict):
                    rs = [x.get("reason") for x in er.get("errors") or [] if x.get("reason")]
                    for x in er.get("details") or []:
                        if x.get("reason"):
                            rs.append(x["reason"])
                    msg += " | " + ",".join(rs) + " | " + str(er.get("message") or "")
                else:
                    msg += " | " + str(er)
            except Exception:
                pass
            for k in read_key("youtube_key.txt") + read_key("kick_client.txt"):
                msg = msg.replace(k, "***")
            sample[name] = {"error": msg[:300]}
    try:
        d = json.load(open(OUT, encoding="utf-8"))
    except Exception:
        d = {"samples": []}
    d["samples"] = [s for s in d["samples"] if s["at"] > time.time() - 7 * 86400] + [sample]
    json.dump(d, open(OUT, "w", encoding="utf-8"), separators=(",", ":"))
    print(json.dumps(sample))


def summary():
    """For the hourly report: the newest sample and the last 24 hours' peaks."""
    try:
        ss = json.load(open(OUT, encoding="utf-8"))["samples"]
    except Exception:
        return None
    day = [s for s in ss if s["at"] > time.time() - 86400]
    out = {"samples_24h": len(day), "latest": ss[-1] if ss else None}
    for p in ("kick", "youtube"):
        c = [s[p].get("classic", 0) for s in day if isinstance(s.get(p), dict) and "classic" in s[p]]
        names = sorted({n for s in day for n in ((s.get(p) or {}).get("names") or [])})
        out[p] = {"peak_classic": max(c) if c else None, "avg_classic": round(sum(c) / len(c), 1) if c else None, "channels_24h": names[:40]}
    return out


if __name__ == "__main__":
    if "--summary" in sys.argv:
        print(json.dumps(summary()))
    else:
        main()

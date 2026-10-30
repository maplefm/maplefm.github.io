"""Browser scanner glue: the same readers FM Watcher uses (fmparse, glyphs, tipexact), run on frames of a shared game
window. Nothing here reads differently from the watcher; this only finds the game area in the shared picture, the
shop, the in-game pointer and the hovered row, and keeps track of what changed.

frame(rgba bytes, width, height) -> JSON text:
  {"shop": None | {"seller", "rows": [{i, p, q, so}], "room"}, "tip": None | {"row", "item", "stats"}, "why": "..."}
"""
import io, json, re, hashlib
from PIL import Image
import fmparse, glyphs, tipexact
import watcher            # the watcher's own listing store and inbox sender: same rules for what counts and what goes up

REF = (1920, 1080)
SHOP_REGION = (696, 311, 939, 707)       # FM Watcher's defaults, measured on a 1920 x 1080 game
ROOM_REGION = (60, 20, 400, 60)
BAR_REGION = (0, 0, 360, 30)
CUR = json.load(open(watcher.HERE + "/cursor.json"))
STORE = None


def store():
    global STORE
    if STORE is None: STORE = watcher.Store(watcher.HERE + "/watcher_data_v2.json", 2)
    return STORE
STATE = {"off": None, "room_hash": None, "room": "", "shop_hash": None, "tip_key": None, "rows": {}, "hover": None}


def shop_box(w, h, ox, oy):
    """Where the shop window sits in a w x h game: kept relative to the centre, like FM Watcher's place()."""
    dx, dy = (w - REF[0]) // 2, (h - REF[1]) // 2
    s = SHOP_REGION
    return (s[0] + dx + ox, s[1] + dy + oy, s[2] + dx + ox, s[3] + dy + oy)


def find_shop(img, fw=None, x0=0):
    """The shop window: where FM Watcher expects it, allowing for a title bar or border around a shared window.
    The offset that worked is remembered so later frames only look there. img may be a strip of the frame starting
    at x0 (the page sends only the middle of the game, where the shop and its popups are); fw is the frame's width."""
    h = img.size[1]; w = fw or img.size[0]
    tries = [STATE["off"]] if STATE["off"] else []
    # nearest first: a window shared without borders needs no offset at all
    tries += sorted(((ox, oy) for oy in range(0, 48) for ox in range(-8, 9)), key=lambda t: abs(t[0]) + abs(t[1]))
    seen = set()
    for t in tries:
        if t is None or t in seen: continue
        seen.add(t)
        # the game area itself is the frame minus the offset: the shop is centred in that, not in the frame
        gw, gh = w - max(0, t[0]) * 2, h - t[1]
        b = shop_box(gw, gh, t[0], t[1])
        b = (b[0] - x0, b[1], b[2] - x0, b[3])
        if b[0] < 0 or b[1] < 0 or b[2] > img.size[0] or b[3] > h: continue
        crop = img.crop(b)
        # the navy name plate is a loose check; the seller's name reading exactly in the game's font pins it down
        if fmparse.looks_like_shop(crop) and glyphs.read_seller(crop.crop(fmparse.SHOP["seller"])):
            STATE["off"] = t
            return crop, b
        if STATE["off"] and t == STATE["off"]: break   # the shop is closed; don't search every frame
    return None, None


def read_rows(region):
    """Every row read exactly in the game's font (price, name, sold); a row that isn't certain is left out."""
    S = fmparse.SHOP
    seller = glyphs.read_seller(region.crop(S["seller"]))
    if not seller or len(seller) < 2: return None
    rows = []
    for y, grey in fmparse._shop_rows(region):
        tile = region.crop((S["x0"], y, S["x1"], y + 38))
        gp = glyphs.read_price(tile)
        if not gp: continue
        name, known = fmparse.glyph_item(glyphs.read_name(tile))
        if not known: continue
        rows.append({"i": name, "p": gp[1], "q": gp[0], "so": bool(grey), "known": True, "y": y})
    if not rows: return {"seller": seller, "rows": []}
    res = fmparse.resolve_tiers(region, {"title": "", "seller": seller, "rows": rows, "dropped": 0, "fast": True})
    return res


def find_cursor(img, box):
    """The game's own pointing hand, inside the shop list: its outline is the same few pixels every time.
    Every spot is checked at once (numpy): the hand is where at least all but 3 of its outline pixels are near black."""
    import numpy as np
    blk = CUR["black"]; w, h = img.size
    x0, y0 = max(0, box[0]), max(4, box[1] + int(fmparse.SHOP["row0"]) - 4)
    x1, y1 = min(w - 24, box[2]), min(h - 25, box[1] + int(fmparse.SHOP["row0"] + fmparse.SHOP["pitch"] * fmparse.SHOP["rows"]))
    if x1 <= x0 or y1 <= y0: return None
    mx = max(dx for dx, dy in blk); my = max(dy for dx, dy in blk); ny = min(dy for dx, dy in blk)   # outline reaches above its anchor
    a = np.asarray(img.crop((x0, y0 + ny, min(w, x1 + mx + 1), min(h, y1 + my + 1))))
    dark = (a < 40).all(axis=2)
    H, W = y1 - y0, x1 - x0
    cnt = np.zeros((H, W), np.int16)
    for dx, dy in blk:
        sl = dark[dy - ny:dy - ny + H, dx:dx + W]
        cnt[:sl.shape[0], :sl.shape[1]] += sl
    hit = np.argwhere(cnt >= len(blk) - 3)
    if not len(hit): return None
    yy, xx = hit[0]                     # the first in reading order, as the loop it replaces found it
    return int(x0 + xx), int(y0 + yy)


def hovered(img, box):
    """(row index, popup picture) when the pointer rests on a shop row and its popup is drawn; else None."""
    c = find_cursor(img, box)
    if not c: return None
    S = fmparse.SHOP; ry = c[1] - box[1]
    idx = int((ry - S["row0"]) // S["pitch"])
    if not (0 <= idx < S["rows"]): return None
    w, h = img.size
    tb = (max(0, c[0] - 10), max(0, c[1] - 340), min(w, c[0] + 380), min(h, c[1] + 520))
    tip = img.crop(tb)
    if not fmparse._tip_panel(tip): return None          # no popup drawn yet
    return idx, tip


def exact_popup(tip):
    """The popup's stat lines read pixel for pixel in the game's font (tipexact), no text reader. Only a popup whose
    every line reads exactly comes back; anything less is None, and the browser keeps nothing from it."""
    box = fmparse._tip_panel(tip)
    if not box: return None
    ex = tipexact.read_tip(tip.crop(box))
    if not ex or ex["bad"] or not any(l.get("stat") for l in ex["lines"]): return None
    st = dict(ex["stats"]); st["_ex"] = 1
    return st


def _raw(buf):
    """Pixels from the page: a JavaScript array arrives as a proxy, copied across in one go."""
    return buf.to_bytes() if hasattr(buf, "to_bytes") else bytes(buf)


def frame(buf, w, h, x0=0, fw=0, room=None):
    """buf: RGBA pixels, w x h. x0, fw: buf is the strip of a fw-wide frame starting at x0. room: the minimap
    title's RGBA pixels (340 x 40, the frame's ROOM_REGION) when the strip leaves it out."""
    img = Image.frombuffer("RGBA", (w, h), _raw(buf), "raw", "RGBA", 0, 1).convert("RGB")
    shop, box = find_shop(img, fw or w, x0)
    if shop is None:
        STATE["hover"] = None
        return json.dumps({"shop": None, "why": "no shop open"})
    # the minimap title names the room: read again only when it changed
    if room is not None:
        rw, rh = ROOM_REGION[2] - ROOM_REGION[0], ROOM_REGION[3] - ROOM_REGION[1]
        room_img = Image.frombuffer("RGBA", (rw, rh), _raw(room), "raw", "RGBA", 0, 1).convert("RGB")
    else:
        room_img = img.crop(ROOM_REGION)
    rh = hashlib.md5(room_img.resize((40, 8)).tobytes()).hexdigest()
    if rh != STATE["room_hash"]:
        STATE["room_hash"] = rh
        try: STATE["room"] = fmparse.read_room(room_img)
        except Exception: STATE["room"] = ""
    out = {"shop": None, "tip": None}
    sh = hashlib.md5(shop.tobytes()).hexdigest()
    if sh == STATE["shop_hash"] and STATE.get("res") is not None:
        res = dict(STATE["res"], rows=[dict(r) for r in STATE["res"]["rows"]]); out["same"] = True
    else:
        res = read_rows(shop)
        STATE["shop_hash"], STATE["res"] = sh, (dict(res, rows=[dict(r) for r in res["rows"]]) if res else None)
    if res:
        res["room"] = STATE["room"]; res["dropped"] = 0; res["tip"] = None
        out["shop"] = {"seller": res["seller"], "room": res["room"], "rows": [{k: r[k] for k in ("i", "p", "q", "so")} for r in res["rows"]]}
        # a scrolled or changed list makes every remembered row suspect: start over unless all visible rows agree
        mem = STATE["rows"].get(res["seller"]) or {}
        key = lambda r: (r["i"], r["p"], r["q"])
        if any(r["y"] in mem and key(mem[r["y"]]) != key(r) for r in res["rows"]) or not res["rows"]: mem = {}
        STATE["rows"] = {res["seller"]: mem}          # one shop at a time
        for r in res["rows"]: mem[r["y"]] = r
        hv = hovered(img, box)
        tiprow = None
        prev, STATE["hover"] = STATE.get("hover"), None
        if hv:
            idx, tip = hv
            # the same exact read, on the same row, two frames running: a popup still showing the last row while the
            # pointer moves on never counts
            st = exact_popup(tip)
            STATE["hover"] = (res["seller"], idx, json.dumps(st, sort_keys=True)) if st else None
            y = int(round(fmparse.SHOP["row0"] + fmparse.SHOP["pitch"] * idx))
            row = next((r for yy, r in mem.items() if abs(yy - y) < 2), None)
            if st is None:
                out["tip"] = {"row": idx, "skip": "popup not read exactly"}
            elif prev != STATE["hover"]:
                out["tip"] = {"row": idx, "wait": True}
            elif not row:
                out["tip"] = {"row": idx, "skip": "row not read yet"}
            else:
                # once per popup, the text reader for the title: it carries the upgrades count "(+7)" and names the item
                t = None
                try: t = fmparse.read_tooltip(tip)
                except Exception: t = None
                tn = re.sub(r"\s*\(\+\d+\)\s*$", "", (t or {}).get("name") or "")
                a_, b_ = fmparse.norm(row["i"]), fmparse.norm(tn)
                if t and "UP" in t["stats"]: st["UP"] = t["stats"]["UP"]
                if b_ and not b_.startswith(a_[:8]) and fmparse._known_name(tn):
                    ok, why = False, "popup names another item"
                else:
                    ok, why = fmparse.exact_fits(row["i"], st)
                if not ok:
                    out["tip"] = {"row": idx, "skip": why}
                else:
                    st["_ok"] = 1
                    out["tip"] = {"row": idx, "item": row["i"], "p": row["p"], "q": row["q"], "stats": st}
                    res["tip"] = {"name": row["i"], "stats": st, "lines": [], "row": idx}; tiprow = row
        if res["rows"]:
            S = store()
            S.add_shop(res)
            if res["tip"]:
                rows = res["rows"] if any(r["y"] == tiprow["y"] for r in res["rows"]) else res["rows"] + [tiprow]
                hit = S.add_tooltip(dict(res, rows=rows))
                out["tip"]["kept"] = bool(hit and hit != "pending")
            S.flush_pending(res)
    return json.dumps(out)


def publish(name="", ign=""):
    """What FM Watcher would send now: the same listings, the same signed inbox posts (sent by the patched urlopen)."""
    S = store()
    return bool(watcher.send_inbox({"name": name, "ign": ign}, S.published_docs()))


def counts():
    """New listings, shops and sales caught in the last hour and today, as FM Watcher's own scan stats."""
    try: return json.dumps(watcher.scan_stats(store()))
    except Exception as e: return json.dumps({"error": str(e)})


def save():
    S = store()
    if S.dirty: S.dirty = False; S.save()

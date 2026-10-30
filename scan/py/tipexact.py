"""Exact popup reader. The game draws popup text in four exact colours (cream labels and base, white values, blue
and red gains); edge pixels blend with whatever is behind the popup but the exact ones never change, so every character
has one fixed pattern of exact pixels (tipglyphs.json). Each stat line is read by sliding those patterns along it: a
character reads only when its pattern matches exactly and nothing else of that colour is in its box. A line that
doesn't read completely, or whose value isn't base plus gain, is reported as bad and never guessed."""
import json, re, os
def core(p):
    r, g, b = p
    if r >= 252 and g >= 252 and b >= 252: return "W"
    if r >= 250 and 232 <= g <= 246 and 198 <= b <= 214: return "C"
    if 168 <= r <= 182 and 166 <= g <= 180 and b >= 248: return "P"
    if r >= 250 and g <= 10 and 95 <= b <= 110: return "M"
    return ""

HERE = os.path.dirname(os.path.abspath(__file__))
TPL = json.load(open(os.path.join(HERE, "tipglyphs.json")))
ROWS = 15
GAP_END = 9
_T = {}
for t in TPL:
    _T.setdefault(t["c"], []).append((t["ch"], [[ch == "1" for ch in col] for col in t["cols"]]))
for c in _T: _T[c].sort(key=lambda x: -len(x[1]))
def bullets(im):
    px = im.load(); w, h = im.size; hits = []
    for y in range(h):
        for x in range(0, min(w, 60)):
            r, g, b = px[x, y]
            if r >= 225 and 95 <= g <= 125 and b <= 35: hits.append((x, y)); break
    out = []
    for x, y in hits:
        if out and y - out[-1][2] <= 1 and abs(x - out[-1][0]) <= 2: out[-1][2] = y
        else: out.append([x, y, y])
    return [(x, (y0 + y1) // 2) for x, y0, y1 in out if 2 <= y1 - y0 + 1 <= 5]
def read_line(im, bx, by):
    px = im.load(); w, h = im.size
    if by - 7 < 0 or by + 8 > h: return None
    x0 = bx + 4
    grid = [[core(px[x, y]) for y in range(by - 7, by + 8)] for x in range(x0, w)]
    out = []; x = 0; n = len(grid)
    while x < n:
        cs = {c for c in grid[x] if c}
        if not cs: x += 1; continue
        hit = None
        for c in cs:
            for ch, cols in _T.get(c, []):
                wd = len(cols)
                if x + wd > n: continue
                ok = True
                for dx in range(wd):
                    col = grid[x + dx]; tc = cols[dx]
                    for dy in range(ROWS):
                        if tc[dy] != (col[dy] == c): ok = False; break
                    if not ok: break
                if ok: hit = (ch, wd, c); break
            if hit: break
        if hit:
            out.append((hit[0], hit[2], x)); x += hit[1]
        else:
            c = sorted(cs)[0]; out.append(("?", c, x))
            while x < n and any(grid[x]): x += 1           # skip to the next gap
    # the line ends at the first wide gap: words in a stat line sit a few pixels apart, so anything further right is
    # something else on screen (chat, a name tag) drawn over the popup
    cut = len(out)
    colon = next((i for i, o in enumerate(out) if o[0] == ":"), len(out))
    for i in range(colon + 2, len(out)):
        prev_end = out[i - 1][2] + 1
        gap = out[i][2] - prev_end
        if out[i][0] == "(" and gap < 24: continue          # the bracket after a value sits a little further out
        if gap >= GAP_END: cut = i; break
    return [(ch, c) for ch, c, _ in out[:cut]]
LABELS = {"STR": "STR", "DEX": "DEX", "INT": "INT", "lNT": "INT", "LUK": "LUK", "MaxHP": "HP", "MaxMP": "MP", "WeaponAttack": "ATT", "MagicAttack": "MATT",
          "WeaponDef.": "WDEF", "MagicDef.": "MDEF", "Accuracy": "ACC", "Avoidability": "AVOID", "Evasion": "AVOID", "Speed": "SPEED", "Jump": "JUMP",
          "CriticalRate": "CRIT", "CriticalDamage": "CRITDMG", "RemainingEnhancements": "SLOTS"}
NONSTAT = ("Type", "AttackSpeed", "KnockbackChance")
def parse(chars):
    """('W','+'),('W','3')... -> {stat, v, b, g, exact_gain} or a reason it can't be trusted"""
    s = "".join(ch for ch, c in chars); cs = "".join(c for ch, c in chars)
    m = re.match(r"^([A-Za-z.]+):", s)
    if not m: return {"bad": "label", "text": s}
    label = m.group(1)
    if label in NONSTAT or label.startswith(NONSTAT): return {"skip": label}
    k = LABELS.get(label)
    if not k: return {"bad": "label", "text": s}
    rest = s[m.end():]; rc = cs[m.end():]
    mv = re.match(r"^\+?(\d{1,3})", rest)
    if not mv or (k != "SLOTS" and not rest.startswith("+")): return {"bad": "value", "stat": k, "text": s}
    if any(c != "W" for c in rc[:mv.end()]): return {"bad": "value", "stat": k, "text": s}
    v = int(mv.group(1)); rest2 = rest[mv.end():]
    if not rest2: return {"stat": k, "v": v}
    mb = re.match(r"^\((\d{1,3})([+-])([\d?]{1,3})\)$", rest2)
    if not mb: return {"bad": "after", "stat": k, "v": v, "text": s}
    b = int(mb.group(1)); sign = mb.group(2); gd = mb.group(3)
    g = v - b
    if (sign == "+") != (g > 0): return {"bad": "sign", "stat": k, "text": s}
    if "?" not in gd:
        if abs(g) != int(gd): return {"bad": "sum", "stat": k, "text": s}
        return {"stat": k, "v": v, "b": b, "g": g, "gx": True}
    if len(gd) != len(str(abs(g))): return {"bad": "gainlen", "stat": k, "text": s}
    return {"stat": k, "v": v, "b": b, "g": g, "gx": False}
def read_tip(panel):
    lines = []
    for bx, by in bullets(panel):
        ch = read_line(panel, bx, by)
        if ch is None: lines.append({"bad": "edge"}); continue
        p = parse(ch); p["y"] = by; lines.append(p)
    stats = {}; bad = [l for l in lines if "bad" in l]
    for l in lines:
        if "stat" in l and "bad" not in l:
            stats[l["stat"]] = l["v"]
            if "b" in l: stats[l["stat"] + "_b"] = l["b"]
    return {"stats": stats, "lines": lines, "bad": bad}

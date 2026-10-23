"""Club FM animated emoji: an original mascot (Clubby, a round purple blob wearing the Club FM crown) plus meme
pieces. Every frame is an SVG; render.py turns frames into GIFs."""
import math
OL = "#24104f"   # outline
W = 6

DEFS = """<defs>
<radialGradient id="body" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#b79bff"/><stop offset=".45" stop-color="#8457f0"/><stop offset="1" stop-color="#4b1fb0"/></radialGradient>
<radialGradient id="bodyred" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#ffb0a0"/><stop offset=".45" stop-color="#f0504a"/><stop offset="1" stop-color="#a01826"/></radialGradient>
<radialGradient id="bodyblue" cx="38%" cy="30%" r="75%"><stop offset="0" stop-color="#cfe0ff"/><stop offset=".45" stop-color="#7f9ef0"/><stop offset="1" stop-color="#3d58b8"/></radialGradient>
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a0"/><stop offset=".5" stop-color="#f5c542"/><stop offset="1" stop-color="#c98a12"/></linearGradient>
<radialGradient id="coin" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#fff3bf"/><stop offset=".5" stop-color="#f7c843"/><stop offset="1" stop-color="#c58a10"/></radialGradient>
<linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff8e1"/><stop offset="1" stop-color="#e8c98a"/></linearGradient>
<linearGradient id="shades" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3a4a"/><stop offset="1" stop-color="#0d0d14"/></linearGradient>
<radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff7c2" stop-opacity="1"/><stop offset="1" stop-color="#ffd84a" stop-opacity="0"/></radialGradient>
</defs>"""

def svg(body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">{DEFS}{body}</svg>'

def crown(x, y, s=1.0, rot=0):
    return (f'<g transform="translate({x},{y}) rotate({rot}) scale({s})">'
            f'<path d="M-20 6 L-22 -14 L-10 -4 L0 -20 L10 -4 L22 -14 L20 6 Z" fill="url(#gold)" stroke="{OL}" stroke-width="4" stroke-linejoin="round"/>'
            f'<rect x="-21" y="3" width="42" height="9" rx="3" fill="#e3a921" stroke="{OL}" stroke-width="4"/>'
            f'<circle cx="0" cy="-4" r="3.6" fill="#b07cff" stroke="{OL}" stroke-width="2"/></g>')

def eyes(kind, cx, cy, look=0):
    lx, rx = cx - 15, cx + 15
    if kind == "x":
        d = ""
        for ex in (lx, rx):
            d += f'<path d="M{ex-6} {cy-6} L{ex+6} {cy+6} M{ex+6} {cy-6} L{ex-6} {cy+6}" stroke="{OL}" stroke-width="5" stroke-linecap="round"/>'
        return d
    if kind == "heart":
        d = ""
        for ex in (lx, rx):
            d += f'<path d="M{ex} {cy+8} C{ex-14} {cy-2} {ex-8} {cy-12} {ex} {cy-4} C{ex+8} {cy-12} {ex+14} {cy-2} {ex} {cy+8} Z" fill="#ff4f7b" stroke="{OL}" stroke-width="3"/>'
        return d
    if kind == "happy":   # ^ ^
        return "".join(f'<path d="M{ex-7} {cy+3} Q{ex} {cy-7} {ex+7} {cy+3}" fill="none" stroke="{OL}" stroke-width="5" stroke-linecap="round"/>' for ex in (lx, rx))
    if kind == "closed":
        return "".join(f'<path d="M{ex-7} {cy} Q{ex} {cy+5} {ex+7} {cy}" fill="none" stroke="{OL}" stroke-width="5" stroke-linecap="round"/>' for ex in (lx, rx))
    if kind == "angry":
        d = ""
        for i, ex in enumerate((lx, rx)):
            d += f'<ellipse cx="{ex}" cy="{cy+2}" rx="7" ry="8" fill="#fff" stroke="{OL}" stroke-width="3"/><circle cx="{ex+look}" cy="{cy+4}" r="3.6" fill="{OL}"/>'
            sl = 1 if i == 0 else -1
            d += f'<path d="M{ex-9} {cy-9+sl*4} L{ex+9} {cy-9-sl*4}" stroke="{OL}" stroke-width="5" stroke-linecap="round"/>'
        return d
    if kind == "sad":
        d = ""
        for i, ex in enumerate((lx, rx)):
            d += f'<ellipse cx="{ex}" cy="{cy+2}" rx="7" ry="8.5" fill="#fff" stroke="{OL}" stroke-width="3"/><circle cx="{ex+look}" cy="{cy+5}" r="4" fill="{OL}"/><circle cx="{ex+look-1.5}" cy="{cy+3}" r="1.4" fill="#fff"/>'
            sl = 1 if i == 0 else -1
            d += f'<path d="M{ex-8} {cy-8+sl*3} L{ex+8} {cy-8-sl*3}" stroke="{OL}" stroke-width="4" stroke-linecap="round"/>'
        return d
    if kind == "wide":
        return "".join(f'<ellipse cx="{ex}" cy="{cy}" rx="8.5" ry="10" fill="#fff" stroke="{OL}" stroke-width="3"/><circle cx="{ex+look}" cy="{cy+1}" r="2.6" fill="{OL}"/>' for ex in (lx, rx))
    # normal
    return "".join(f'<ellipse cx="{ex}" cy="{cy}" rx="7.5" ry="9" fill="#fff" stroke="{OL}" stroke-width="3"/><circle cx="{ex+look}" cy="{cy+1.5}" r="4.4" fill="{OL}"/><circle cx="{ex+look-1.6}" cy="{cy-0.8}" r="1.6" fill="#fff"/>' for ex in (lx, rx))

def mouth(kind, cx, cy, open_=0.0):
    if kind == "smile":
        return f'<path d="M{cx-9} {cy} Q{cx} {cy+9} {cx+9} {cy}" fill="none" stroke="{OL}" stroke-width="4" stroke-linecap="round"/>'
    if kind == "grin":
        return f'<path d="M{cx-12} {cy-2} Q{cx} {cy+16} {cx+12} {cy-2} Z" fill="#7a1840" stroke="{OL}" stroke-width="3.5" stroke-linejoin="round"/><path d="M{cx-6} {cy+6} Q{cx} {cy+12} {cx+6} {cy+6}" fill="#ff7a9a"/>'
    if kind == "open":
        h = 4 + 10 * open_
        return f'<ellipse cx="{cx}" cy="{cy+3}" rx="8" ry="{h/2+2}" fill="#7a1840" stroke="{OL}" stroke-width="3.5"/><ellipse cx="{cx}" cy="{cy+3+h/4}" rx="5" ry="{h/5+1}" fill="#ff7a9a"/>'
    if kind == "o":
        return f'<ellipse cx="{cx}" cy="{cy+3}" rx="5" ry="6" fill="#7a1840" stroke="{OL}" stroke-width="3.5"/>'
    if kind == "frown":
        return f'<path d="M{cx-9} {cy+6} Q{cx} {cy-3} {cx+9} {cy+6}" fill="none" stroke="{OL}" stroke-width="4" stroke-linecap="round"/>'
    if kind == "wobble":
        return f'<path d="M{cx-11} {cy+3} q3.6 -4 7.3 0 t7.3 0 t7.3 0" fill="none" stroke="{OL}" stroke-width="4" stroke-linecap="round"/>'
    if kind == "smirk":
        return f'<path d="M{cx-8} {cy+3} Q{cx+2} {cy+6} {cx+10} {cy-2}" fill="none" stroke="{OL}" stroke-width="4" stroke-linecap="round"/>'
    return f'<path d="M{cx-7} {cy+3} L{cx+7} {cy+3}" stroke="{OL}" stroke-width="4" stroke-linecap="round"/>'

def arm(x, y, ang, side, fill="url(#body)"):
    # a little mitten arm pivoting at the body edge
    return (f'<g transform="translate({x},{y}) rotate({ang})"><ellipse cx="{side*12}" cy="0" rx="13" ry="9" fill="{fill}" stroke="{OL}" stroke-width="{W-1}"/></g>')

def clubby(t=0, dx=0, dy=0, sx=1.0, sy=1.0, tilt=0, eye="normal", look=0, mouth_="smile", open_=0.0,
           larm=200, rarm=-20, lup=None, rup=None, fill="url(#body)", blush=True, crown_dy=0, crown_rot=0, crown_on=True,
           hat=None, shades=None, alpha=1.0, extra_back="", extra_front="", front_r=False, front_l=False, pivot="base", zoom=1.16):
    cx, cy = 64 + dx, 74 + dy
    rx, ry = 40 * sx, 36 * sy
    out = extra_back
    out += f'<ellipse cx="{64+dx*0.3}" cy="118" rx="{30*sx}" ry="5" fill="#000" opacity="{0.18*alpha}"/>'
    py = cy + ry if pivot == "base" else cy
    out += f'<g transform="translate(64 84) scale({zoom}) translate(-64 -84)"><g opacity="{alpha}" transform="rotate({tilt} {cx} {py})">'
    la = arm(cx - rx + 4, cy + 6, larm, 1, fill); ra = arm(cx + rx - 4, cy + 6, rarm, 1, fill)
    if not front_l: out += la
    if not front_r: out += ra
    out += f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{fill}" stroke="{OL}" stroke-width="{W}"/>'
    out += f'<ellipse cx="{cx-14*sx}" cy="{cy-18*sy}" rx="{12*sx}" ry="{7*sy}" fill="#fff" opacity=".45" transform="rotate(-25 {cx-14*sx} {cy-18*sy})"/>'
    if blush: out += f'<ellipse cx="{cx-25}" cy="{cy+8}" rx="6" ry="3.5" fill="#ff7aa8" opacity=".7"/><ellipse cx="{cx+25}" cy="{cy+8}" rx="6" ry="3.5" fill="#ff7aa8" opacity=".7"/>'
    out += eyes(eye, cx, cy - 4, look)
    out += mouth(mouth_, cx, cy + 10, open_)
    if shades is not None:
        sy_ = cy - 6 + shades
        out += (f'<g><rect x="{cx-27}" y="{sy_-7}" width="22" height="14" rx="5" fill="url(#shades)" stroke="{OL}" stroke-width="3"/>'
                f'<rect x="{cx+5}" y="{sy_-7}" width="22" height="14" rx="5" fill="url(#shades)" stroke="{OL}" stroke-width="3"/>'
                f'<path d="M{cx-5} {sy_-3} L{cx+5} {sy_-3}" stroke="{OL}" stroke-width="3"/>'
                f'<path d="M{cx-22} {sy_-4} L{cx-14} {sy_-4}" stroke="#fff" stroke-width="2" opacity=".6"/><path d="M{cx+10} {sy_-4} L{cx+18} {sy_-4}" stroke="#fff" stroke-width="2" opacity=".6"/></g>')
    if crown_on and not hat: out += crown(cx, cy - ry - 4 + crown_dy, 1.0, crown_rot)
    if hat == "party":
        hx, hy = cx + 6, cy - ry + 2 + crown_dy
        out += (f'<g transform="rotate({12+crown_rot} {hx} {hy})"><path d="M{hx-17} {hy} L{hx} {hy-40} L{hx+17} {hy} Z" fill="#ff5fa2" stroke="{OL}" stroke-width="4" stroke-linejoin="round"/>'
                f'<path d="M{hx-11} {hy-12} L{hx+11} {hy-12}" stroke="#ffe066" stroke-width="5"/><path d="M{hx-6} {hy-26} L{hx+6} {hy-26}" stroke="#6fe3c9" stroke-width="4"/>'
                f'<circle cx="{hx}" cy="{hy-42}" r="6" fill="#ffe066" stroke="{OL}" stroke-width="3"/></g>')
    if hat == "wizard":
        hx, hy = cx, cy - ry + 4 + crown_dy
        out += (f'<g transform="rotate({crown_rot} {hx} {hy})"><path d="M{hx-30} {hy} Q{hx} {hy-8} {hx+30} {hy} L{hx+26} {hy+5} Q{hx} {hy-2} {hx-26} {hy+5} Z" fill="#3b2a8a" stroke="{OL}" stroke-width="4"/>'
                f'<path d="M{hx-18} {hy-2} Q{hx-4} {hy-30} {hx+10} {hy-46} Q{hx+6} {hy-24} {hx+18} {hy-2} Z" fill="#4b36a8" stroke="{OL}" stroke-width="4" stroke-linejoin="round"/>'
                f'<path d="M{hx-2} {hy-20} l3 6 l6 1 l-5 4 l1 6 l-5 -3 l-5 3 l1 -6 l-5 -4 l6 -1 z" fill="#ffe066"/></g>')
    if front_l: out += la
    if front_r: out += ra
    out += '</g></g>' + extra_front
    return out

def sparkle(x, y, s, col="#ffe066", rot=0, op=1):
    return f'<g transform="translate({x},{y}) rotate({rot}) scale({s})" opacity="{op}"><path d="M0 -10 L2.5 -2.5 L10 0 L2.5 2.5 L0 10 L-2.5 2.5 L-10 0 L-2.5 -2.5 Z" fill="{col}" stroke="{OL}" stroke-width="1.5"/></g>'

def heart(x, y, s, op=1):
    return f'<g transform="translate({x},{y}) scale({s})" opacity="{op}"><path d="M0 8 C-14 -2 -8 -12 0 -4 C8 -12 14 -2 0 8 Z" fill="#ff4f7b" stroke="{OL}" stroke-width="2.5"/></g>'

def coin(x, y, s=1, rot=0, sq=1.0, op=1):
    return (f'<g transform="translate({x},{y}) rotate({rot}) scale({s*sq},{s})" opacity="{op}"><circle r="11" fill="url(#coin)" stroke="{OL}" stroke-width="3"/>'
            f'<circle r="6.5" fill="none" stroke="#a8740d" stroke-width="2"/><ellipse cx="-4" cy="-5" rx="3.5" ry="2" fill="#fff" opacity=".8"/></g>')

def drop(x, y, s=1, col="#7fd4ff", op=1):
    return f'<g transform="translate({x},{y}) scale({s})" opacity="{op}"><path d="M0 -9 C5 -2 7 2 7 5 A7 7 0 0 1 -7 5 C-7 2 -5 -2 0 -9 Z" fill="{col}" stroke="{OL}" stroke-width="2"/><ellipse cx="-2" cy="3" rx="1.6" ry="2.4" fill="#fff" opacity=".8"/></g>'

def scroll_item(x, y, s=1, rot=0, glow=0):
    g = f'<circle cx="0" cy="0" r="{30+glow*10}" fill="url(#glow)" opacity="{glow}"/>' if glow else ""
    return (f'<g transform="translate({x},{y}) rotate({rot}) scale({s})">{g}'
            f'<rect x="-20" y="-24" width="40" height="48" rx="4" fill="url(#paper)" stroke="{OL}" stroke-width="4"/>'
            f'<rect x="-24" y="-28" width="48" height="10" rx="5" fill="#c98a4d" stroke="{OL}" stroke-width="4"/>'
            f'<rect x="-24" y="18" width="48" height="10" rx="5" fill="#c98a4d" stroke="{OL}" stroke-width="4"/>'
            f'<path d="M-11 -8 H11 M-11 0 H11 M-11 8 H5" stroke="#b0884a" stroke-width="3" stroke-linecap="round"/></g>')

def text(x, y, t, size, fill="#ffe066", rot=0, s=1, op=1, stroke=OL):
    return (f'<g transform="translate({x},{y}) rotate({rot}) scale({s})" opacity="{op}"><text x="0" y="0" text-anchor="middle" dominant-baseline="central" '
            f'font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="{size}" fill="{fill}" stroke="{stroke}" stroke-width="{size/7}" paint-order="stroke" stroke-linejoin="round">{t}</text></g>')

E = lambda f, n: f / n   # phase helper
ease = lambda p: 0.5 - 0.5 * math.cos(math.pi * p)
def bounce(p): return abs(math.sin(math.pi * p))

ANIMS = {}
def anim(name, n, dur):
    def deco(fn): ANIMS[name] = (fn, n, dur); return fn
    return deco

@anim("clubby_wave", 16, 70)
def _(f, n):
    p = f / n; a = math.sin(p * 2 * math.pi * 2)
    ang = -30 + 28 * a
    hand = (f'<g transform="translate(100,70) rotate({ang})"><path d="M0 0 L2 -26" stroke="{OL}" stroke-width="14" stroke-linecap="round"/><path d="M0 0 L2 -26" stroke="#8457f0" stroke-width="8" stroke-linecap="round"/>'
            f'<ellipse cx="3" cy="-34" rx="11" ry="12" fill="url(#body)" stroke="{OL}" stroke-width="5"/><path d="M-4 -40 Q3 -46 10 -40" stroke="#fff" stroke-width="2" fill="none" opacity=".5"/></g>')
    arcs = f'<g opacity="{0.4 + 0.6 * abs(a)}"><path d="M{112 + 4 * a} 22 q8 8 2 18" stroke="#ffe066" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M{120 + 4 * a} 16 q10 12 3 26" stroke="#ffe066" stroke-width="3" fill="none" stroke-linecap="round"/></g>'
    return svg(clubby(dy=-2 * bounce(p * 2), rarm=-20, larm=200, eye="happy" if (f // 4) % 2 else "normal", mouth_="grin", tilt=2 * a, extra_front=hand + arcs, zoom=1.08, dx=-8))

@anim("clubby_dead", 22, 80)
def _(f, n):
    p = f / n
    if p < 0.25:   # hit
        q = p / 0.25
        return svg(clubby(dx=6 * math.sin(q * 20), eye="wide", mouth_="o", sx=1 + 0.1 * q, sy=1 - 0.1 * q))
    if p < 0.5:    # topple
        q = (p - 0.25) / 0.25
        e = ease(q)
        return svg(clubby(sx=1 + 0.25 * e, sy=1 - 0.38 * e, dy=14 * e, eye="x", mouth_="flat", crown_on=False, larm=200 + 40 * e, rarm=-20 - 40 * e,
                          extra_front=crown(64 + 34 * e, 30 + 74 * e, 0.9, 110 * e)))
    q = (p - 0.5) / 0.5   # ghost rises
    gy = 60 - 50 * q
    ghost = (f'<g opacity="{0.9 - 0.6 * q}" transform="translate(64,{gy})"><path d="M-16 8 Q-16 -18 0 -18 Q16 -18 16 8 L12 4 L8 9 L4 4 L0 9 L-4 4 L-8 9 L-12 4 Z" fill="#eef4ff" stroke="{OL}" stroke-width="3"/>'
             f'<circle cx="-6" cy="-6" r="2.4" fill="{OL}"/><circle cx="6" cy="-6" r="2.4" fill="{OL}"/></g>')
    return svg(clubby(sx=1.25, sy=0.62, dy=14, eye="x", mouth_="flat", crown_on=False, larm=240, rarm=-60, extra_front=crown(98, 104, 0.9, 110) + ghost))

@anim("clubby_hype", 12, 60)
def _(f, n):
    p = f / n; b = bounce(p * 2)
    pts = [(14, 30), (114, 26), (18, 92), (112, 88), (104, 54)]
    sp = "".join(sparkle(x, y, 0.6 + 0.6 * abs(math.sin(p * 6.28 + k)), rot=p * 180 + k * 40) for k, (x, y) in enumerate(pts))
    return svg(clubby(dy=-14 * b, sx=1 + 0.08 * (1 - b), sy=1 - 0.08 * (1 - b), larm=150 - 40 * b, rarm=30 + 40 * b, eye="happy", mouth_="grin", extra_front=sp))

@anim("clubby_cry", 16, 80)
def _(f, n):
    p = f / n
    tears = ""
    for k in range(3):
        q = (p + k / 3) % 1
        tears += drop(49 - 6 * q, 78 + 30 * q, 0.7, op=1 - q) + drop(79 + 6 * q, 78 + 30 * q, 0.7, op=1 - q)
    return svg(clubby(dy=1.5 * math.sin(p * 6.28 * 4), eye="sad", mouth_="wobble", larm=230, rarm=-50, blush=False, extra_front=tears))

@anim("clubby_rage", 12, 60)
def _(f, n):
    p = f / n; sh = 3 * math.sin(p * 6.28 * 3)
    steam = ""
    for k in range(2):
        q = (p + k / 2) % 1
        for x0 in (30, 98):
            steam += f'<circle cx="{x0 + (8 if x0 > 64 else -8) * q}" cy="{36 - 26 * q}" r="{5 + 7 * q}" fill="#fff" opacity="{0.9 * (1 - q)}" stroke="{OL}" stroke-width="2"/>'
    return svg(clubby(dx=sh, eye="angry", mouth_="frown", fill="url(#bodyred)", larm=170, rarm=10, blush=False, extra_front=steam, crown_dy=-3 * bounce(p * 3)))

@anim("clubby_love", 16, 80)
def _(f, n):
    p = f / n; s = 1 + 0.06 * math.sin(p * 6.28 * 2)
    hs = ""
    for k in range(3):
        q = (p + k / 3) % 1
        hs += heart(30 + 34 * k + 6 * math.sin(q * 6.28), 40 - 34 * q, 0.6 + 0.3 * q, op=1 - q)
    return svg(clubby(sx=s, sy=s, eye="heart", mouth_="smile", larm=230, rarm=-50, extra_front=hs))

@anim("clubby_sweat", 16, 90)
def _(f, n):
    p = f / n; look = 3 * math.sin(p * 6.28)
    q = p
    sw = drop(100, 44 + 26 * q, 0.9, col="#bfe8ff", op=1 - 0.6 * q)
    return svg(clubby(eye="normal", look=look, mouth_="wobble", larm=210, rarm=-10 + 6 * math.sin(p * 12.5), extra_front=sw))

@anim("clubby_party", 14, 70)
def _(f, n):
    p = f / n; b = bounce(p * 2)
    conf = ""
    cols = ["#ff5fa2", "#ffe066", "#6fe3c9", "#7f9ef0", "#ff8a3d"]
    for k in range(10):
        q = (p + k / 10) % 1
        x = 10 + (k * 41) % 108; y = -6 + 120 * q
        conf += f'<rect x="{x}" y="{y}" width="6" height="10" rx="1.5" fill="{cols[k % 5]}" transform="rotate({k * 37 + p * 360} {x + 3} {y + 5})" stroke="{OL}" stroke-width="1"/>'
    return svg(clubby(dy=-8 * b, hat="party", crown_rot=-10 * b, eye="happy", mouth_="grin", larm=150, rarm=30, extra_back=conf))

@anim("clubby_cool", 18, 70)
def _(f, n):
    p = f / n
    sh = -40 + 40 * min(1, ease(min(1, p / 0.45)))
    sp = sparkle(98, 62, 0.8 * bounce(max(0, (p - 0.5) / 0.5)), col="#fff", rot=p * 90) if p > 0.5 else ""
    return svg(clubby(shades=sh, mouth_="smirk", eye="normal", larm=210, rarm=-60, extra_front=sp))

@anim("clubby_shrug", 14, 80)
def _(f, n):
    p = f / n; u = bounce(p)
    return svg(clubby(dy=-3 * u, larm=200 + 40 * u, rarm=-20 - 40 * u, eye="closed", mouth_="smirk", tilt=-4 * u))

@anim("clubby_wizard", 16, 80)
def _(f, n):
    p = f / n
    sp = "".join(sparkle(92 + 14 * math.cos(p * 6.28 + k * 2.1), 40 + 14 * math.sin(p * 6.28 + k * 2.1), 0.55, col=["#ffe066", "#b07cff", "#6fe3c9"][k], rot=p * 360) for k in range(3))
    return svg(clubby(hat="wizard", eye="normal", look=3, mouth_="smirk", rarm=-50 + 10 * math.sin(p * 12.5), larm=200, crown_rot=4 * math.sin(p * 6.28), extra_front=sp))

# ---------------- memes
@anim("scroll_boom", 16, 70)
def _(f, n):
    p = f / n
    if p < 0.45:
        q = p / 0.45
        return svg(scroll_item(64, 64, 1.1, rot=8 * math.sin(q * 30) * q, glow=0.3 * q))
    q = (p - 0.45) / 0.55
    r = 18 + 50 * ease(min(1, q * 1.4))
    boom = f'<circle cx="64" cy="64" r="{r}" fill="#ff8a3d" opacity="{1 - q}"/><circle cx="64" cy="64" r="{r*0.6}" fill="#ffe066" opacity="{1 - q}"/>'
    bits = "".join(f'<rect x="{64 + math.cos(k) * r * 0.9 - 4}" y="{64 + math.sin(k) * r * 0.9 - 4}" width="8" height="8" fill="url(#paper)" stroke="{OL}" stroke-width="2" transform="rotate({k*80} {64 + math.cos(k) * r * 0.9} {64 + math.sin(k) * r * 0.9})" opacity="{1-q}"/>' for k in [0.3, 1.2, 2.2, 3.0, 4.0, 4.9, 5.7])
    word = text(64, 64, "BOOM", 30, fill="#fff", s=0.6 + 0.6 * min(1, q * 2), rot=-8) if q > 0.15 else ""
    return svg(boom + bits + word)

@anim("scroll_pass", 16, 70)
def _(f, n):
    p = f / n; g = bounce(p)
    sp = "".join(sparkle(64 + 42 * math.cos(p * 6.28 + k * 1.57), 64 + 42 * math.sin(p * 6.28 + k * 1.57), 0.7, rot=p * 360) for k in range(4))
    word = text(64, 112, "PASS", 22, fill="#8fe3a8", s=0.8 + 0.2 * g)
    return svg(scroll_item(64, 56, 1.0, glow=0.6 + 0.4 * g) + sp + word)

@anim("meso_rain", 16, 60)
def _(f, n):
    p = f / n; out = ""
    for k in range(6):
        q = (p + k / 6) % 1
        x = 22 + (k * 53) % 86; y = -20 + 168 * q
        out += coin(x, y, 1.55, sq=abs(math.cos((q + k) * 6.28)) * 0.75 + 0.25)
    return svg(out)

@anim("sniped", 14, 70)
def _(f, n):
    p = f / n
    zoom = 1.6 - 0.6 * ease(min(1, p / 0.5))
    ch = (f'<g transform="translate(64,64) scale({zoom})"><circle r="40" fill="none" stroke="#ff3b3b" stroke-width="4"/><circle r="22" fill="none" stroke="#ff3b3b" stroke-width="3"/>'
          f'<path d="M0 -50 V-26 M0 26 V50 M-50 0 H-26 M26 0 H50" stroke="#ff3b3b" stroke-width="4"/><circle r="3" fill="#ff3b3b"/></g>')
    bag = (f'<g transform="translate(64,68)"><path d="M-22 -6 Q-24 24 0 24 Q24 24 22 -6 Q16 -16 8 -18 L12 -26 L-12 -26 L-8 -18 Q-16 -16 -22 -6 Z" fill="#c98a4d" stroke="{OL}" stroke-width="4"/>'
           f'<path d="M-10 -20 H10" stroke="{OL}" stroke-width="4"/>{coin(0, 4, 0.8)}</g>')
    word = text(64, 112, "SNIPED", 20, fill="#ff6b6b", s=1) if p > 0.55 else ""
    return svg(bag + ch + word)

@anim("gg", 12, 80)
def _(f, n):
    p = f / n
    return svg(text(64, 64, "GG", 56, fill="#ffe066", rot=6 * math.sin(p * 6.28), s=1 + 0.08 * math.sin(p * 12.56)) + sparkle(104, 28, 0.8 * bounce(p), rot=p * 180) + sparkle(22, 98, 0.6 * bounce(p + 0.5), rot=-p * 180))

@anim("rank_up", 16, 70)
def _(f, n):
    p = f / n; y = 20 * (1 - ease(min(1, p / 0.5)))
    arrow = f'<g transform="translate(64,{56+y})"><path d="M0 -36 L30 0 H12 V30 H-12 V0 H-30 Z" fill="#2ecc71" stroke="{OL}" stroke-width="5" stroke-linejoin="round"/><path d="M-6 -20 L0 -28 L6 -20" stroke="#bff5d2" stroke-width="3" fill="none"/></g>'
    sp = sparkle(22, 30, 0.9 * bounce(p * 2), rot=p * 180) + sparkle(106, 46, 0.7 * bounce(p * 2 + 0.5), rot=-p * 180)
    word = text(64, 110, "RANK UP", 16, fill="#ffe066") if p > 0.35 else ""
    return svg(arrow + sp + word)

@anim("wts", 12, 220)
def _(f, n):
    p = f / n; side = (f // 6) % 2
    sq = abs(math.cos(math.pi * ((f % 6) / 6)))
    lab, col = ("WTS", "#ff8a3d") if side == 0 else ("WTB", "#4aa8ff")
    sign = (f'<rect x="60" y="64" width="8" height="54" fill="#8a5a2b" stroke="{OL}" stroke-width="3"/>'
            f'<g transform="translate(64,46) scale({max(.08, sq)},1)"><rect x="-46" y="-24" width="92" height="48" rx="8" fill="{col}" stroke="{OL}" stroke-width="5"/>'
            f'{text(0, 0, lab, 28, fill="#fff")}</g>')
    return svg(sign)

@anim("cc_plz", 16, 90)
def _(f, n):
    p = f / n
    tick = f'<g transform="translate(64,66)"><circle r="36" fill="#fff" stroke="{OL}" stroke-width="5"/><path d="M0 0 L0 -22" stroke="{OL}" stroke-width="5" stroke-linecap="round" transform="rotate({p*360})"/><path d="M0 0 L14 0" stroke="{OL}" stroke-width="5" stroke-linecap="round" transform="rotate({p*30})"/><circle r="4" fill="{OL}"/></g>'
    dots = "".join(f'<circle cx="{46 + 18*k}" cy="110" r="5" fill="#ffe066" stroke="{OL}" stroke-width="2" opacity="{1 if (f//3)%4 > k else .25}"/>' for k in range(3))
    return svg(tick + text(64, 16, "CC?", 20, fill="#7f9ef0") + dots.replace('cy="110"', 'cy="116"'))

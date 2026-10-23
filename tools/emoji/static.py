import math
from art import svg, OL, crown, coin, sparkle, heart, scroll_item, text
G = """<defs>
<linearGradient id="g_green" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ff0b0"/><stop offset=".5" stop-color="#2ecc71"/><stop offset="1" stop-color="#178a48"/></linearGradient>
<linearGradient id="g_red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb3a8"/><stop offset=".5" stop-color="#ff5e5b"/><stop offset="1" stop-color="#b52a2a"/></linearGradient>
<linearGradient id="g_fire" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#d93a12"/><stop offset=".5" stop-color="#ff7a3d"/><stop offset="1" stop-color="#ffc56b"/></linearGradient>
<linearGradient id="g_twitch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b58cff"/><stop offset="1" stop-color="#6b2fd9"/></linearGradient>
<linearGradient id="g_cup" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9d4ea"/></linearGradient>
<radialGradient id="g_eye" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#d8c8ff"/><stop offset=".6" stop-color="#7a52ef"/><stop offset="1" stop-color="#3b1aa8"/></radialGradient>
</defs>"""
def S(body): return svg(G + body)
def shine(x, y, rx, ry, rot=-25, op=.55): return f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="#fff" opacity="{op}" transform="rotate({rot} {x} {y})"/>'
def shadow(cx=64, y=118, rx=34): return f'<ellipse cx="{cx}" cy="{y}" rx="{rx}" ry="5" fill="#000" opacity=".2"/>'

def gem(top, mid, bot, shape):
    lg = f'<linearGradient id="gg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{top}"/><stop offset=".55" stop-color="{mid}"/><stop offset="1" stop-color="{bot}"/></linearGradient>'
    body = f'<defs>{lg}</defs>' + shadow(rx=30)
    if shape == "round":
        body += f'<circle cx="64" cy="62" r="46" fill="url(#gg)" stroke="{OL}" stroke-width="6"/><circle cx="64" cy="62" r="32" fill="none" stroke="#fff" stroke-width="3" opacity=".25"/>' + shine(46, 40, 16, 9)
    elif shape == "diamond":
        body += (f'<polygon points="64,10 114,48 64,118 14,48" fill="url(#gg)" stroke="{OL}" stroke-width="6" stroke-linejoin="round"/>'
                 f'<polygon points="64,10 88,48 40,48" fill="#fff" opacity=".35"/><polygon points="40,48 64,118 14,48" fill="#000" opacity=".12"/>'
                 f'<polyline points="14,48 114,48" stroke="{OL}" stroke-width="4"/><polyline points="40,48 64,118 88,48" fill="none" stroke="{OL}" stroke-width="3" opacity=".55"/>' + shine(50, 30, 10, 5))
    elif shape == "hex":
        body += (f'<polygon points="64,8 114,36 114,92 64,120 14,92 14,36" fill="url(#gg)" stroke="{OL}" stroke-width="6" stroke-linejoin="round"/>'
                 f'<polygon points="64,26 96,44 96,84 64,102 32,84 32,44" fill="#fff" opacity=".18" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>' + shine(44, 32, 14, 7))
    elif shape == "star":
        body += (f'<polygon points="64,6 80,46 122,50 90,77 100,118 64,96 28,118 38,77 6,50 48,46" fill="url(#gg)" stroke="{OL}" stroke-width="6" stroke-linejoin="round"/>'
                 f'<polygon points="64,24 72,48 56,48" fill="#fff" opacity=".5"/>' + sparkle(100, 22, .7, col="#fff"))
    elif shape == "spark":
        body += (f'<polygon points="64,4 78,50 124,64 78,78 64,124 50,78 4,64 50,50" fill="url(#gg)" stroke="{OL}" stroke-width="6" stroke-linejoin="round"/>'
                 f'<polygon points="64,22 70,50 58,50" fill="#fff" opacity=".55"/>' + sparkle(100, 24, .6, col="#fff") + sparkle(26, 100, .5, col="#fff"))
    return svg(body)

STAT = {}
STAT["meso"] = S(shadow(rx=36) + coin(64, 62, 4.6) + text(64, 63, "M", 34, fill="#a8740d", stroke="#fff3bf"))
STAT["crown"] = S(shadow(rx=40) + crown(64, 70, 2.6))
STAT["deal"] = S(shadow(rx=30) + f'<path d="M64 6 C72 38 102 46 102 82 C102 106 86 122 64 122 C42 122 26 106 26 82 C26 64 36 54 42 46 C44 60 54 64 56 56 C58 38 52 24 64 6 Z" fill="url(#g_fire)" stroke="{OL}" stroke-width="6" stroke-linejoin="round"/>'
                 f'<path d="M64 66 C74 84 84 90 84 102 C84 114 74 120 64 120 C54 120 44 114 44 102 C44 92 54 86 56 78 C58 88 66 84 64 66 Z" fill="#ffe066"/>' + shine(46, 72, 6, 12, 15, .4))
STAT["scanner"] = S(f'<path d="M6 64 C28 26 100 26 122 64 C100 102 28 102 6 64 Z" fill="#fff" stroke="{OL}" stroke-width="6" stroke-linejoin="round"/>'
                    f'<circle cx="64" cy="64" r="27" fill="url(#g_eye)" stroke="{OL}" stroke-width="5"/><circle cx="64" cy="64" r="12" fill="{OL}"/><circle cx="54" cy="53" r="7" fill="#fff"/><circle cx="73" cy="73" r="3" fill="#fff" opacity=".7"/>')
STAT["verified"] = S(shadow(rx=34) + f'<path d="M64 6 L78 18 L96 16 L102 34 L118 44 L112 62 L118 80 L102 90 L96 108 L78 106 L64 118 L50 106 L32 108 L26 90 L10 80 L16 62 L10 44 L26 34 L32 16 L50 18 Z" fill="url(#g_green)" stroke="{OL}" stroke-width="6" stroke-linejoin="round"/>'
                     f'<polyline points="38,64 56,82 92,44" fill="none" stroke="{OL}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/><polyline points="38,64 56,82 92,44" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>' + shine(42, 34, 12, 6))
STAT["witness"] = S("".join(f'<ellipse cx="{x}" cy="64" rx="30" ry="24" fill="#fff" stroke="{OL}" stroke-width="6"/><circle cx="{x+2}" cy="66" r="13" fill="url(#g_eye)" stroke="{OL}" stroke-width="3"/><circle cx="{x+2}" cy="66" r="6" fill="{OL}"/><circle cx="{x-3}" cy="60" r="4" fill="#fff"/>' for x in (36, 92)))
STAT["stream"] = S(shadow(rx=40) + f'<rect x="10" y="32" width="78" height="62" rx="14" fill="url(#g_twitch)" stroke="{OL}" stroke-width="6"/><polygon points="88,52 120,34 120,92 88,74" fill="#c9a6ff" stroke="{OL}" stroke-width="6" stroke-linejoin="round"/>'
                   f'<circle cx="34" cy="54" r="9" fill="#ff4f4f" stroke="{OL}" stroke-width="3"/>' + shine(30, 42, 14, 5, 0, .4) + text(58, 72, "LIVE", 15, fill="#fff"))
STAT["kofi"] = S(shadow(rx=40) + f'<path d="M18 36 H94 V82 C94 100 80 114 56 114 C32 114 18 100 18 82 Z" fill="url(#g_cup)" stroke="{OL}" stroke-width="6" stroke-linejoin="round"/>'
                 f'<path d="M94 50 H106 C122 50 122 82 106 82 H94" fill="none" stroke="{OL}" stroke-width="7"/><rect x="18" y="30" width="76" height="12" rx="6" fill="#c98a4d" stroke="{OL}" stroke-width="5"/>'
                 + heart(56, 74, 2.1) + '<path d="M40 22 q6 -8 0 -16 M56 22 q6 -8 0 -16 M72 22 q6 -8 0 -16" stroke="#cbbfe6" stroke-width="4" fill="none" stroke-linecap="round"/>')
STAT["up"] = S(shadow(rx=30) + f'<path d="M64 10 L116 66 H86 V116 H42 V66 H12 Z" fill="url(#g_green)" stroke="{OL}" stroke-width="6" stroke-linejoin="round"/><path d="M64 26 L96 60" stroke="#fff" stroke-width="5" opacity=".5" stroke-linecap="round"/>')
STAT["down"] = S(shadow(rx=30) + f'<path d="M64 118 L116 62 H86 V12 H42 V62 H12 Z" fill="url(#g_red)" stroke="{OL}" stroke-width="6" stroke-linejoin="round"/><path d="M50 22 V56" stroke="#fff" stroke-width="5" opacity=".5" stroke-linecap="round"/>')
STAT["gem_scout"] = gem("#f2f4f7", "#b8bec7", "#79808b", "round")
STAT["gem_merchant"] = gem("#c8f7d6", "#5fcf7a", "#2b8a45", "round")
STAT["gem_trader"] = gem("#cfe7ff", "#4aa8ff", "#1f5fb0", "round")
STAT["gem_broker"] = gem("#e6d6ff", "#a06bff", "#5b2bbf", "diamond")
STAT["gem_tycoon"] = gem("#ffd6f3", "#ff6bd6", "#b02f8e", "diamond")
STAT["gem_royal"] = gem("#fff4c2", "#f5c542", "#b07d0d", "hex")
STAT["gem_legend"] = gem("#fff4c2", "#ffd166", "#d9901a", "star")
STAT["gem_immortal"] = gem("#e0fbff", "#6fe3ff", "#1d8fb3", "diamond")
STAT["gem_titan"] = gem("#ffe0c8", "#ff8a3d", "#b84c10", "hex")
STAT["gem_mythic"] = gem("#f6e0ff", "#c56bff", "#7420b0", "spark")

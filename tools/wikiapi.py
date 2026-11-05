"""Sign in to the MapleClassic Wiki before reading its Cargo tables.

The wiki answers Cargo queries only for signed-in accounts since Nov 5 2026, and its maintainers approved Club FM's
daily read. The account's bot password comes from the WIKI_BOT_USER and WIKI_BOT_PASS secrets (Special:BotPasswords
on the wiki, set in GitHub by the owner). After login() every urllib request in the process carries the session
cookie, so the existing get() helpers work unchanged. Without the secrets nothing happens and the gated tables refuse,
which stops the build and keeps the last good copy."""
import os, json, urllib.request, urllib.parse, http.cookiejar

API = "https://mapleclassic.wiki/api.php"


def login(ua):
    user, pw = os.environ.get("WIKI_BOT_USER", ""), os.environ.get("WIKI_BOT_PASS", "")
    if not user or not pw:
        print("wiki: no bot login set (WIKI_BOT_USER, WIKI_BOT_PASS); reading as a visitor"); return False
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    op.addheaders = [("User-Agent", ua)]
    urllib.request.install_opener(op)
    tok = json.load(op.open(API + "?action=query&meta=tokens&type=login&format=json", timeout=40))["query"]["tokens"]["logintoken"]
    body = urllib.parse.urlencode({"action": "login", "lgname": user, "lgpassword": pw, "lgtoken": tok, "format": "json"}).encode()
    r = json.load(op.open(API, data=body, timeout=40)).get("login") or {}
    if r.get("result") != "Success":
        # never print the password or the token, only what the wiki said
        raise SystemExit("wiki login refused: " + str(r.get("reason") or r.get("result"))[:200])
    print("wiki: signed in as", r.get("lgusername"))
    return True

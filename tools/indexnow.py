"""Tell Bing and the other IndexNow engines which pages exist (and changed), so new guide and item pages are crawled
within days instead of weeks. Google doesn't take IndexNow; it reads the sitemap.

  python tools/indexnow.py sitemap.xml
"""
import json, re, sys, urllib.request
KEY = "3faa5be7664b21768c09c73941b32181"
urls = re.findall(r"<loc>([^<]+)</loc>", open(sys.argv[1], encoding="utf-8").read())
for i in range(0, len(urls), 9000):
    body = json.dumps({"host": "maplefm.gg", "key": KEY, "keyLocation": f"https://maplefm.gg/{KEY}.txt", "urlList": urls[i:i + 9000]}).encode()
    req = urllib.request.Request("https://api.indexnow.org/indexnow", body, {"Content-Type": "application/json; charset=utf-8"})
    try: print("indexnow", urllib.request.urlopen(req, timeout=30).status, len(urls[i:i + 9000]))
    except Exception as e: print("indexnow", e)

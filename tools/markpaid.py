"""Payday for people paid by hand (pay.json direct_pay): record what each is owed as paid, outside PayPal.
   python3 tools/markpaid.py <credits.json> [YYYY-MM-DD]   -> adds {"date", "amount", "via": "direct"} to data/payouts.json"""
import json, sys, os, datetime
HERE = os.path.dirname(os.path.abspath(__file__))
pay = json.load(open(os.path.join(HERE, "..", "data", "pay.json")))
direct = {str(x).lower() for x in pay.get("direct_pay") or []}
bal = json.load(open(sys.argv[1])).get("balances") or []
day = sys.argv[2] if len(sys.argv) > 2 else datetime.date.today().isoformat()
path = os.path.join(HERE, "..", "data", "payouts.json")
po = json.load(open(path)) if os.path.exists(path) else {}
for b in bal:
    if str(b.get("name", "")).lower() in direct and float(b.get("owed") or 0) > 0:
        po.setdefault(b["name"], []).append({"date": day, "amount": round(float(b["owed"]), 2), "via": "direct"})
        print("marked", b["name"], b["owed"])
json.dump(po, open(path, "w"), indent=1)

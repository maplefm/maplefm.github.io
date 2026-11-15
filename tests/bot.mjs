// !price, Discord /price, /sell and /market through the Worker's own code, locally. Nothing is posted: every request
// other than reading the public price data is blocked here. Run from a copy of worker/src with these exports added:
//   export { discordPrice, mkCtx, mkRows, abbrMap, findRows, splitRoll };
//   node tests/bot.mjs <dir with that copy>
const dir = process.argv[2] || ".";
const realFetch = globalThis.fetch, blocked = [];
globalThis.fetch = (u, o) => { const s = String(u && u.url || u); const m = (o && o.method) || (u && u.method) || "GET";
  if (m === "GET" && /^https:\/\/(raw\.githubusercontent\.com|maplefm\.gg)\//.test(s)) return realFetch(u, o);
  blocked.push(m + " " + s.slice(0, 80)); return Promise.resolve(new Response("{}", { status: 403 })); };
const W = (await import(dir + "/index.js")), M = await import(dir + "/market.js");
const kv = new Map(); const KV = { get: async (k, t) => { const v = kv.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; }, put: async (k, v) => kv.set(k, typeof v === "string" ? v : JSON.stringify(v)), delete: async () => {}, list: async () => ({ keys: [] }) };
const inserts = []; const st = (sql) => ({ bind: (...a) => ({ run: async () => { if (/^\s*INSERT/i.test(sql)) inserts.push(sql.slice(0, 40)); return { meta: {} }; }, all: async () => ({ results: [] }), first: async () => null }), run: async () => ({ meta: {} }), all: async () => ({ results: [] }), first: async () => null });
const DB = { prepare: st, batch: async () => [] };
const env = { SITE: "https://maplefm.gg", KV, FM: KV, ACCOUNTS: KV, INBOX_DB: DB, MARKET_DB: DB, DB, SESSION_SECRET: "test" };
const ctxW = { waitUntil: () => {}, passThroughOnException: () => {} };
// [query, the item the answer must name, or null when it must name none]
const Q = [["work gloves", "Work Gloves"], ["wg", "Work Gloves"], ["wg 8 att", "Work Gloves"], ["wg 5+ att", "Work Gloves"], ["wg 5 or more att", "Work Gloves"], ["work gloves 1 crit", "Work Gloves"],
  ["wg 2 crit", "Work Gloves"], ["clean wg", "Work Gloves"], ["gfa 60", "Gloves Attack Scroll: Intermediate"], ["glove att 10%", "Gloves Attack Scroll: Greater"], ["gloves attack scroll 100%", "Gloves Attack Scroll: Lesser"],
  ["claw 60", "Claw Attack Scroll: Intermediate"], ["10% claw", "Claw Attack Scroll: Greater"], ["el 60", "Earring LUK Scroll: Intermediate"], ["earring luk 10%", "Earring LUK Scroll: Greater"],
  ["emerald earrings", "Emerald Earrings"], ["emerald earrings 3 luk", "Emerald Earrings"], ["emerald earring 2 crit", "Emerald Earrings"], ["blue arten", "Blue Arten"], ["blue arten 5 dex", "Blue Arten"],
  ["steel slain", "Steel Slain"], ["steel slain 40 att", "Steel Slain"], ["doombringer 95 att", "Doombringer"], ["red calaf", "Red Calaf"], ["dark pilfer clean", "Dark Pilfer"], ["tobi", "Tobi Throwing Stars"],
  ["ilbi", "Ilbi Throwing Stars"], ["kumbi", "Kumbi Throwing Stars"], ["mokbi", "Mokbi Throwing Stars"], ["arrows for bows", "Arrows for Bows"], ["bronze arrows for bows", "Bronze Arrows for Bows"], ["elixir", "Elixir"],
  ["pure water", "Pure Water"], ["pan lid", "Pan Lid"], ["cromi", "Cromi"], ["the nine dragons", "The Nine Dragons"], ["wrok glvoes", "Work Gloves"], ["emrald earings", "Emerald Earrings"], ["stee slain", "Steel Slain"],
  ["bathrobe", null], ["asdfqwer", null], ["", null], ["8 att", null], ["💎💎", null], ["<script>alert(1)</script>", null], ["'; drop table x;--", null], ["x".repeat(300), null],
  ["手袋", null], ["guantes de trabajo", null], ["Arbeitshandschuhe", null], ["luvas", null], ["wg 999 att", "Work Gloves"], ["return scroll", "Return Scroll"], ["rotten mushmom cap", "Rotten Mushmom Cap"],
  ["return scroll to forgotten hollow", "Return Scroll to Forgotten Hollow"], ["blue polka-dot pajama top", "Blue Polka-Dot Pajama Top"], ["kitty camping hat", "Kitty Camping Hat"], ["megaphone", "Megaphone"],
  ["brown work gloves", "Brown Work Gloves"], ["yellow arianne", "Yellow Arianne"]];
let bad = 0, n = 0; const ctxM = Object.assign(W.mkCtx(env), { rows: await W.mkRows(env), abbr: await W.abbrMap() });
// answers write scroll tiers as players say them (Intermediate is 60%): compare in that form
const shownN = (x) => String(x || "").replace(/: Lesser$/, " 100%").replace(/: Intermediate$/, " 60%").replace(/: Greater$/, " 10%");
const names = ctxM.rows.map((r) => shownN(r.item)).sort((a, b) => b.length - a.length);
const namedIn = (t) => { t = String(t).replace(/^\*\*/, ""); return names.find((x) => t === x || t.startsWith(x + ":") || t.startsWith(x + " ") || t.startsWith(x + "**")) || null; };
for (const [q, want] of Q) {
  n++;
  const r = await (await W.default.fetch(new Request("https://api.maplefm.gg/chat/price?q=" + encodeURIComponent(q)), env, ctxW)).text();
  const d = await W.discordPrice(env, q); const title = (d && d.data && d.data.embeds && d.data.embeds[0] && d.data.embeds[0].title) || (d && d.data && d.data.content) || "";
  const s = await M.marketCommand(env, { type: 2, data: { name: "sell", options: [{ name: "item", value: q }, { name: "price", value: 1000 }] }, user: { id: "100000000000000000", username: "battletest" } }, ctxM);
  const sellText = JSON.stringify(s.data);
  const chatItem = namedIn(r), discItem = namedIn(title);
  const sellItem = (/Listed \*\*([^*]+)\*\*/.exec(sellText) || [])[1] || null;
  const fine = (got, t) => want ? (!got || got === shownN(want) || String(t).replace(/^\*\*/, "").startsWith(shownN(want))) : !got;     // naming nothing is allowed; naming another item never
  const ok = fine(chatItem, r) && fine(discItem, title) && (!sellItem || shownN(sellItem) === shownN(want) || sellItem === shownN(want));
  if (!ok) bad++;
  console.log((ok ? "ok   " : "FAIL ") + JSON.stringify(q.length > 30 ? q.slice(0, 20) + "…" : q) + " | !price: " + r.slice(0, 100).replace(/\n/g, " ") + " | /price: " + title.slice(0, 50) + " | /sell: " + (sellItem || (/Pick the item[^"]*/.exec(sellText) || [sellText.slice(0, 50)])[0]).slice(0, 70));
}
console.log("bot: " + (n - bad) + " of " + n + " right; outside requests blocked: " + blocked.length + (blocked.length ? " (" + [...new Set(blocked)].slice(0, 3).join(", ") + ")" : "") + "; writes to the mock database: " + inserts.length);
process.exit(bad ? 1 : 0);

const W = (await import("./index.js")).default;
const kv = new Map(); const KV = { get: async (k) => kv.get(k) ?? null, put: async (k, v) => kv.set(k, v), delete: async () => {}, list: async () => ({ keys: [] }) };
let inserts = [];
const DB = { prepare: (sql) => ({ bind: (...a) => ({ run: async () => { if (/INSERT INTO hits/.test(sql)) inserts.push(a); return {}; }, all: async () => ({ results: [] }), first: async () => null }), run: async () => ({}), all: async () => ({ results: [] }), first: async () => null }) };
const env = { SITE: "https://maplefm.gg", KV, ACCOUNTS: KV, INBOX_DB: DB, SESSION_SECRET: "test" };
const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };
const UA_PHONE = "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
const cases = [
  ["real phone, home ISP, from Google", UA_PHONE, "Comcast Cable", { p: "/item/work-gloves/", r: "www.google.com", q: "" }, 1],
  ["real phone, direct", UA_PHONE, "AT&T Services", { p: "/", r: "", q: "" }, 1],
  ["headless Chrome", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36", "Comcast Cable", { p: "/" }, 0],
  ["Playwright phone UA from a cloud server", UA_PHONE, "Google LLC", { p: "/" }, 0],
  ["Googlebot", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Google LLC", { p: "/" }, 0],
  ["curl", "curl/8.0", "Comcast Cable", { p: "/" }, 0],
  ["no user agent", "", "Comcast Cable", { p: "/" }, 0],
  ["AWS server with Chrome UA", UA_PHONE, "Amazon.com, Inc.", { p: "/" }, 0],
];
let fails = 0;
for (const [name, ua, org, body, want] of cases) {
  inserts = []; const r = new Request("https://api.maplefm.gg/hit", { method: "POST", headers: ua ? { "User-Agent": ua, "CF-Connecting-IP": "203.0.113." + Math.floor(Math.random() * 200) } : {}, body: JSON.stringify(body) });
  r.cf = undefined; Object.defineProperty(r, "cf", { value: { asOrganization: org } });
  const res = await W.fetch(r, env, ctx); await new Promise((ok) => setTimeout(ok, 50));
  const got = inserts.length; const ok = got === want; if (!ok) fails++;
  console.log((ok ? "ok   " : "FAIL ") + name + ": " + (got ? "counted, ref " + inserts[0][2] + ", visitor code " + (inserts[0][4] ? "yes" : "no") : "skipped") + " (status " + res.status + ")");
}
console.log(fails ? fails + " wrong" : "visit counter: all " + cases.length + " cases right");

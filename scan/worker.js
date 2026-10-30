// Club FM browser scanner: the reading runs here, off the page, with the same Python readers FM Watcher uses
// (fmparse, glyphs, tipexact) in Pyodide, and Tesseract's own engine for the minimap title. Frames arrive as raw
// pixels and never leave this browser; only the rows read from them go back to the page.
importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js", "tess/tcore.js");
let py = null, api = null, TM = null, ready = null, glue = null, API = "https://api.maplefm.gg";
// what this browser's scanner keeps between visits: its random id, its signing key and the listings it has seen
// (FM Watcher keeps the same three files next to itself). IndexedDB, in this browser only.
const KEEP = ["anon_id.txt", "inbox_key.txt", "watcher_data_v2.json", "scan_channel.json"];
function idb() { return new Promise((ok, no) => { const r = indexedDB.open("fm-scan", 1); r.onupgradeneeded = () => r.result.createObjectStore("f"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); }
async function idbGet(k) { const d = await idb(); return new Promise((ok) => { const q = d.transaction("f").objectStore("f").get(k); q.onsuccess = () => ok(q.result); q.onerror = () => ok(null); }); }
async function idbPut(k, v) { const d = await idb(); return new Promise((ok) => { const t = d.transaction("f", "readwrite"); t.objectStore("f").put(v, k); t.oncomplete = ok; t.onerror = ok; }); }
// the watcher's sender calls urlopen; here that's a plain request from this browser (a worker may wait for it)
let DRY = false;     // a copy of the page anywhere but maplefm.gg (a test, a preview) never sends anything
self.sync_post = function (url, body, ctype) {
  if (DRY) { self.dryPosts = (self.dryPosts || 0) + 1; return [200, '{"ok":true}']; }
  const x = new XMLHttpRequest(); x.open("POST", url, false); x.setRequestHeader("Content-Type", ctype); x.send(body.toJs ? body.toJs() : body);
  return [x.status, x.responseText];
};
const HEAD = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n";
// Tesseract for fmparse's text reader: a PNG in, the same TSV the command line gives out
self.tess_tsv = function (png, psm) {
  api.SetVariable("tessedit_pageseg_mode", String(psm));
  TM.FS.writeFile("/input", png.toJs ? png.toJs() : png);
  api.SetImageFile(1, 0);
  const t = api.GetTSVText(0); api.Clear();
  return HEAD + t;
};
async function init() {
  const man = await (await fetch("py/manifest.json", { cache: "no-cache" })).json();
  TM = await TesseractCore();
  TM.FS.writeFile("/eng.traineddata", new Uint8Array(await (await fetch("tess/eng.traineddata")).arrayBuffer()));
  api = new TM.TessBaseAPI(); if (api.Init(null, "eng", 1)) throw new Error("text reader didn't start");
  py = await loadPyodide(); await py.loadPackage(["pillow", "numpy"]);
  py.FS.mkdirTree("/w");
  for (const f of KEEP) { const v = await idbGet(f); if (v) py.FS.writeFile("/w/" + f, v); }
  for (const f of Object.keys(man.files)) py.FS.writeFile("/w/" + f, new Uint8Array(await (await fetch("py/" + f + "?v=" + man.files[f])).arrayBuffer()));
  py.runPython(`
import sys, io, csv; sys.path.insert(0, '/w')
import ocrlib
from js import tess_tsv
from pyodide.ffi import to_js
def ocr_lines(img, scale=4, psm=6):
    b = io.BytesIO(); img.save(b, format='PNG')
    out = tess_tsv(to_js(b.getvalue()), psm)
    groups = {}
    for r in csv.DictReader(io.StringIO(out), delimiter="\\t", quoting=csv.QUOTE_NONE):
        t = (r.get("text") or "").strip()
        if not t: continue
        groups.setdefault((r["block_num"], r["par_num"], r["line_num"]), []).append(r)
    lines = []
    for ws in groups.values():
        x0 = min(int(w["left"]) for w in ws); y0 = min(int(w["top"]) for w in ws)
        x1 = max(int(w["left"]) + int(w["width"]) for w in ws); y1 = max(int(w["top"]) + int(w["height"]) for w in ws)
        lines.append({"text": " ".join(w["text"] for w in ws), "x": x0 / scale, "y": y0 / scale, "w": (x1 - x0) / scale, "h": (y1 - y0) / scale})
    lines.sort(key=lambda l: (l["y"], l["x"]))
    return lines
ocrlib.ocr_lines = ocr_lines
import fmparse
fmparse.ocr_lines = ocr_lines
fmparse.TIP_PASSES = fmparse.TIP_PASSES[:1]     # one contrast pass: the exact reader settles the stats
import watcher, urllib.request, urllib.error
from js import sync_post
class _Resp(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): pass
def _urlopen(req, timeout=0):
    data = req.data if hasattr(req, "data") else None
    url = req.full_url if hasattr(req, "full_url") else str(req)
    ct = (req.get_header("Content-type") if hasattr(req, "get_header") else None) or "application/x-www-form-urlencoded"
    st, txt = sync_post(url, to_js(data or b""), ct)
    if st == 0 or st >= 400: raise urllib.error.URLError("HTTP %s" % st)
    return _Resp(str(txt).encode())
watcher.urllib.request.urlopen = _urlopen
watcher.log = lambda *a: None
import scanglue
`);
  py.globals.set("API", API);
  py.runPython("watcher.INBOX_FORM = API + '/inbox'; watcher.ACCOUNTS = API");
  glue = py.globals.get("scanglue");
  await keep();
  const id = py.runPython("watcher.anon_id()");
  const hb = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("fm-inbox:" + id)));
  self.HID = [...hb].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  return man.version;
}
async function keep() {
  try { glue.save(); } catch (e) {}
  for (const f of KEEP) { try { await idbPut(f, py.FS.readFile("/w/" + f)); } catch (e) {} }
}
onmessage = async (e) => {
  const m = e.data;
  if (m.type === "wait") { setTimeout(() => postMessage({ type: "tick" }), m.ms); return; }
  if (m.type === "init") {
    if (m.api) API = m.api;
    DRY = !!m.dry;
    if (!ready) ready = init();
    try { postMessage({ type: "ready", version: await ready, hid: self.HID }); } catch (err) { postMessage({ type: "error", error: String(err).slice(-400) }); }
    return;
  }
  if (m.type === "frame") {
    await ready;
    const t = performance.now();
    let out;
    try { out = JSON.parse(glue.frame(m.px, m.w, m.h, m.x0 || 0, m.fw || m.w, m.room || null)); } catch (err) { out = { error: String(err).slice(-400) }; }
    postMessage({ type: "result", id: m.id, ms: performance.now() - t, out });
  }
  if (m.type === "publish") {
    await ready;
    let ok = false; try { ok = glue.publish(m.name || "", m.ign || ""); } catch (e) {}
    await keep();
    postMessage({ type: "published", ok, counts: JSON.parse(glue.counts()) });
  }
  if (m.type === "mem") { postMessage({ type: "mem", py: py && py._module.HEAPU8.length, tess: TM && TM.HEAPU8.length }); return; }
  if (m.type === "counts") { await ready; postMessage({ type: "counts", counts: JSON.parse(glue.counts()) }); }
  if (m.type === "save") { await ready; await keep(); postMessage({ type: "saved" }); }
};

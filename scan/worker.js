// Club FM browser scanner: FM Watcher itself runs here, off the page. Its Python (watcher.py's loop, fmparse, glyphs,
// tipexact, boards) runs in Pyodide, Tesseract runs as WebAssembly for the text it reads, and the shared game window's
// frames are drawn onto a canvas here so the watcher can take the same small pictures it takes of the screen on
// Windows. Frames never leave this browser; only what the watcher sends (the same signed uploads) goes to Club FM.
importScripts("https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js", "tess/tcore.js");
let py = null, api = null, TM = null, ready = null, glue = null, API = "https://api.maplefm.gg";
// what FM Watcher keeps next to itself and this browser keeps in IndexedDB instead: its random id, its signing key,
// the listings it has seen, the channel and today's hover counts
const KEEP = ["anon_id.txt", "inbox_key.txt", "watcher_data_v2.json", "channel.txt", "hover_counts.json", "items_extra.json", "scan_history.csv"];
function idb() { return new Promise((ok, no) => { const r = indexedDB.open("fm-scan", 1); r.onupgradeneeded = () => r.result.createObjectStore("f"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); }
async function idbGet(k) { const d = await idb(); return new Promise((ok) => { const q = d.transaction("f").objectStore("f").get(k); q.onsuccess = () => ok(q.result); q.onerror = () => ok(null); }); }
async function idbPut(k, v) { const d = await idb(); return new Promise((ok) => { const t = d.transaction("f", "readwrite"); t.objectStore("f").put(v, k); t.oncomplete = ok; t.onerror = ok; }); }

// ---------------------------------------------------------------- the shared frame
let cv = null, cx = null, sm = null, sx = null, frameN = 0;
function draw(f) {
  const w = f.displayWidth || f.width, h = f.displayHeight || f.height;
  if (!cv || cv.width !== w || cv.height !== h) { cv = new OffscreenCanvas(w, h); cx = cv.getContext("2d", { willReadFrequently: true }); }
  cx.drawImage(f, 0, 0); frameN++;
  try { f.close(); } catch (e) {}
}
// the watcher's grab(): a rectangle of the current frame (outside the frame reads as black, like off-screen)
self.grab_rect = (x, y, w, h) => cx ? cx.getImageData(x, y, w, h).data : new Uint8ClampedArray(w * h * 4);
// [width, height] of the frame, or with k > 1 the whole frame shrunk k times (to find a popup anywhere)
self.frame_info = (k) => {
  if (!cv) return k ? new Uint8ClampedArray(4) : [0, 0];
  if (!k) return [cv.width, cv.height];
  const w = Math.ceil(cv.width / k), h = Math.ceil(cv.height / k);
  if (!sm || sm.width !== w || sm.height !== h) { sm = new OffscreenCanvas(w, h); sx = sm.getContext("2d", { willReadFrequently: true }); }
  sx.drawImage(cv, 0, 0, w, h);
  return sx.getImageData(0, 0, w, h).data;
};

// ---------------------------------------------------------------- the network, for the watcher's urlopen
let DRY = false;     // a copy of the page anywhere but maplefm.gg (a test, a preview) never sends anything
self.sync_req = function (method, url, body, headers) {
  if (DRY && method !== "GET") { self.dryPosts = (self.dryPosts || 0) + 1; return [200, '{"ok":true}', null]; }
  const x = new XMLHttpRequest(); x.open(method, url, false);
  x.responseType = "";               // text; binary bodies aren't fetched by the watcher
  const hs = headers.toJs ? headers.toJs({ dict_converter: Object.fromEntries }) : headers;
  for (const k of Object.keys(hs || {})) { if (!/^(user-agent|content-length)$/i.test(k)) try { x.setRequestHeader(k, hs[k]); } catch (e) {} }
  try { x.send(body ? (body.toJs ? body.toJs() : body) : null); } catch (e) { return [0, "", null]; }
  return [x.status, x.responseText, null];
};

// ---------------------------------------------------------------- Tesseract for fmparse's text reader
const HEAD = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n";
self.tess_tsv = function (png, psm) {
  api.SetVariable("tessedit_pageseg_mode", String(psm));
  TM.FS.writeFile("/input", png.toJs ? png.toJs() : png);
  api.SetImageFile(1, 0);
  const t = api.GetTSVText(0); api.Clear();
  return HEAD + t;
};

async function init(name, ign) {
  const man = await (await fetch("py/manifest.json", { cache: "no-cache" })).json();
  TM = await TesseractCore();
  TM.FS.writeFile("/eng.traineddata", new Uint8Array(await (await fetch("tess/eng.traineddata")).arrayBuffer()));
  api = new TM.TessBaseAPI(); if (api.Init(null, "eng", 1)) throw new Error("text reader didn't start");
  py = await loadPyodide(); await py.loadPackage(["pillow", "numpy"]);
  py.FS.mkdirTree("/w");
  for (const f of KEEP) {
    const v = await idbGet(f);
    if (v && v.data) { py.FS.writeFile("/w/" + f, v.data); try { py.FS.utime("/w/" + f, v.t, v.t); } catch (e) {} }
  }
  for (const f of Object.keys(man.files)) py.FS.writeFile("/w/" + f, new Uint8Array(await (await fetch("py/" + f + "?v=" + man.files[f])).arrayBuffer()));
  py.globals.set("API", API);
  py.runPython(`
import sys, io, csv; sys.path.insert(0, '/w')
import ocrlib
from js import tess_tsv, sync_req
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
import urllib.request, urllib.error
class _Resp(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): pass
def _urlopen(req, timeout=0):
    if isinstance(req, str): req = urllib.request.Request(req)
    data = req.data
    st, txt, _ = sync_req(req.get_method(), req.full_url, to_js(data) if data else None, to_js(dict(req.header_items())))
    if st == 0 or st >= 400: raise urllib.error.HTTPError(req.full_url, st or 599, "HTTP %s" % st, {}, io.BytesIO(str(txt).encode()))
    return _Resp(str(txt).encode())
urllib.request.urlopen = _urlopen
# RapidOCR, the watcher's second text reader on Windows, isn't loaded here: on every saved shop (1,197 checked rows,
# 181 of Adam's shops) the watcher's readers give the same rows without it, and it would triple the memory.
fmparse.rapid_lines = lambda img, scale: []
import watcher
watcher.urllib.request.urlopen = _urlopen
watcher.INBOX_FORM = API + "/inbox"; watcher.ACCOUNTS = API
import scanglue
`);
  glue = py.globals.get("scanglue");
  glue.init(name || "", ign || "");
  await keep();
  const id = py.runPython("watcher.anon_id()");
  const hb = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("fm-inbox:" + id)));
  self.HID = [...hb].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
  return man.version;
}
async function keep() {
  try { glue.save(); } catch (e) {}
  for (const f of KEEP) {
    try { const st = py.FS.stat("/w/" + f); await idbPut(f, { data: py.FS.readFile("/w/" + f), t: st.mtime.getTime ? st.mtime.getTime() / 1000 : st.mtime }); } catch (e) {}
  }
}

let busy = false, lastKeep = 0;
onmessage = async (e) => {
  const m = e.data;
  if (m.type === "wait") { setTimeout(() => postMessage({ type: "tick" }), m.ms); return; }
  if (m.type === "init") {
    if (m.api) API = m.api;
    DRY = !!m.dry;
    if (!ready) ready = init(m.name, m.ign);
    try { postMessage({ type: "ready", version: await ready, hid: self.HID }); } catch (err) { postMessage({ type: "error", error: String(err).slice(-400) }); }
    return;
  }
  if (m.type === "frame") {
    if (!ready) { try { m.frame.close(); } catch (er) {} return; }
    await ready;
    if (busy) { try { m.frame.close(); } catch (er) {} return; }   // a look is running on the frame it started with
    draw(m.frame);
    busy = true;
    const t = performance.now();
    let out;
    try { out = JSON.parse(glue.step()); } catch (err) { out = { error: String(err).slice(-400) }; }
    busy = false;
    if (Date.now() - lastKeep > 60e3) { lastKeep = Date.now(); keep(); }
    postMessage({ type: "result", ms: performance.now() - t, out });
    try { glue.run_deferred(); } catch (er) {}
    return;
  }
  if (m.type === "publish") {
    await ready;
    let ok = false; try { ok = glue.publish(); } catch (er) {}
    await keep();
    postMessage({ type: "published", ok, counts: JSON.parse(glue.counts()) });
  }
  if (m.type === "who") { await ready; glue.set_who(String(m.name || "").slice(0, 16), String(m.ign || "").slice(0, 13)); return; }
  if (m.type === "counts") { await ready; postMessage({ type: "counts", counts: JSON.parse(glue.counts()) }); }
  if (m.type === "save") { await ready; await keep(); postMessage({ type: "saved" }); }
  if (m.type === "mem") { postMessage({ type: "mem", py: py && py._module.HEAPU8.length, tess: TM && TM.HEAPU8.length }); }
};

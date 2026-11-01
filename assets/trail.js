// Your path through the guide pages: open a quest, click to an item, a monster, a map, and a bar under the menu shows
// where you started and each step since, every one a link. Coming from anywhere else (the board, a list, a search,
// Google) starts a new path. Kept for this tab only (sessionStorage).
(function () {
  var DETAIL = /^\/(item|quest|monster|map|crafting|guides)\/[^/]+\/$/;
  var here = location.pathname;
  if (!DETAIL.test(here)) return;
  var title = (document.querySelector("h1") || {}).textContent || document.title.split(" · ")[0];
  title = String(title).replace(/\s+price$/i, "").trim();
  var kind = here.split("/")[1], KIND = { item: "Item", quest: "Quest", monster: "Monster", map: "Map", crafting: "Crafting", guides: "Guide" };
  var trail = [];
  try { trail = JSON.parse(sessionStorage.getItem("fm-trail") || "[]") || []; } catch (e) {}
  var from = "";
  try { var r = new URL(document.referrer); if (r.origin === location.origin) from = r.pathname; } catch (e) {}
  var at = -1; trail.forEach(function (s, i) { if (s.u === here) at = i; });
  if (at >= 0) trail = trail.slice(0, at + 1);                                   // back to a step: drop what came after it
  else if (from && DETAIL.test(from) && trail.length && trail[trail.length - 1].u === from) trail.push({ u: here, t: title, k: kind });
  else trail = [{ u: here, t: title, k: kind }];                                // a fresh start
  if (trail.length > 12) trail = [trail[0]].concat(trail.slice(-11));           // the start always stays
  try { sessionStorage.setItem("fm-trail", JSON.stringify(trail)); } catch (e) {}
  if (trail.length < 2) return;
  var bar = document.createElement("nav"); bar.className = "trail"; bar.setAttribute("aria-label", "Your path");
  var first = trail[0];
  var back = document.createElement("a"); back.className = "tr-start"; back.href = first.u;
  back.textContent = "↩ Back to " + first.t; back.title = "Where you started: the " + (KIND[first.k] || "page").toLowerCase() + " " + first.t;
  bar.appendChild(back);
  var path = document.createElement("span"); path.className = "tr-path";
  trail.slice(1).forEach(function (s, i, a) {
    if (i) path.appendChild(Object.assign(document.createElement("i"), { textContent: "›" }));
    if (i === a.length - 1) { var b = document.createElement("b"); b.textContent = s.t; path.appendChild(b); }
    else { var l = document.createElement("a"); l.href = s.u; l.textContent = s.t; path.appendChild(l); }
  });
  bar.appendChild(path);
  var after = document.querySelector("main .crumbs") || document.querySelector("main .sitenav");
  if (after && after.parentNode) after.parentNode.insertBefore(bar, after.nextSibling);
})();

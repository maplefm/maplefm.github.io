# Club FM battle test suite

Rerun after any change. Live site, read only: test visits never reach the visit counter, nothing is posted or sold.

1. `node tests/pages.cjs <chromium|android|webkit|firefox> [out.json]`: every page type, plus dark, 320 px, landscape, reduced motion, 200% zoom. Status, script errors, broken images, layout shift, sideways scroll, titles, unlabeled controls, load over 3 s on phones. `SWAP=1` serves this checkout's board.
2. `node tests/features.cjs [out.json]`: search inputs, deep links and Discord link formats, Worker down, GitHub raw down or slow, empty or broken data, offline, slow 3G, two tabs, HTML in seller names.
3. `node tests/memory.cjs 60`: one board tab for an hour, heap every 5 minutes.
4. `node tests/bot.mjs <worker copy>`: 60 queries through !price, /price and /sell code locally (see the file head for the exports to add). Outside requests are blocked.
5. `node tests/visits.mjs` from a worker/src copy: the visit counter counts real visits and skips headless browsers, bots and cloud servers.
6. `bash tests/endpoints.sh`: every public Worker route, admin and member routes without a session. One request a second.

Playwright: `NODE_PATH=$(npm root -g)` in this container. WebKit and Firefox run in CI only.

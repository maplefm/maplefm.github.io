Club FM Watcher
===============
Reads MapleStory Classic's Free Market shop windows and trade chat off your screen and adds the prices
to https://maplefm.gg

What it does and doesn't do
1. It only looks at the screen, like taking a screenshot. That's all.
2. It never clicks, never types, never sends a key to the game, and never takes control of your game or computer.
3. It runs no macros, prompts or scripts in the game, and never touches the game's files or memory.
4. It sends only what's in the shops: item names, prices, quantities, seller names as shown in the FM, room, channel,
   time and item tooltip text. For items listed at 500K and up it also sends a small picture of that item's popup,
   so buyers see the real stats. Never a screenshot of your screen.

First time
0. If Windows says "Windows protected your PC", click More info, then Run anyway. It does this for any script
   downloaded from the internet. You can open the .bat files in Notepad first to see what they do.
1. Double-click install.bat and let it finish. It installs Python and the Tesseract text reader. Close the window.
2. Your character's name is read off the game's status bar on its own, so the site's ranks show your IGN.
   Nothing to type. (If you'd rather use another name, put it in config.json as "name": "YourName".)
3. Open MapleStory.
4. Double-click start.bat and leave that window open in the background.

Updating
It updates itself. start.bat checks the site when it opens, and the watcher keeps checking while it runs;
when a new version is out it saves, patches this folder and starts again on its own, like a game launcher.
Your config.json and saved prices are kept.

While you shop
1. Open the Change Channel window once, so listings carry your channel.
2. Keep the minimap in view. It tells us which FM room you're in.
3. Equip stats: rest your mouse on each equip's icon for about a second, until you hear the chime and see "read".
   Keep the whole item popup on screen.

While it runs, the window also tells you things worth knowing:
1. DEAL lines: a shop you just opened has something well under its usual price on maplefm.gg. Turn off with
   "deal_alerts": false in config.json.
2. "most needed this hour": the busiest rooms and channels nobody usually reads at this hour. Scans there help the
   board most. Turn off with "coverage_tips": false.
3. Every half hour, your shops and sold slots caught so far.

Stop it by closing the window.

Reviewing your own data
Double-click export.bat. It writes my_scans.csv in this folder with every listing this watcher has seen.

Your scan stats: double-click stats.bat any time to see new listings, shops, sales caught and equip stats read in the last hour and today, with your pace per active hour. The watcher window also prints the same line at the top of every hour. Below that it lists every day by your PC's date: items scanned, items with stats read, and total scans (an item with stats counts twice). Each day is also saved in scan_history.csv, so nothing resets at midnight.
Open it in Excel or Google Sheets.

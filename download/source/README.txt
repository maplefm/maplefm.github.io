Club FM Watcher
===============
Reads MapleStory Classic's Free Market shop windows and trade chat off your screen and adds the prices
to https://maplefm.gg

What it does and doesn't do
1. It only looks at the screen, like taking a screenshot. That's all.
2. It never clicks, never types, never sends a key to the game, and never takes control of your game or computer.
3. It runs no macros, prompts or scripts in the game, and never touches the game's files or memory.
4. It sends only prices: item, price, quantity, the shop owner's name as shown in the FM, and the time.
   Only the shop text it read leaves your computer: item names, prices, quantities, seller names, room, channel, time and item tooltip text. Not screenshots.

First time
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
3. Hover an equip's row for a second to read its stats. It just reads the tooltip the game shows you.

Stop it by closing the window.

Reviewing your own data
Double-click export.bat. It writes my_scans.csv in this folder with every listing this watcher has seen.

Your scan stats: double-click stats.bat any time to see new listings, shops and sales caught in the last hour and today, with your pace per active hour. The watcher window also prints the same line at the top of every hour.
Open it in Excel or Google Sheets.

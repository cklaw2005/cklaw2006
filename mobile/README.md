# PACEBREAK Mobile — local PC-parity browser draft

This is the phone-sized browser port of the current six-rider bicycle PACEBREAK game. It ports the PC odds, top-two and first-place markets, tips, weather, hazards, 1,000-round payout window, virtual-coin wallet, race counter, history, music and two-place finish. The responsive cards are a mobile layout for the same game rules; this does not modify or replace the PC executable.

## Open on a phone

To run this local draft on a desktop or phone browser, start its included preview server from the repository root:

```powershell
node mobile/preview-server.cjs 8095
```

Open `http://localhost:8095/` on the computer. On a phone connected to the same Wi-Fi, open `http://<computer-LAN-IP>:8095/`. The GitHub Pages mobile version is served at `https://cklaw2005.github.io/cklaw2006/mobile/` after the main branch Pages build finishes.

## Controls

Choose **TOP TWO** to select one of the 15 unordered pairs, or **1ST PLACE** to select a single rider. Use `+`/`−` to set the selected stake, then tap **START RACE**. Each selection is capped at 100 coins and by the PC game's wallet and house-exposure rules. Odds lock when the race starts. Pair prices use the PC digit adjustment (+2 for one digit, +20 for two digits, +50 for three digits, +500 for four digits). First-place odds are calculated from rider strengths with the PC rounding rule. If a collision occurs, its two, three or four involved riders are disqualified and effective odds/payouts receive the matching ×2, ×3 or ×4 multiplier. The result card and recent history show both winning-market odds. When a winning ticket pays, the PC ten-second winner music and payout countdown play before the next odds board. **+10**, **Return**, and **Reset** follow the PC virtual-coin behavior. Round number, cumulative coin-in/out, balance, pair history and recent results persist in this browser's local storage. The rolling payout window keeps the latest 1,000 settled rounds and defaults to the PC target of 70%.

The race shows six numbered cyclists in a fair shared starting line, on six bounded lanes, running left-to-right in a side view. Clear/rain/wet grass/thunderstorm/strong-wind weather and occasional hazards use the PC game's proportions and pace effects. A collision is independently sampled at the PC 4% per-race rate; it can involve two to four riders, displays as one pair or two pairs (three riders render as one trap plus a pair), and disqualifies every involved rider. Its ×2/×3/×4 factor applies once to both displayed locked odds and actual payouts. The finish card, top-two pair, first-place winner, effective odds, payout, and history all use the finish schedule that drives the visible crossings; all racing stops at the second eligible crossing. Strong wind uses each rider's resistance and sprint tuck. Music and incident cues are synthesized by the browser's Web Audio API, so playback does not depend on missing audio files.

## Self-check

From the repository root, run:

```powershell
node mobile/self-check.cjs
node --check mobile/app.js
node --check mobile/race-core.js
node --check mobile/sw.js
```

The self-check verifies the PC-adjusted odds table, both markets, collision multipliers and disqualifications, collision frequency across 5,000 generated races, and 1,200 consecutive ticket→motion→crossing→odds→payout rounds plus desktop/mobile lane bounds. This browser port does not execute or wrap the Windows `.exe`; this draft has not been deployed to GitHub Pages.

## Important

**For Amusement Only — Free Arcade Bicycle Racing Game. No Real-Money Betting. No Cash Prizes.** Virtual coins have no monetary value and cannot be redeemed. This is a browser game, not an Android APK or iOS App Store package. Browser-based installation depends on browser support.

# K-Race Mobile Arcade — web draft 0.1

An independent phone-first browser edition of the six-rider bicycle arcade game. It is published separately at `https://cklaw2005.github.io/cklaw2006/mobile/`; it does not replace the Windows executable or the older robot browser edition in `../web/`.

## Open on a phone

Open the public HTTPS page above in a phone browser. To test locally on desktop, run a static server from the repository root:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080/mobile/`. The public HTTPS page supports service-worker installation; use the browser's **Add to Home Screen** command when available.

## Controls

Tap a pair, use `+`/`−` to set its stake, and tap **BET NOW**. Every pair has its own stake and the result pays the odds displayed for the actual first two riders, in either order. Tap **+10** for virtual coins or **Return** to reclaim uncommitted stakes. Race number, coin balance, and recent results are stored only in that browser's local storage.

The race shows six numbered cyclists from a side view. Most races have no incident. If a fall occurs, the affected rider is withdrawn and cannot cross the finish; the other riders continue. The race ends on the second actual finish crossing. Official finish order, animation positions, result card, history, and payout all use the same resolved outcome. The Music button starts and stops a looping, synthesized arcade theme; short race and result cues are also synthesized locally. No remote audio is loaded. Audio starts only after a player taps the music button, as required by mobile browsers.

## Self-check

From the repository root, run:

```powershell
node mobile/self-check.cjs
node --check mobile/app.js
node --check mobile/race-core.js
```

## Important

**For Amusement Only — Free Arcade Bicycle Racing Game. No Real-Money Betting. No Cash Prizes.** Virtual coins have no monetary value and cannot be redeemed. This is a browser game, not an Android APK or iOS App Store package. Browser-based installation depends on browser support.


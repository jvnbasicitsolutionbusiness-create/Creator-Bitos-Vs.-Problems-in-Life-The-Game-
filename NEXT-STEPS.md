# Next steps (agreed with the user)

Decisions made 2026-10-07:

1. **Cinematics first.** Opening cinematic immediately after the click, plus a
   short pre-fight cinematic for each of the 10 rounds (Laziness gives a speech
   about ambition and loyalty to Seizure, etc. — text only, no voices).
2. **Real PNG sprite sheets.** Not a restyle of the procedural vector rig —
   actual frame-by-frame sprite sheets, for the authentic hand-drawn look.
3. **Cinematic before auth.** New flow: click → opening cinematic → loading →
   auth. (Returning players who already saw it skip straight on — it stays
   skippable at any moment and replayable from Extras.)

## Remaining backlog (from the user's list of 10)

Ordered, with the first three being the current focus:

- [x] 2. Engine error — FIXED (crypto.subtle / secure-context dependency)
- [ ] 1. Head floating back and forth, too small — needs the sprite-sheet
      rebuild: fixed head, bigger anime proportions, an actual fighting stance
- [ ] 10. Pre-fight cinematic for each of the 10 rounds
- [ ] 3. Settings: Graphics / Sound / SFX adjustment
- [ ] 4. Distinct soundtrack per screen; character SFX only during gameplay
- [ ] 5. Per-round backgrounds matched to each enemy (Lust = pleasure city full
      of stickman figures)
- [ ] 6. Animated/moving wallpapers for opening, loading, auth and main menu;
      Creator Bitos' gaze follows the cursor in the main menu
- [ ] 7. CSS / design / arrangement / animation pass over every screen
- [ ] 8. Rockstar-style combat music
- [ ] 9. Anime-like attacks with screams, pain, grunts, groans, death sounds

## Notes carried forward

- The user attached two screenshots (`/home/user/uploads/`). One was a healthy
  boot screen, the other a Chrome "page might be temporarily down" error — the
  preview proxy had died, not a game bug.
- `tools/browser-qa/setup-chrome.sh` must be re-run each session; Chromium
  lives in `~/.cache`, which is not part of the workspace snapshot.
- Headless rAF is throttled, so frame rates measured in the browser QA harness
  are meaningless, and the renderer intermittently dies with "Target crashed".
  `node tools/check.js` (187 checks) is the reliable gate.

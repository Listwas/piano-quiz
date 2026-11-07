# Verification

Published on 2026-11-07 (Europe/Warsaw).

- Play: **https://piano-quiz.pages.dev/**
- Release: `4841977d1ebe7a`
- Production deployment: `5e0b980a-1daf-45c4-aa57-f924cd73060e`
- Immutable URL: https://5e0b980a.piano-quiz.pages.dev/
- Repository: https://github.com/Listwas/piano-quiz

## Current results

| Check | Chromium | Firefox | WebKit | Where |
| --- | --- | --- | --- | --- |
| Training | 14 passed | 14 passed | 14 passed | Local release build |
| Quiz and Home UI | 20 passed | 20 passed | 20 passed | Production |
| Viewport and rotation | 10 passed | 10 passed | 10 passed | Production |
| Service-worker updates | 4 passed | 4 passed | 4 passed | Isolated two-version server |
| Sight-reading retry and full hold meter | 1 passed | — | — | Production |

**77 unit tests passed.** All reports above record this release hash and have no
uncaught page errors. The full general browser suites include real service-worker
installation and fresh offline reloads from production.

Reports: [units](unit.json), [training](training-chromium.json),
[live quiz and Home](live-chromium.json), [live viewport](live-viewport-chromium.json),
[updates](update-chromium.json), [live bar retry](live-training-focused-chromium.json).
Full training, general browser, viewport and update reports also exist for Firefox
and WebKit using their engine names.

All **39 served files** were fetched from production and compared byte for byte
with `dist/`. Home returned HTTP 200; CSP and `midi=(self)` were checked.
See [asset verification](live-assets.json). The 40-file release ZIP was reopened
to verify members, CRC integrity and exact bytes; its size and SHA-256 are in
[release.json](release.json).

## Sight-reading and hold feedback

Sight-reading always checks the metronome timing. Pitch errors, off-beat attacks,
missed notes, short or long holds, and rest violations restart the entire failed
bar. The same notes remain, earlier completed bars survive, and retry counts stay
visible in results. Both pacing choices enforce these rules. Free per-note Guided
reading is no longer exposed by the app.

The metronome continues without being restarted. The failed bar's new start is
aligned to a future downbeat on that clock, with at least one beat to prepare.
The countdown and header timer use that same deadline. Inputs during the retry
wait cannot advance the bar. Pause, disconnect and resume replace a pending retry
with a fresh count-in. Only one bar is rendered on every viewport size.

Tests verify rollback after an earlier correct note in the same bar, ignored keys
during the countdown, matching retry/downbeat timestamps, and recovery after a
short release. Missing the first note of the next bar restarts that bar while
retaining the previous bar's results. Unit tests also cover attacks and held keys
through rests, a release error across a barline, and beat grids in 3/4 and 4/4.

A valid release displays a completely filled hold meter for 200 ms. A fresh attack
clears that visual latch immediately, so it does not delay grading. Browser tests
read 100% and the release label synchronously after the MIDI release. Explicit
track/fill CSS gives the meter a consistent full-width appearance.

## Home, mobile and compatibility

The Home activity picker has a theme-colored background, rounded border, chevron,
and visible keyboard focus. It remains a native select for keyboard and mobile
interaction; the platform controls the mobile option popup. Other settings
pickers retain their existing styling.

Coverage includes iPhone 14 Pro Max portrait and landscape, Honor MagicPad 2
portrait and landscape, a 320 × 568 phone, compact tablet windows and desktop.
Safe areas and visible-height changes are simulated. Rotation checks use browser
touch input on Pause, Resume and Settings. Main screens do not scroll, settings
can scroll, and note-picker Save remains visible. All fourteen palettes, exact
sharp/flat selections, higher octaves, saved rounds and explicit updates remain
covered.

Current MIDI training uses a simulated browser MIDI device with real DOM event
routing and timestamps. Protocol, reconnect, channel and sustain handling are
also covered by unit tests. Earlier native Chromium **Midi Through Port-0**
loopback evidence remains in the older MIDI reports; it is not counted as a new
physical MIDI test for this release.

Screenshots: [Home](images/home.png), [bar retry countdown](images/sight-guided-chromium.png),
[tablet sight-reading](images/sight-tablet-chromium.png), [rhythm](images/rhythm-chromium.png).
These are authentic browser captures.

## Limits

Tests run headlessly. Physical iPhone, Honor tablet, USB/Bluetooth MIDI transport,
Android menus, system bars and acoustic timing have not been measured. Browser
emulation and virtual MIDI do not establish physical-device latency.

Chromium and Firefox verify actual sample output. WebKit's Linux audio backend
cannot start in this host; the app's explicit visual-beat fallback and unavailable
audio message are verified instead. Physical Safari audio and MIDI compatibility
are not established by the simulated MIDI tests.

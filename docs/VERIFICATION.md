# Verification

Pulse added on main and published on 2026-11-12.

- Play: **https://piano-quiz.pages.dev/**
- Release: `863902201daef0`
- Production deployment: `3481aa9e-e355-4fe4-8dae-61e8d766bea7`
- Immutable URL: https://3481aa9e.piano-quiz.pages.dev/
- Repository: https://github.com/Listwas/piano-quiz

## Current release

**100 unit tests passed.** The theme picker now contains sixteen explicit
palettes in eight paired rows, plus Device. Existing preferences are preserved.
Choose **App settings → Appearance → Pulse** for warm paper and coral controls.

| Check | Result | Origin |
| --- | --- | --- |
| Settings, storage, quiz and training unit tests | [100 passed](unit.json) | Main source |
| Paired picker rows, saved theme, contrast and Home/Quiz/Pause controls | [4 viewports passed](pulse-browser.json) | Local build |
| Correct/incorrect training feedback contrast | [All sixteen palettes passed](pulse-contrast.json) | Local build |
| Pulse selection, persistence and quiz pause/resume by touch | [Passed](pulse-production.json) | Production |
| Runtime asset bytes and response policies | [43 matched](live-assets.json) | Production |

Layout checks covered 430 × 932, 1280 × 800, 320 × 568, and 932 × 430.
Phone Home and picker screenshots were visually inspected. No uncaught page
errors were recorded. Viewports were simulated; physical iPhone and Honor
MagicPad 2 behavior was not retested.

See [Pulse notes and screenshots](PULSE.md). The general Nocturne browser
checks and earlier feature suites were not rerun for this small theme addition.
Their actual scope and builds remain recorded in the
[Nocturne release audit](https://github.com/Listwas/piano-quiz/blob/319030e44faa94b0ddfc00e5fdb553efeca8d66f/docs/VERIFICATION.md)
and the [feature baseline](https://github.com/Listwas/piano-quiz/blob/4474695025269ee75c8c9180e33dcacef3c7fdfe/docs/VERIFICATION.md).

## Earlier feature baseline

- The hardest-bar action selects the bar with the most retries. A user can
  choose another bar, play at the original tempo or start about 20% slower,
  and return to the report. The replay preserves the original pitch/octave,
  written spelling, durations and rests. Tests cover MIDI sight-reading,
  touch Rhythm, reloading a saved report, and compact/rotated layouts.
- Replaying a bar does not replace the complete-session report, change saved
  tempo, or create a history entry. The latest 60 full sessions are stored on
  the device. History compares matching settings only; BPM, note ranges and
  timing correction changes are checked separately. Old reports remain usable.
- Calibration follows four count-in clicks with twelve measured beats. It
  uses one onset per beat, rejects sparse, noisy or out-of-range runs, and
  never saves the suggestion until the user applies it. The browser fixture
  verifies a known +42 ms offset, preserved setup fields, and a MIDI disconnect.

Captures: [bar drill](images/bar-drill-chromium.png),
[history](images/session-history-chromium.png),
[calibration](images/midi-calibration-chromium.png).
History comparison includes deliberate saved fixture data. Calibration uses a
controlled audio clock and simulated MIDI, not a physical latency measurement.
Deterministic WebKit exercises use the visual clock on this host.

## Release integrity

All 43 served runtime files matched the build. Home returned HTTP 200;
[asset verification](live-assets.json) records byte hashes and response policies.
The 44-file ZIP was reopened and checked for exact members, CRC and bytes.
[release.json](release.json) records size, SHA-256 and deployment ID.

See [development commands](DEVELOPMENT.md#commands) to reproduce the tests.

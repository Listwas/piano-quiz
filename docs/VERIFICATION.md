# Verification

Saved bar-practice progress and completed-session button spacing fixed on
2026-11-12.

- Play: **https://piano-quiz.pages.dev/**
- Release: `93e676ec562736`
- Production deployment: `717038c9-7275-4cd4-b02e-5cebe8375f9b`
- Immutable URL: https://717038c9.piano-quiz.pages.dev/
- Repository: https://github.com/Listwas/piano-quiz

## Current release

**105 unit tests passed.** A successful bar drill now stores a check and its
best achieved BPM with the original session. History and Last session retain
the same mark after reloading. The hardest-bar recommendation moves to the
remaining unpractised bars. Original retry, timing, duration and first-try
statistics are preserved; a drill does not add a full history session.

Unit cases cover updating separate saved copies, selecting the next bar,
preserving original stats, keeping the best tempo, round-trip storage, rejecting
failed drills, and ignoring malformed saved practice marks.

| Check | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| Failed-bar retry, original/slower successful drills, marked summaries, saved reload and history | [Passed](live-practice-progress-chromium.json) | [Passed](practice-progress-firefox.json) | [Passed](practice-progress-webkit.json) |
| Eight-bar Rhythm summary, dense report and compact controls | Included above | Included above | Included above |

Each report contains two end-to-end scenarios; Chromium uses production,
Firefox and WebKit use the local build. The Sight-reading scenario checks
at least 12 px below the completed-session buttons in six phone/tablet
layouts, including simulated safe areas. The eight-bar report additionally
checks 320 × 568, 568 × 320, 667 × 375 and 1280 × 800.

[Phone summary](images/practised-bars-firefox.png) and
[tablet summary](images/practised-bars-tablet-firefox.png) were visually
inspected. [Unit report](unit.json). No uncaught page errors were recorded
in the passing scenarios.

MIDI and device sizes are simulated. Firefox and WebKit use the explicit visual
exercise clock on this headless host. The initial native Firefox audio run
timed out before the baseline Sight-reading exercise completed; it is not
reported as passing. Physical devices and their audio timing were not retested.

The earlier eighth-note and calibration fixes are included in this runtime.
Their wider tests were not rerun for the report update; see the
[Rhythm/calibration audit](https://github.com/Listwas/piano-quiz/blob/48170b5e9dd8e3814138c6b02b652ddcddd76234/docs/VERIFICATION.md)
and [feature baseline](https://github.com/Listwas/piano-quiz/blob/4474695025269ee75c8c9180e33dcacef3c7fdfe/docs/VERIFICATION.md).

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

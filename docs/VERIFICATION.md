# Verification

Bar drills, session history and MIDI timing calibration checked on 2026-11-11
(Europe/Warsaw).

- Play: **https://piano-quiz.pages.dev/**
- Release: `832bfaeaa7834d`
- Production deployment: `165fd5a3-a924-4c69-b1b0-4d431f052747`
- Immutable URL: https://165fd5a3.piano-quiz.pages.dev/
- Repository: https://github.com/Listwas/piano-quiz

## Current release

**100 unit tests and 33 browser scenarios passed.** Browser checks used the
published build except the isolated worker update suite. No uncaught page
errors were recorded. The new feature scenarios extend actual graded exercises.

| Check | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| Drill, history, layout and calibration scenarios | [3 passed](live-training-focused-chromium.json) | [3 passed](live-training-focused-firefox.json) | [3 passed](live-training-focused-webkit.json) |
| Quiz, themes, storage and offline launch | [20 passed](live-chromium.json) | — | — |
| Explicit service-worker updates | [4 passed](update-chromium.json) | — | — |

[Unit report](unit.json). Dashes indicate suites not rerun in that engine for
this build. The [earlier full session-report audit](https://github.com/Listwas/piano-quiz/blob/c530c94b8f388f3566417bb9249c7560b9490d03/docs/VERIFICATION.md)
records broader practice coverage.

## Feature checks

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

All 43 served runtime files matched the build and source. Home returned HTTP
200; [asset verification](live-assets.json) records byte hashes and response
policies. The 44-file ZIP was reopened and checked for exact members, CRC and
bytes. [release.json](release.json) records size, SHA-256 and deployment ID.

See [development commands](DEVELOPMENT.md#commands) to reproduce the tests.

# Verification

Rhythm eighth-note releases and MIDI calibration access fixed on 2026-11-12.

- Play: **https://piano-quiz.pages.dev/**
- Release: `590026ecd00229`
- Production deployment: `b351a490-1af5-4b66-bb48-9acc10291cce`
- Immutable URL: https://b351a490.piano-quiz.pages.dev/
- Repository: https://github.com/Listwas/piano-quiz

## Current release

**103 unit tests passed.** New tests reproduced the failed articulated eighths
and the late release cue before the fix. The model exercises repeated eighths
at 60, 90, 120, 160 and 200 BPM with offsets of -100, 0 and +100 ms.
Taps, shortened long notes, overdue releases and offbeat attacks still fail.
Strict and Sight-reading retain their existing grading.

In Beginner Rhythm, the full meter now marks the earliest acceptable release.
A valid late attack can release near the written note end if at least half the
value was held. This leaves room to re-articulate eighths without relaxing the
next onset deadline. The metronome and score cursor retain their original grid.

MIDI calibration is visible near the top of App settings with the saved signed
correction; its original entry in exercise setup remains available.

| Check | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| MIDI eighths at 200 BPM, visible Settings calibration, calibration Apply/disconnect | [Passed](rhythm-eighths-chromium.json) | [Passed](rhythm-eighths-firefox.json) | [Passed](rhythm-eighths-webkit.json) |
| Existing MIDI hold grading and Sight-reading failed-bar retries | Included above | Not rerun | Not rerun |
| Published eighths and main-settings calibration access | [2 passed](live-rhythm-eighths.json) | Not rerun | Not rerun |

[Unit report](unit.json). The three local reports contain 5, 3 and 3 scenarios.
The eighth-note scenario uses repeated MIDI Note On/Off messages, verifies full
meters and green notes, and completes at 100% onset/hold with no extra or missed
notes. Calibration verifies a controlled +42 ms offset, explicit Apply, current
correction in App settings, return navigation and cancellation on disconnect.
[Settings screenshot](images/midi-settings-chromium.png) was visually inspected.

MIDI, audio timing for calibration and device sizes are simulated. WebKit uses
the explicit visual exercise clock on this host. No physical keyboard or Honor
MagicPad 2 was attached; these checks do not measure hardware latency.

The broader suites were not rerun for this fix; see the
[clef-scale audit](https://github.com/Listwas/piano-quiz/blob/d8f6c0af5cbac92358deac7c213a8f55ed5ff2f7/docs/VERIFICATION.md)
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

# Verification

Touch quiz confirmation and accidental-skip guards published on 2026-11-17.

- Play: **https://piano-quiz.pages.dev/**
- Release: `7dd374b5692487`
- Production deployment: `08e17e65-1ded-45a9-8170-557216871752`
- Immutable URL: https://08e17e65.piano-quiz.pages.dev/
- Repository: https://github.com/Listwas/piano-quiz

## Current release

**106 unit tests passed.** Touch answers accept a written note name independently
of its octave; MIDI still requires the displayed register. The reported
`D · D3 · Moving on` caption identifies the unanswered/skip path.

After selecting an answer, the quiet action now clears it without grading or
advancing. Only an empty selection can be skipped. Skipped questions show
`Skipped · Answer: D3` with neutral notation. They remain unanswered in the
first-attempt score.

Check snapshots its answer and question on pointer-down, captures the pointer,
and submits on release even if the layout moved beneath a stationary finger.
Dragging away cancels it. Its compatibility click cannot activate newly
displayed feedback actions; keyboard Enter still works.

| Check | Result | Origin |
| --- | --- | --- |
| Unit suite, including all-register touch/MIDI distinction | [106 passed](unit.json) | Source |
| All 136 spellings/registers, six skip/clear cases, moving layout, drag cancellation and keyboard | [144 passed](touch-quiz-chromium.json) | Local Chromium |
| D/D♯/D♭ across all registers and six clear/skip layouts | [30 passed](touch-quiz-firefox.json) | Local Firefox |
| Same D spelling/register and clear/skip checks | [30 passed](touch-quiz-webkit.json) | Local WebKit |
| General quiz, themes, persistence, offline and audio checks | [20 passed](touch-general-chromium.json) | Local Chromium |
| Phone/tablet safe areas, rotation and action alignment | [10 passed](touch-viewport-chromium.json) | Local Chromium |
| D range, clear/skip and pointer confirmation checks | [32 passed](live-touch-quiz-chromium.json) | Production |

All browser tests use headless engines and simulated viewports. The moving-layout
case sends real Chromium touch events and deliberately moves the buttons between
press and release. No physical Honor MagicPad 2 or iPhone was attached, so the
original device's exact touch sequence is not reproduced. No uncaught page errors
were recorded in the passing checks.

Earlier training, calibration and bar-practice features were not changed. Their
wider exercise suites were not rerun for this quiz fix; see the
[practice-progress audit](https://github.com/Listwas/piano-quiz/blob/d5ffddca8d08d9bb65bc9e6d308b70ce92143fbb/docs/VERIFICATION.md).

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

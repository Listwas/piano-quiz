# Verification

Quiz bass/treble scaling fixed and published on 2026-11-12.

- Play: **https://piano-quiz.pages.dev/**
- Release: `7afcfb8e0e912e`
- Production deployment: `3c517b48-87c1-49cd-a486-3fbebcfbaa24`
- Immutable URL: https://3c517b48.piano-quiz.pages.dev/
- Repository: https://github.com/Listwas/piano-quiz

## Current release

**100 unit tests and 16 production browser scenarios passed.** Quiz notation
now uses the same minimum vertical frame in bass and treble clefs. The shorter
bass glyph previously enlarged the whole staff: the reproduction measured
31.72 px line spacing in bass against 22.16 px in treble on a 430 × 932 viewport.
The regression test failed before the fix and now requires spacing and
notehead widths to match within 0.1 px for the normal note range.

| Check | Result | Origin |
| --- | --- | --- |
| Existing settings, storage, quiz and training unit tests | [100 passed](unit.json) | Main source |
| Clef scale, extreme natural pitches and Pause/Resume | [16 passed](staff-scale.json) | Local build |
| Same clef-scale and control scenarios | [16 passed](live-staff-scale.json) | Production |
| Runtime asset bytes and response policies | [43 matched](live-assets.json) | Production |

The browser scenarios compare seven natural notes and a triad in both clefs,
then check the extremes of the supported octaves. Coverage includes 430 × 932,
800 × 1280, 1280 × 800 and 932 × 430, touch and simulated MIDI input, and
Paper and Nocturne. Tablet [bass](images/quiz-scale-bass-tablet.png) and
[treble](images/quiz-scale-treble-tablet.png) captures were visually inspected.
No uncaught page errors were recorded. Physical iPhone and Honor MagicPad 2
behavior was not retested.

The frame still expands for ledger notes and chords. Other behavior and
palettes are unchanged. Their wider suites were not rerun for this fix; see
the [Pulse release audit](https://github.com/Listwas/piano-quiz/blob/00ad5b2ed337d0fdd9c9af8c033bbed8fcd21ca1/docs/VERIFICATION.md)
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

# Verification

Nocturne promoted to main; release documentation finalized on 2026-11-12.

- Play: **https://piano-quiz.pages.dev/?theme=nocturne**
- Release: `6503f455786040`
- Production deployment: `0173f6ed-f119-4d51-a5e4-0699c6c4f245`
- Immutable URL: https://0173f6ed.piano-quiz.pages.dev/
- Repository: https://github.com/Listwas/piano-quiz

## Current release

**100 unit tests passed on main.** The published runtime is byte-identical to
the accepted Nocturne preview. All 43 served files matched the local build.

| Check | Result | Origin |
| --- | --- | --- |
| Unit tests | [100 passed](unit.json) | Main source |
| Quiz, themes, storage and offline launch | [20 passed](nocturne-browser.json) | Local Nocturne preview |
| Feedback contrast across themes | [Passed](nocturne-contrast.json) | Local Nocturne preview |
| Home, quiz, pause/resume and touch targets at four viewport sizes | [4 passed](nocturne-production.json) | Production |
| Runtime asset bytes and response policies | [43 matched](live-assets.json) | Production |

Production layout checks covered 430 × 932, 1280 × 800, 320 × 568, and
932 × 430. No uncaught page errors were recorded. These are simulated viewport
sizes; physical iPhone and Honor MagicPad 2 behavior was not retested.

See [Nocturne notes and screenshots](NOCTURNE.md). The earlier feature audit
for release `832bfaeaa7834d` recorded 33 browser scenarios across Chromium,
Firefox and WebKit. Those scenarios were not all rerun for this style release;
[the preserved baseline report](https://github.com/Listwas/piano-quiz/blob/4474695025269ee75c8c9180e33dcacef3c7fdfe/docs/VERIFICATION.md)
records their actual scope and build.

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

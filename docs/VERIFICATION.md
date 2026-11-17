# Verification

The Studio release `8741a3ae49a8f0` is live on [Piano Quiz](https://piano-quiz.pages.dev/). The [production deployment](https://b1640236.piano-quiz.pages.dev/) was built from `ab1a108`. The [asset comparison](studio-checks/live-assets.json) verified all 50 served files against the local build.

| Check | Result |
| --- | --- |
| Unit tests | 110 passed |
| Studio flows in Chromium, Firefox, and WebKit | 9 in each engine ([Chromium](studio-checks/chromium.json), [Firefox](studio-checks/firefox.json), [WebKit](studio-checks/webkit.json)) |
| Preview and production Studio flows | 9 on [preview](studio-checks/preview.json), 9 on [production](studio-checks/production.json) |
| Touch quiz and pointer capture | [144 passed](studio-checks/touch-quiz-chromium.json) |
| Safe areas, pinch and rotation | [10 passed](studio-checks/viewport-chromium.json) |
| Earlier integration checks during the redesign | [Quiz and offline](studio-checks/browser-chromium.json), [MIDI](studio-checks/midi-chromium.json), [training](studio-checks/training-chromium.json), [fullscreen and wake lock](studio-checks/display-chromium.json), [update](studio-checks/update-chromium.json), [staff scale](studio-checks/staff-scale.json), [notation and contrast](studio-checks/polish-chromium.json) |

A separate production check exported, restored and imported seeded data. The exact spelling (D♭), selected octaves and +42 ms MIDI adjustment survived the round trip. Integration reports list the build they tested. The phone and tablet profiles simulate dimensions, safe areas, rotation and visual viewport changes. Physical devices and instrument timing need a hardware check. Native Chromium also graded a note through the host's virtual MIDI loopback.

Screenshots: [Today](images/studio-today.png), [Practice on tablet](images/studio-practice.png), [quiz](images/studio-quiz.png), and [Flow report](images/studio-flow.png).

The earlier touch quiz release and its full checks are available in the [pre-Studio branch](https://github.com/Listwas/piano-quiz/tree/backup/pre-studio-2026-11-17).

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

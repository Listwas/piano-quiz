# Verification

Release `c8bffa0a76bf5c` adds a Sixteenths preset and includes the new note groups in Mix. All 115 unit tests passed. Chromium and WebKit verified individual touch and MIDI grading, phone and tablet notation bounds, and replay after reload at a slower tempo. The Chromium Studio suite passed all 12 scenarios. All 51 served assets matched the build, and selection and double-beam rendering passed a live browser check. [Release reports](sixteenth-notes-checks/) · [Production deployment](https://022ec2fd.piano-quiz.pages.dev/)

Release `5df001207a9ff6` adds beamed eighth-note pairs, suppresses button context menus, and starts a visual count-in if the audio clock stalls when replaying a bar. All 113 unit tests passed. Chromium ran the full training suite, and Chromium and WebKit both passed the focused replay, long-press and MIDI eighth-note checks. Device gestures and the stalled audio clock were simulated. All 51 served files matched the build, and all 12 Studio scenarios passed on the live site. [Release reports](rhythm-replay-checks/) · [Production deployment](https://29154966.piano-quiz.pages.dev/)

Release `75c13cb881c0d6` brings timed exercise options into Practice, saves Rhythm and Sight-reading patterns independently, and adds labelled staff examples, themed dropdowns, and automatic fullscreen on touch devices. All 111 unit tests passed. The Studio suite passed 12 scenarios each in Chromium, Firefox and WebKit, plus 12 on the live site. Quiz, timing, MIDI, display and rotation checks also passed. All 51 served assets matched the local build. The viewport tests simulate iPhone 14 Pro Max and Honor MagicPad 2 dimensions and safe areas. Physical device system bars and installed-app behavior were outside the browser checks. [Release reports](practice-polish-checks/) · [Production deployment](https://dfc6e96f.piano-quiz.pages.dev/)

Release `7036df5faa0e51` puts the key settings beside each exercise in Practice. Browser checks cover values applying at Start, settings surviving reload, the original quiz resuming from Today, and the shorter More options dialog. The Studio suite passed 11 scenarios each in Chromium, Firefox and WebKit and on [production](https://22ce5eec.piano-quiz.pages.dev/). Unit, quiz, MIDI, training, and viewport checks also passed. The [release reports](practice-setup-checks/) include all 50 served assets matched against the build.

Release `74a750bc606079` adds **Delete all data**. The confirmation keeps data intact on Cancel and clears settings, history and the browser backup on confirmation. Other open tabs reset and reloads start with empty history. All 110 unit tests passed. The Studio suite passed 10 scenarios in each of Chromium, Firefox and WebKit, and on the [production deployment](https://81812c93.piano-quiz.pages.dev/). The [verification reports](data-deletion-checks/) also include a byte comparison of all 50 served files.

The original Studio release `8741a3ae49a8f0` introduced the redesigned UI. The [production deployment](https://b1640236.piano-quiz.pages.dev/) was built from `ab1a108`. The [asset comparison](studio-checks/live-assets.json) verified all 50 served files against the local build.

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

# Verification

Published and tested on 2026-11-07 (Europe/Warsaw).

- Play URL: **https://piano-quiz.pages.dev/**
- Release: `abe288c1a2efc3`
- Cloudflare production deployment: `0e35a266-6783-4212-8a26-5840a1663649`
- Immutable deployment URL: https://0e35a266.piano-quiz.pages.dev/

## Production checks

All 35 served files were fetched from the production origin and compared byte
for byte with `dist/`. The home page returned HTTP 200. CSP and permissions
headers were verified. See [asset verification](live-assets.json).

| Browser engine | Live quiz checks | Viewport checks | Offline reload | Piano output signal | Update checks |
| --- | --- | --- | --- | --- | --- |
| Chromium | 20 passed | 10 passed | Passed | Verified | 4 passed |
| Firefox | 20 passed | 10 passed | Passed | Verified | 4 passed |
| WebKit | 20 passed | 10 passed | Passed | Host audio unavailable; graceful message verified | 4 passed |

All live quiz, viewport, and update runs cover this release and completed
without uncaught page errors. Reports record the exact
release hash, production origin, and testing time:
[live-chromium.json](live-chromium.json),
[live-firefox.json](live-firefox.json), and
[live-webkit.json](live-webkit.json).

Live checks cover startup, answer controls and touch sizes, automatic advance,
inline green correct-answer feedback and two-second red retry feedback, reload without double grading, pause/resume,
round completion, configuration validation/cancel, bass chords, all fourteen palettes
and saved preferences, 4.5:1 text/button contrast, disabled text selection,
mixed content/clefs, blocked storage, background
interruption, bottom-aligned Check/Next/Resume, and exact sharp/flat selections
from both Home and Settings. Selecting C♯ alone excludes D♭ questions and roots.
The octave check selects only C5, verifies MIDI 72 and the third treble space,
reloads its graded round, verifies saved history, rejects empty ranges, cancels
unsaved changes, and applies separate treble/bass ranges.

Each browser installed the real service worker from the HTTPS production site,
then reloaded and continued an unfinished quiz with browser networking offline.
Chromium and Firefox also played an actual piano sample, produced a measured
nonzero audio signal, and suspended the context when practice paused.

## Viewport checks

Each engine tested these simulated CSS viewport sizes:

| Profile | Width × height | Simulated safe insets |
| --- | --- | --- |
| iPhone 14 Pro Max portrait | 430 × 932 | Top 59, bottom 34 |
| iPhone 14 Pro Max landscape | 932 × 430 | Left/right 59, bottom 21 |
| Small phone | 320 × 568 | None |
| Honor MagicPad 2 portrait | 800 × 1280 | None |
| Honor MagicPad 2 landscape | 1280 × 800 | None |
| Desktop | 1440 × 900 | None |
| Compact tablet window | 1024 × 600 | None |

Reports: [Chromium](live-viewport-chromium.json),
[Firefox](live-viewport-firefox.json), [WebKit](live-viewport-webkit.json).

Home, quiz, correction, pause, and results fit without document scrolling or
clipped screen content. Check/Next/Resume retain the same vertical position and
stay inside the simulated safe area. Theme backgrounds match on the root and
body, with the shell covering the viewport bottom. Dialog scrolling still works.
On larger screens, the staff and answer controls share one centered column,
with the answers entirely below the staff. Portrait, landscape, and short tablet
windows keep all controls visible and retain the fixed bottom action row.

The suite verifies viewport scaling restrictions and cancellation of gesture and
double-click events. Chromium additionally sends a synthetic touch pinch and
checks that the visual viewport scale stays at 1. These checks do not reproduce
physical iOS or Android browser gestures or system chrome.

Phones use a native chord-quality picker; taller tablets show the full button
grid. Main screens stay fixed; dialogs can scroll. The root/body background and
safe-area layout follow [WebKit's iPhone layout guidance](https://webkit.org/blog/7929/designing-websites-for-iphone-x/).
The actual installed iOS white-strip issue remains unverified on hardware.

Three additional viewport checks cover consecutive rotations in tap/chord and
MIDI modes, plus the fallback when VisualViewport is absent. Real touchscreen
tap sequences hit Pause, Resume, Settings, letter and accidental controls at
their rendered positions. Each mode rotates six times through phone and tablet
sizes without a reload. A simulated VisualViewport resize removes 96px of visible
height while keeping the layout viewport unchanged; action buttons remain fully
inside the visible safe area and Pause/feedback retain their action-row position.
The settings dialog also uses the available visible height.

The shorter-height test exposed controls overflowing their landscape grid.
Very short landscape views now put dock actions side by side, and arrange
accidentals and chord type alongside one another below the letter row. The staff
can shrink in MIDI mode. The app tracks
[VisualViewport height and resize events](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)
and remains in normal document flow to avoid the fixed-position rotation
hit-testing issue described in [WebKit 235684](https://bugs.webkit.org/show_bug.cgi?id=235684).
This is a mitigation backed by automated geometry and touch tests; it does not
confirm the reported iPhone or Honor behavior on physical hardware.

The viewport suite enables all supported treble octaves and all 11 chord types.
Treble roots cover C3–B6; bass roots cover C1–B4. Selected spellings are combined
only with selected octaves. Notes retain separate history IDs per octave; chord
intervals and ledger lines are retained across register changes. Existing
single-octave preferences and unfinished rounds remain compatible.

## MIDI checks

Six browser MIDI scenarios pass in each engine:

- Unsupported/denied MIDI can return to saved Tap names mode.
- Explicit MIDI mode hides tap controls; hotplug, device selection and disconnect work.
- Recheck recovers after delayed same-port closure, a changed ID, and a stale device list.
- Actual played notes appear red for two seconds, then retry without duplicate
  grading; green success advances promptly and retry state survives reload.
- Full overlapping chords and sustain work; pause, dialogs, feedback, held keys,
  and Tap names mode do not accept stale MIDI answers.
- MIDI staff, red feedback, pause and dock fit all seven phone/tablet/desktop sizes.

Reports: [Chromium](live-midi-chromium.json), [Firefox](live-midi-firefox.json),
[WebKit](live-midi-webkit.json). These six scenarios inject MIDI device events
through a simulated Web MIDI API, including on engines without native MIDI.

Chromium additionally passed a **native Web MIDI virtual loopback**: the browser
opened ALSA Midi Through Port-0 through the actual API, sent C4 through that
virtual port, and the app received and graded the input correctly both before and after
pressing Recheck MIDI. This is not
a physical USB/Bluetooth keyboard test. The app itself opens only MIDI input;
only the test opens the named virtual output.

Production allows `Permissions-Policy: microphone=(), camera=(), midi=(self)`.
The app requests MIDI after Connect/Recheck or Start in the selected MIDI mode,
and uses `sysex: false`; loading the page never requests permission.
The [Web MIDI API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/requestMIDIAccess)
and [browser compatibility](https://github.com/mdn/browser-compat-data/blob/main/api/Navigator.json)
identify Safari/iOS and Firefox Android as unsupported; simulated WebKit success
does not imply native Safari MIDI support. Chrome Android exposes the API, but
physical connection on the user's Honor tablet remains unverified.

## Updates and automated tests

The real update suite served two worker versions on an isolated local origin.
In all three engines it verified that an update waits without interrupting a
question, explicit activation preserves the round and learning history,
first installation does not offer a stale update prompt, and activation replaces
the old app cache. It did not alter production.
See [Chromium](update-chromium.json), [Firefox](update-firefox.json), and
[WebKit](update-webkit.json) update reports.

`npm test`: **50 tests passed**. These cover all 11 chord qualities in all 12
keys and both registers, all 17 selectable written roots, exact-spelling pools,
octave validation, C5 staff placement, extreme chord notation, per-octave
histories, range-aware comparisons, legacy preferences and round restoration,
written-name grading, independent
clef histories, pool limits, review stages, early repetitions, interrupted
rounds, completion accounting, invalid storage, improvement comparisons,
audio tuning/fallback/cancellation, delayed audio startup, and service-worker
cache behavior. MIDI unit cases also cover channel-separated held notes,
velocity-zero Note Off, malformed/control data, stale opens, permission cancellation,
failed-open retry, exact pitches, stored MIDI answers, delayed-close ordering,
changed IDs, stale access refresh, saved input modes, per-question retry accounting,
final-question restoration, staff cue classes, and malformed stored responses.

The build contains 36 runtime/deployment files and excludes dependencies,
development files, and credentials. The ZIP is reopened after packaging;
its members, CRC integrity, and bytes are checked against the built files.
Archive size and SHA-256 are recorded in [release.json](release.json).

## Screenshots

Actual production-site browser captures, inspected during implementation:

- [MIDI practice mode](images/midi-mode.png)
- [MIDI settings](images/midi-settings.png)
- [MIDI correction](images/midi-correction.png)
- [Sunflower](images/theme-sunflower.png)
- [Rose](images/theme-rose.png)
- [Plum](images/theme-plum.png)
- [AMOLED](images/theme-amoled.png)
- [Higher C5 question](images/higher-c5.png)
- [Octave selection](images/octave-settings.png)
- [iPhone portrait home](images/iphone-14-pro-max-home.png)
- [iPhone portrait quiz](images/iphone-14-pro-max-quiz.png)
- [iPhone landscape results](images/iphone-14-pro-max-landscape-results.png)
- [Tablet portrait quiz](images/honor-magicpad-2-portrait-quiz.png)
- [Tablet landscape quiz](images/honor-magicpad-2-landscape-quiz.png)
- [Tablet MIDI after rotation and reduced visible height](images/rotation-tablet-midi-webkit.png)
- [Tablet chord controls after rotation and reduced visible height](images/rotation-tablet-touch-webkit.png)
- [Desktop quiz](images/desktop-quiz.png)
- [Inline wrong-note feedback](images/correction.png)
- [Pause screen](images/pause.png)
- [Theme chooser](images/themes.png)

## Limits

WebKit's Linux audio backend cannot start on this host: an independent plain
AudioContext probe remains suspended at time zero, and MP3 decoding fails.
The app reports unavailable audio and remains playable. This is not counted as
verified WebKit audio playback.

These are headless browser tests, not physical Android/iPhone tests. Simulated
safe areas and sizes cannot establish installed iOS system-bar behavior or
confirm that the reported white strip has disappeared on an iPhone 14 Pro Max.
Home-screen installation, actual OS safe areas, real mobile interruptions,
zoom restrictions, and audible playback remain physical-device checks.
No claim of physical Safari or Honor MagicPad 2 validation is made.

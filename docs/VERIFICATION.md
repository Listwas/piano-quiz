# Verification

Published and tested on 2026-11-07 (Europe/Warsaw).

- Play: **https://piano-quiz.pages.dev/**
- Release: `a8fde080222148`
- Production deployment: `a64fde56-aa66-413e-a149-c13caa294694`
- Immutable URL: https://a64fde56.piano-quiz.pages.dev/
- Repository: https://github.com/Listwas/piano-quiz

## Latest UI update

Release `a8fde080222148` shows exactly one bar at a time in Rhythm and Sight-reading,
on every screen size. The next bar appears during its existing count-in. Rhythm
input selection remains on Home.

All 71 unit tests and all 14 training scenarios passed in each of Chromium,
Firefox and WebKit against the local build. The checks verify one rendered bar,
rotation, touch and MIDI holds, guided and continuous reading, bar transitions,
count-ins, reconnects and note-picker controls. Reports:
[Chromium](training-chromium.json), [Firefox](training-firefox.json),
[WebKit](training-webkit.json).

The one-bar transition and count-in scenario also passed on production in
Chromium: [live check](live-training-focused-chromium.json).

## Full regression baseline

The comprehensive browser results below describe the preceding release
`66d5448b286fc3`. This small UI update was checked separately as described above.
The asset verification and archive metadata describe the current release.

All 39 served files were fetched from production and compared byte for byte with
`dist/`. HTTP 200, CSP and the MIDI permissions policy were checked.
See [asset verification](live-assets.json).

| Engine | Quiz | Viewport / rotation | MIDI | Training | Offline updates |
| --- | --- | --- | --- | --- | --- |
| Chromium | 20 passed | 10 passed | 6 passed + native loopback | 14 passed | 4 passed |
| Firefox | 20 passed | 10 passed | 6 passed | 14 passed | 4 passed |
| WebKit | 20 passed | 10 passed | 6 passed | 14 passed | 4 passed |

Reports record the exact build, origin and test time, with no uncaught page errors:
[live quiz](live-chromium.json), [viewport](live-viewport-chromium.json),
[MIDI](live-midi-chromium.json), [training](live-training-chromium.json),
and [updates](update-chromium.json). Matching Firefox and WebKit reports use the
same filenames with their engine names.

**71 unit tests passed**, including audio preparation and cancellation, MIDI
lifecycle and timestamps, exact written-note pools, all chord qualities, octave
selection, review accounting, save compatibility, offline caches, phrase generation,
audio/performance clock mapping, stable scoring targets, half-note duration checks,
late-delivered input, rest violations, guided retries and interrupted-bar recovery.
See [unit results](unit.json).

## Responsive MIDI quiz

Fresh single-note presses grade synchronously and advance or retry immediately.
A wrong key followed immediately by the right key succeeds in the same browser
script task. A fresh press can answer while another key is held; duplicate Note On
and old releases do not answer again. First-attempt history remains independent
of retries. Touch answers retain their readable feedback duration.

Chords still collect a complete overlapping phrase until physical key release,
then accept the next attempt without a feedback lockout. Tests cover sustain,
channels, partial chords, saved legacy feedback, pause, dialogs and reconnects.
Recheck recovers delayed closes, changed IDs and stale device lists. Native Chromium
also grades C4 through ALSA **Midi Through Port-0** before and after real Recheck.
Only that virtual output is used by tests; the app opens no MIDI output or SysEx.

These establish the absence of intentional application delays; they do not measure
physical keyboard transport latency.

## Metronome, rhythm and sight-reading

Fourteen training scenarios per engine verify:

- Scheduled, accented metronome clicks; pause, resume, mute and saved setup.
- Activity switching preserves the unfinished quiz.
- Phone/tablet rotation keeps metronome controls touchable.
- Real browser pointer press/releases distinguish a half note held for one beat
  from its required two beats; other correctly held notes score correctly.
- Rhythm notation and its pad fit rotating phone/tablet layouts.
- Simulated MIDI rhythm accepts different pitches and scores physical holds.
- Guided C5 sight-reading retries a wrong pitch and an early release, then advances
  after a valid two-beat hold; first-try pitch and duration scores remain separate.
- Continuous C5 reading keeps time and separates wrong pitches from short holds.
- Disconnect, Recheck, rotation and resume preserve sight-reading configuration;
  reload returns to setup without automatically starting audio or MIDI.
- Missing MIDI leaves the quiz, metronome and touch rhythm available.
- Save remains visible and receives touches at either end of the note picker,
  across phone/tablet portrait and landscape profiles.
- Home and live Touch/MIDI selectors switch the active input with explicit labels.
- Long presses retain the hold; context-menu events are cancelled. Chromium also
  uses a real browser touch sequence. This does not prove physical Android menus.
- Beginner MIDI attacks and shorter-but-valid holds score correctly, remain
  pending until release, and get a full read-ahead count-in before the next bar.

The shared clock schedules Web Audio ahead; animation frames do not schedule sound.
Output mapping settles during count-in and is frozen before the exercise. Timing
uses original input timestamps. Guided exercises wait for valid pitch and duration;
continuous exercises keep moving within each played bar. Beginner timing and
a full-bar read-ahead count-in between bars are defaults; Strict timing and
uninterrupted Flow are optional. Green appears only after a correct release;
the hold meter and release cue remain visible in both input modes. Pause restarts
the interrupted bar with a count-in,
retaining completed-bar results. Training preferences/results are separate from
quiz review history. Mixed clefs alternate between phrases; exact note selections
and octave ranges are retained.

## Mobile, offline and screenshots

Viewport coverage includes iPhone 14 Pro Max portrait (430 × 932) and landscape
(932 × 430), a 320 × 568 phone, Honor MagicPad 2 portrait (800 × 1280) and landscape
(1280 × 800), compact tablet windows (1024 × 600), and desktop (1440 × 900).
Safe areas are simulated. Consecutive rotations use real browser touch taps on
Pause, Resume and Settings. A simulated 96px visible-height reduction keeps action
rows inside the visible area and aligned across pause and feedback.

Main screens do not scroll; dialogs can scroll. Small phone and short landscape
exercise views show the current bar so notation stays readable. All fourteen themes and Device
preference, non-selectable text, pinch/double-click guards, exact sharp/flat
selection, higher C5 notation, saved rounds and background interruption are covered.

Each engine installs the production HTTPS service worker and continues a quiz after
a fresh offline reload. The isolated update suite serves two worker versions and
checks waiting activation, preserved rounds/history and replacement of the old cache.
The 40-file release ZIP is reopened to verify members, CRC integrity and exact bytes;
its size and SHA-256 are recorded in [release.json](release.json).

Authentic browser captures:

- [Quiz](images/gameplay.png)
- [Metronome](images/metronome-chromium.png)
- [Rhythm](images/rhythm-chromium.png)
- [Rhythm results](images/rhythm-results-chromium.png)
- [Guided sight-reading](images/sight-guided-chromium.png)
- [Tablet sight-reading](images/sight-tablet-chromium.png)
- [Tablet MIDI](images/rotation-tablet-midi-webkit.png)
- [Themes](images/themes.png)

## Limits

These are automated headless browser tests. Physical iPhone 14 Pro Max, Honor
MagicPad 2, USB/Bluetooth MIDI hardware, system bars, and acoustic timing have not
been measured. Native MIDI loopback is not a physical keyboard test.

Chromium and Firefox verify a real piano sample produces a nonzero audio signal.
WebKit's Linux audio backend cannot start in this environment; the app's explicit
visual-beat fallback and graceful unavailable-audio message are verified. This
does not establish physical Safari audio playback or MIDI compatibility.

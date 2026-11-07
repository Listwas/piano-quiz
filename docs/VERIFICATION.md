# Verification

Polish audit completed on 2026-11-07 (Europe/Warsaw).

- Play: **https://piano-quiz.pages.dev/**
- Release: `2ee1ed845ae73c`
- Production deployment: `8b89a7d7-11e1-4c3b-ac89-0ebbef3e8328`
- Immutable URL: https://8b89a7d7.piano-quiz.pages.dev/
- Repository: https://github.com/Listwas/piano-quiz

## Results

**82 unit tests and 174 browser scenarios passed.** The browser scenarios ran
against the published site in Chromium, Firefox and WebKit, except the isolated
update tests, which serve two worker versions locally. All reports record this
release hash and test time. No uncaught page errors were recorded.

| Check | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| Quiz and Home | [20 passed](live-chromium.json) | [20 passed](live-firefox.json) | [20 passed](live-webkit.json) |
| Safe areas, docks and rotation | [10 passed](live-viewport-chromium.json) | [10 passed](live-viewport-firefox.json) | [10 passed](live-viewport-webkit.json) |
| MIDI messages and reconnects | [6 passed](live-midi-chromium.json) | [6 passed](live-midi-firefox.json) | [6 passed](live-midi-webkit.json) |
| Service-worker updates | [4 passed](update-chromium.json) | [4 passed](update-firefox.json) | [4 passed](update-webkit.json) |
| Metronome, rhythm and sight-reading | [15 passed](live-training-chromium.json) | [15 passed](live-training-firefox.json) | [15 passed](live-training-webkit.json) |
| Visual polish regressions | [3 passed](live-polish-chromium.json) | [3 passed](live-polish-firefox.json) | [3 passed](live-polish-webkit.json) |

[Unit report](unit.json). Native Chromium Web MIDI was also tested through the
ALSA Midi Through loopback: C4 graded correctly before and after Recheck.
This is additional integration evidence, not a physical-keyboard latency test.

All **39 served runtime files** were fetched from production and compared byte
for byte with `dist/`; built runtime files were also compared with source, and
the source-derived release hash was verified. Home returned HTTP 200 and the
CSP and `midi=(self)` headers were checked. See [asset verification](live-assets.json).
The 40-file ZIP was reopened to verify its member list, CRC integrity and exact
bytes; [release.json](release.json) records its size and SHA-256.

## Findings fixed in this release

- The initial count-in could briefly show 5 in 4/4, or 4 in 3/4, while the audio
  scheduler prepared its first beat. It now starts at the actual meter count.
  The beat dots also stay neutral before that first beat. Checks cover both
  meters and resuming a paused exercise; retry countdowns keep their real length.
- An accidental on the first sight-reading note could crowd the time signature.
  There is now space between them, with the full bar width and cursor updated
  together. Dense eight-eighth-note fixtures cover accidentals, cancellations,
  both clefs and extreme high/low octaves across five phone/tablet layouts.

## Visual and interaction checks

Screenshots were inspected for Home, quiz, results and dense notation, including
phone and tablet landscape. Layout checks cover iPhone 14 Pro Max dimensions
with simulated safe areas, Honor MagicPad 2 portrait/landscape sizes, a 320px
phone and desktop sizes. They check scroll bounds, fixed action docks, successive
rotations, a reduced visible viewport, and real browser touch hit targets.

All fourteen palettes save and reload. Main text and primary controls meet a
4.5:1 contrast threshold in the tested states. The new checks additionally
verify mistake text at 4.5:1 and correct/incorrect notation at 3:1 against its
surface. These checks cover those states; they are not a complete accessibility
audit. Text selection, native hold-pad menus, zoom guards, the pinned note-picker
Save button, and modal scrolling are also covered.

Actual captures: [dense phone](images/polish-dense-iphone-chromium.png),
[phone landscape](images/polish-dense-iphone-landscape-chromium.png),
[tablet landscape](images/polish-dense-honor-landscape-chromium.png),
[dark feedback](images/polish-feedback-dark-chromium.png),
[quiz](images/gameplay.png), [small-phone results](images/small-phone-results.png).
Dense notation captures use deliberate edge-case fixtures rather than a random
exercise; feedback captures set a fixed message for contrast review.

## Gameplay coverage

Tests cover exact selected sharp/flat spellings and octave ranges, chords,
first-try scoring, retries, pause timing, saved history, blocked storage, offline
reloads, and explicit updates that preserve unfinished practice.

Training checks cover touch and MIDI hold lengths, nonblocking MIDI quiz input,
reconnect/recheck, metronome scheduling, full-meter release feedback, one visible
bar, preparation gaps, whole-bar sight-reading retries, ignored countdown input,
downbeat alignment and completed-bar preservation.

Unit and browser checks cover all four rhythm levels and saved preferences.
Generation tests verify full bars, rested/dotted values, eighth-note pairing,
balanced pattern reuse, cross-exercise history, exact selected pitches and
variety with naturals or a single pitch. Retry keeps the same music.

## Reproduce

See [the development commands](DEVELOPMENT.md#commands). Start the built preview,
then run `test:browser`, `test:viewport`, `test:midi`, `test:update`,
`test:training` and `test:polish` with `BROWSER=chromium`, `firefox`, or `webkit`.
Run suites sequentially because they share report/screenshot paths. Set
`PIANO_URL=https://piano-quiz.pages.dev/` to check production; the update suite
always uses its isolated local server. `npm test` runs the model tests.

## Limits

No physical iPhone 14 Pro Max, Honor MagicPad 2 or USB/Bluetooth keyboard is
attached. Safe areas and MIDI are simulated except for the native virtual
loopback. These results do not establish physical-device input/audio latency,
Home Screen system-bar behavior or Android's native menus.

Chromium and Firefox measured actual sample output and pause suspension.
WebKit's independent Linux audio backend cannot start on this host; the tests
verify the explicit unavailable-audio/visual-beat fallback instead. This does
not establish physical Safari audio or MIDI support. MIDI exercises use the
keyboard's own piano sound.

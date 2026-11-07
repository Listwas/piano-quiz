# Development

## Responsive MIDI input

Single-note MIDI answers now grade on a fresh Note On, using normalized press/release
events and original input timestamps. Incorrect attempts retry immediately; correct
attempts advance immediately. Color cues are visual only. Chords retain release-based
phrase capture, with no post-answer lockout. Storage writes are coalesced outside the
input callback, and page hide flushes progress. Touch feedback is unchanged.

## Timing activities

The metronome schedules Web Audio clicks 100 ms ahead with a 25 ms scheduling
interval. Output timestamps map audio time to the MIDI/performance clock. The
frame loop only renders the beat position; it does not schedule sound. Tempo and
meter changes apply on a bar boundary. Pause stops scheduled oscillators as well
as the scheduler. An explicit visual fallback is available if audio cannot start.
Training preferences use their own storage key; selecting another activity keeps
the unfinished quiz intact.

## Architecture

- `js/quiz.js`: pool enumeration, written-name grading, scheduling, round state,
  and summaries. Time and randomness are injectable for deterministic tests.
- `js/storage.js`: versioned `pianoQuiz.state.v1` storage, validation, round
  restoration, completion accounting, and graceful storage failure.
- `js/app.js`: screens, answer selection, staged practice configuration, dialogs,
  pause/resume, active-time measurement, and service-worker update UI.
- `js/viewport.js`: visible-viewport sizing, window-resize fallback, rotation
  settling, and the compact layout flag for short landscape views. The body
  stays in normal flow to avoid fixed-body iOS rotation hit-testing problems.
- `js/notes.js`, `js/chords.js`, `js/staff.js`, `js/clef-paths.js`: locally adapted
  music/notation code. No runtime imports from the sibling project.
- `js/midi.js`: opt-in Web MIDI access, input lifecycle, physical-key phrase
  capture, and exact-pitch matching. No output or SysEx permission is requested.
- `js/audio.js`: gesture-triggered sample playback, tuning correction, synthesis
  fallback, cancellation, and suspension when practice pauses.

Runtime stays buildless. `tools/build.mjs` copies a whitelist of runtime files to
`dist/`, creates headers, hashes runtime contents and the service-worker template,
and injects the core cache list. The source `sw.js` is a build template; preview
the built output rather than serving the source directory.

## Commands

```sh
npm ci
npm run build
npm test
npm run dev
# in another terminal, against the running preview:
BROWSER=firefox npm run test:browser
BROWSER=webkit npm run test:browser
npm run test:browser # Chromium
npm run test:update # isolated real service-worker update test
npm run test:midi # MIDI API/device simulation plus native Chromium virtual loopback
npm run test:viewport # safe areas, zoom guards, rotations and real touch targets
```

Tests use Playwright and are always headless. Chromium defaults to
`/usr/bin/chromium`; set `CHROMIUM_PATH` to override it. Firefox and WebKit use
Playwright's installed engines. Run one browser suite at a time; close the
preview server afterward. Never present headless emulation as a physical-device test.

Where loopback servers are prohibited but Firefox can run, this alternative
routes an HTTPS test origin to `dist/` entirely inside Playwright:

```sh
PIANO_IN_MEMORY=1 BROWSER=firefox npm run test:browser
```

In-memory routing checks real DOM interactions, modules, layout, and persistence.
It cannot establish actual hosting, browser service-worker installation, offline
startup, or physical audio behavior. The full suite runs the real offline check
only when `PIANO_IN_MEMORY` is not set.

Unit tests simulate the service-worker event and Cache APIs to check installation,
optional-file failure, update activation, and cache cleanup. Audio tests use a
controlled audio graph to check source selection, tuning, fallback and cancellation.
Those tests check program behavior; they do not prove browser integration.

The ordinary browser suite also verifies actual worker installation and offline
reloads. Its audio check measures a real sample signal and suspension on pause.
If a separate plain audio-context probe cannot start WebKit's audio backend, it
records that environment limit and verifies that the app reports unavailable audio.
It does not count this as verified WebKit audio playback.

`npm run test:update` serves two worker versions from an isolated local origin.
It checks waiting updates, explicit activation, preserved practice/history, and
old-cache replacement. It never changes the production deployment.

Browser reports include the tested release hash. Runs with `PIANO_URL` write
`docs/live-<engine>.json`; local runs write `docs/browser-<engine>.json`.
Screenshots in `docs/images/` are actual browser captures, not design mockups. Keep source credentials,
dependency directories, generated builds, and logs out of version control.

## Storage compatibility

No migration or import of the original app's preferences is required. This app
uses its own origin, identity, caches, and key. Malformed state falls back to
usable defaults; blocked or full storage displays a notice. Changes to content
start a new round after explicit Save; cancellation preserves the existing setup.

Settings optionally store `noteNames`, a list of exact written spellings. Legacy
states without it keep their pitch-class selection and existing round until the
user saves an explicit selection. Pools and chord roots then use only those
written names. Histories retain their clef, written name, and chord-quality IDs.

## Viewport and input

The root and fixed body share the current theme background. A constrained flex
shell uses dynamic viewport height and safe-area padding; no main screen scrolls.
Only dialogs scroll. Check, Next, and Resume share a bottom dock. Larger screens
stack the staff and answer controls in a centered column. Small phones
use a native chord-quality picker to keep all answer controls on screen.

Safe areas follow [WebKit's viewport-fit and safe-area guidance](https://webkit.org/blog/7929/designing-websites-for-iphone-x/).
The viewport meta disables scaling; touch gesture and double-click handlers guard
against browser zoom and page dragging. No Fullscreen API behavior is assumed.

`test:viewport` runs seven portrait/landscape and desktop profiles, including iPhone 14 Pro Max
and Honor MagicPad 2 sizes, with simulated safe insets. It checks home, quiz,
correction, pause, and results for clipping/scrolling, action placement, background
coverage, exact C♯ roots, modal scrolling, and zoom event cancellation. On larger
screens it also checks that answers sit below the staff on the same center line. Chromium
also sends an actual synthetic pinch. Reports are `docs/viewport-<engine>.json`
or `docs/live-viewport-<engine>.json` with `PIANO_URL`. Simulated layout and safe
areas cannot prove physical iOS Home Screen system-bar rendering.


## Octaves

Settings store `octaves: { treble: [...], bass: [...] }` independently for each
clef. Supported root octaves are 3–6 in treble and 1–4 in bass. Missing or invalid
values normalize to the legacy treble 4/bass 3 defaults, preserving old round
IDs. Every selected written spelling is combined with each selected octave.
Chord tones can extend above the root's octave while preserving written intervals.

The configuration validates a nonempty octave selection for each active clef.
Cancel keeps the current round; saving a changed active range starts a new round.
Item IDs already contain octave, so histories stay independent and existing IDs
remain valid. Storage now accepts the newly supported root octaves. Round
improvement comparisons also include the selected ranges. Feedback includes the
root register; answer grading continues to require only letter, accidental, and
chord quality when applicable.

Unit tests cover range validation, independent defaults, selected-only octave
pools, C5 at the third treble space, extreme chord notation, per-octave history
restoration, legacy rounds, and range-aware comparisons. Browser checks configure
C5 alone through the UI, verify its staff coordinate and MIDI 72, reload a graded
round, cancel range changes, and save mixed-clef wider ranges. Viewport tests
use all supported treble octaves with all chord types.


## MIDI, themes, and touch

`MidiKeyboard` requests access after Connect, Recheck, or Start in the selected
MIDI mode, using
`sysex: false`. It opens one selected input, handles hotplug, and releases its
port on disconnect. A missing selected device waits for reconnection rather than
switching silently to another keyboard. Failed opens and cancelled permission
requests cannot reattach a stale input. `Permissions-Policy` allows `midi=(self)`.

`MidiPhrase` tracks held keys separately per MIDI channel and accumulates the
notes in an overlapping gesture until all physical keys are released. Velocity-zero
Note On is Note Off. Sustain is ignored for phrase capture; All Notes Off and All
Sound Off cancel the phrase. Pauses, feedback, dialogs, hidden pages, input
changes, and new questions reset capture and require held keys to release first.
The quiz stores MIDI answers as `{ source: 'midi', notes: [...] }`; grading checks
the exact set of displayed MIDI pitches including octave. Touch grading retains
strict written spelling. MIDI never infers an enharmonic name from a key press.

`test:midi` runs device/permission scenarios through a simulated browser MIDI API.
Chromium additionally requests the real API and, when present, sends C4 through
the ALSA **Midi Through Port-0** virtual loopback to grade a real native input.
This test writes only to that named virtual output. It is not a physical keyboard
test. Playwright grants both Chromium MIDI permission descriptors for the native
probe; app requests still use `sysex: false`. No app MIDI outputs are opened.

Protocol and API references: [Web MIDI specification](https://webaudio.github.io/web-midi-api/),
[MIDI status bytes](https://midi.org/expanded-midi-1-0-messages-list),
[MIDI controller messages](https://midi.org/midi-1-0-control-change-messages),
[requestMIDIAccess](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/requestMIDIAccess).

Fourteen explicit palettes plus Device are validated by settings normalization.
The browser suite checks saved choices, real computed colors, and at least 4.5:1
contrast for body text and primary button text in every explicit palette on a dark
device preference. Global user-select and iOS callout styles prevent selection;
the browser suite double-clicks a heading to verify no text is selected.
Separate feedback panels have been removed. Correct notation stays green for
450 ms in MIDI mode or 900 ms in Tap names, then advances. Wrong played notation
is red for 2000 ms with a short shake before the same question becomes available
again. Skip reveals the target briefly and advances. `answer-status` announces
outcomes without relying on color; reduced-motion preferences disable the shake.


## Explicit input modes and retries

`settings.inputMode` is `touch` or `midi`, defaults to Touch for legacy state, and
saves immediately from Home or Settings. Switching mode preserves the current
question and updates its settings snapshot. MIDI mode hides tap controls, enlarges
the staff, and retains a fixed Skip/Recheck dock. Only this mode accepts MIDI
phrases. Disconnected MIDI time is excluded from active answering time.

The first answer to a question records history and a round answer. After wrong
feedback, `retryQuestion` sets `round.retrying` and clears the temporary feedback.
Later attempts update the inline cue without adding answers, review stages, or
accuracy credit. The initial miss stays in the results and review queue. Storage
restores both waiting retries and successful retries whose feedback differs from
the first answer, including the last question. Completion waits until the current
question has actually advanced. Invalid saved answer payloads discard the broken
round while keeping valid progress.

`MidiKeyboard.recheck` reacquires access and rebinds input. A shared close promise
ensures an old asynchronous `close()` cannot finish after a new `open()` and kill
that reopened connection. Binding and access generations ignore stale callbacks.
A missing ID can be replaced only by a unique name/manufacturer match. A closed
port is reopened on state refresh; focus/pageshow refresh state without prompting.
Recheck remains available in both the quiz and Settings.

Regression cases cover delayed closes, changed IDs, stale access maps, first-try
statistics, last-question retry restoration, actual played staff positions, red
cue duration, reduced-motion animation, fast green advance, saved input modes,
and hidden tap controls. Native Chromium loopback grades a note both before and
after using the real Recheck button.

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

## Rhythm practice

Rhythm generation uses durations in quarter-note beats, fills bars
exactly, and includes at least one sounded note in each bar. Four levels use
cached duration-pattern catalogs: Starter (quarters/halves), Steady (whole notes
and rests too), Moving (eighth-note pairs), and Challenge (dotted values and
syncopation). Moving only starts longer values on whole beats, so its eighths
remain paired. Each higher level introduces its new skill in the first bar.

Each new bar selects a least-used duration pattern and avoids the two most recent
patterns when possible. This visits every available pattern before repeating,
then distributes necessary repeats evenly. Starter has five 4/4 patterns and
three 3/4 patterns, so an eight-bar exercise necessarily repeats some. Rest
placement varies separately and cannot silence an entire bar. A small per-visit
history keyed by activity/level/meter carries the last two patterns across new
exercises; it is not persistent user history. Retrying a failed bar keeps its
original music.

Melodies prefer nearby selected pitches, spread practice across those pitches,
and avoid immediate repeats and repeated two-note oscillations when alternatives
exist. Widely separated selected octaves remain usable. Single-pitch pools retain
that exact written pitch while rhythmic variety stays independent.

Dotted quarter and half notes/rests use 1.5 and 3 quarter-note beats. Dots are SVG
circles; dotted half noteheads stay open. Rest dots occupy the third staff space,
following [Open University's notation examples](https://www.open.edu/openlearn/history-the-arts/music/an-introduction-music-theory/content-section-4.1).
Legacy `simple` and `mixed` preferences map to Starter and Challenge; `steady` and
`eighths` are additional validated settings. The pure session model
grades original press timestamps and matching physical releases separately.
A missed marker is provisional: a delayed message with an in-window timestamp
can still claim it. Rest checks use physical key intervals with boundary grace.
Pause discards the interrupted bar and its extra/retry counters, retaining prior
bars. Touch uses pointer capture and cancellation pauses the exercise. Native context
menus, selection and touchstart default gestures are cancelled on the hold pad.
Rhythm input is selected on Home. The active exercise omits the input selector
and its status row to leave more space for notation. Sight-reading retains its
MIDI connection label and Choose notes shortcut.

Beginner tolerance defaults to ±220 ms for attacks (capped at 45% of adjacent
onset spacing), and ±30% of note length or 140 ms for holds (capped at 40% for short notes). Strict retains
±100 ms and ±15% or 60 ms. A half-length half note fails either setting.
Attacks remain pending until release; only validated notes turn green. The
hold meter uses actual press time, with an explicit release cue and measured
versus expected beat lengths on a bad release. Only unreleased notes are failed
when the exercise ends. Sight-reading also fails an overdue hold during play.
A valid release latches the meter at 100% for 200 ms; a fresh attack clears the
latch immediately, without input delay. Progress uses explicit themed browser
track/fill styles so its full value reaches the end of the track. Slightly early
first attacks use the same window.

Practice pacing inserts one unscored, full-bar count-in between played bars.
The score renders only the current bar at every viewport size. The session's
expected-time and position functions include these gaps, so the
next measure appears before its first deadline and cannot be marked missed
during preparation. Resume starts at the interrupted bar without carrying its
previous gaps. Flow pacing omits gaps between successful bars. In Sight-reading, mistakes
still retry the bar with either pacing choice.

The note picker has its own scrolling choices and a fixed header/action footer,
including validation errors. Save stays visible at any list position.

## Sight-reading

Single-voice phrases use only selected written note names and octave groups.
Mixed clefs alternate per generated phrase. Sight-reading always grades onset
timing, pitch and physical hold/release. A failed pitch, onset, release, missing
note or violated rest resets all results in the failed bar. Completed earlier
bars survive; the retry count persists. The existing metronome keeps running.
`nextDownbeat()` selects a restart on its original bar grid, and a session offset
remaps the failed bar to that beat. The on-screen countdown and timer use the
same target. Input during the wait cannot claim a note. Pausing or disconnecting
cancels that countdown and resumes with a fresh count-in. The old per-note
`guided` model flag remains internal compatibility code; the app never passes
it. Onsets and note lengths are independent scores. The clock maps audio
output into the performance time domain during count-in, then freezes that mapping
200 ms before the exercise, preventing output estimates from moving scoring targets.
Generated note values are whole, half, quarter and eighth notes, with corresponding
rests. Score rendering reuses the existing clef paths; notation uses SVG shapes
and explicit accidental cancellation. No Unicode musical-plane font is required.

## Architecture

- `js/training-report.js`: session overview, per-bar drill-down and saved
  report display. Sight-reading keeps failure and matched-press totals per bar
  separately from the score, so a retry only clears the live notation. The
  headline is bars cleared without a retry. Rhythm keeps the completed pass
  percentages and also carries judged mistakes forward across interruptions.
  Reports distinguish timing of matched presses from misses and off-beat
  presses; the mean uses absolute distances so early and late do not cancel.
  Practice time includes read-ahead and retry waits, but excludes pauses and
  the count-ins after starting/resuming. Older saved results still load
  without fabricated detail.
- `js/training-history.js`: bounded local history and recent trend points
  grouped by the original training settings. History stores the notation
  needed to replay each bar. A drill reconstructs that bar at beat zero and
  leaves the full-session result and history untouched.
- `js/calibration.js`: audio count-in and one MIDI onset per measured beat.
  The estimate uses the median of consistent matched taps; sparse, unstable
  and out-of-range runs cannot be applied. Calibration owns its own clock,
  stops on disconnect/close/backgrounding, and applies only on confirmation.

- `js/display.js`: visible-practice screen wake locks, release/reacquisition,
  opt-out, and native fullscreen controls. Pending wake requests are invalidated
  when practice closes or the page hides, so a late result cannot hold the screen
  awake. OS releases are reported with an explicit Retry rather than a busy loop.
  Fullscreen calls run directly from toolbar/settings gestures with
  `navigationUI: 'hide'`; native fullscreen events update labels and viewport fit.
  The manifest requests fullscreen with the browser's standard fallback chain.
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

Display APIs are feature-detected and requests may be declined by browser or
power policy. Headers allow same-origin `screen-wake-lock` and `fullscreen`.
See [Screen Wake Lock](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
and [requestFullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen).
Headless API success does not establish that Honor MagicPad 2 system bars are
hidden or that a physical device stays awake beyond its configured timeout.

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
npm run test:staff # equal clef scale and extreme notes
npm run test:training # metronome, rhythm holds, timed bar retries, MIDI and rotation
npm run test:polish # count-ins, dense notation/extreme ranges and all-theme feedback contrast
npm run test:display # wake locks, background recovery, fullscreen and unavailable APIs
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

`MidiPhrase` handles chord input and tracks held keys separately per MIDI channel and accumulates the
notes in an overlapping gesture until all physical keys are released. Velocity-zero
Note On is Note Off. Sustain is ignored for phrase capture; All Notes Off and All
Sound Off cancel the phrase. Pauses, feedback, dialogs, hidden pages, input
changes, and new questions reset chord capture and require its held keys to release
first. Single-note questions instead accept every fresh normalized Note On, even
when another key is still held.
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

Sixteen explicit palettes plus Device are validated by settings normalization.
The browser suite checks saved choices, real computed colors, and at least 4.5:1
contrast for body text and primary button text in every explicit palette on a dark
device preference. Global user-select and iOS callout styles prevent selection;
the browser suite double-clicks a heading to verify no text is selected.
Separate feedback panels have been removed. Touch answers retain 900 ms green
feedback and 2000 ms red retry feedback. MIDI advances or retries immediately;
120 ms green and 180 ms red cues never block input or replace the target. Skip
reveals the target briefly and advances. `answer-status` announces
outcomes without relying on color; reduced-motion preferences disable the shake.


## Explicit input modes and retries

`settings.inputMode` is `touch` or `midi`, defaults to Touch for legacy state, and
saves immediately from Home or Settings. Switching mode preserves the current
question and updates its settings snapshot. MIDI mode hides tap controls, enlarges
the staff, and retains a fixed Skip/Recheck dock. Only this quiz input mode accepts MIDI
quiz answers; training activities route their own normalized press/release events. Disconnected MIDI time is excluded from active answering time.

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
statistics, last-question retry restoration, immediate wrong/correct presses,
legato input, duplicate Note On suppression, legacy chord-feedback restoration,
saved input modes, and hidden tap controls. Native Chromium loopback grades a note both before and
after using the real Recheck button.

## Quiz staff scaling

Both clefs share the treble glyph's minimum vertical frame. Bass notation no
longer grows to fill a shorter viewBox; staff spacing and notehead size match
for the normal note range. The frame still expands for ledger notes and chords.

`npm run test:staff` compares seven notes and a chord in each clef, checks
extreme natural pitches, and exercises Pause/Resume across phone/tablet sizes,
touch/MIDI input and Paper/Nocturne. It uses simulated MIDI and viewports.

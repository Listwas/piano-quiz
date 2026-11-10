# Verification

Session-report release checked on 2026-11-11 (Europe/Warsaw).

- Play: **https://piano-quiz.pages.dev/**
- Release: `169798f621e9a2`
- Production deployment: `2850a9c7-7d9e-4a0e-85cb-4d78621ee23e`
- Immutable URL: https://2850a9c7.piano-quiz.pages.dev/
- Repository: https://github.com/Listwas/piano-quiz

## Current release

**96 unit tests and 72 browser scenarios passed.** The browser checks ran on
production except for the isolated update suite. Reports below identify the
build and test time. No uncaught page errors were recorded.

| Check | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| Practice and reports | [16 passed](live-training-chromium.json) | [16 passed](live-training-firefox.json) | [16 passed](live-training-webkit.json) |
| Quiz, themes, storage and offline launch | [20 passed](live-chromium.json) | — | — |
| Explicit service-worker updates | [4 passed](update-chromium.json) | — | — |

[Unit report](unit.json). A dash means that suite was not rerun for this build.
See the [previous audit](https://github.com/Listwas/piano-quiz/blob/aaa9085c5d620f054c4ba22a30de79f801fd0213/docs/VERIFICATION.md)
for the fullscreen, wake-lock and broader viewport checks.

## Session-report checks

- The sight-reading fixture completes two bars with two retries on the first
  bar (wrong pitch and short hold). The visible report shows **1/2 first-try
  bars** and **2 bar retries**, even though the final replay was correct.
  Bar details show the two distinct mistakes and matched-press timing.
- A separate replay misses a note in the second bar. Its miss stays in the
  report after correct replay, and the first bar keeps its clean result.
- Tests cover earlier mistakes across pauses, time excluding pauses and
  start/resume count-ins, signed timing distribution, and loading older
  results without inventing details. Multiple presses in one rhythm rest are
  reported as one violated rest, including a brief unwanted tap.
- The eight-bar rhythm fixture deliberately plays no notes. All misses appear
  on the chart, and timing correctly reports no matched presses. The last bar
  and bottom actions stay tappable in compact portrait/landscape and tablet
  sizes. A completed sight-reading report is also checked through rotations
  with simulated safe areas.
- The latest detailed report is available from Home after reloading. A bar can
  be selected directly from the chart or inside the report dialog. The results
  screen itself stays fixed, with scrolling available inside the dialog.

Actual browser screenshots: [Sight-reading overview](images/sight-report-chromium.png),
[bar details](images/sight-report-details-chromium.png),
[Rhythm overview](images/rhythm-results-chromium.png).

## Release integrity

All **41 served runtime files** matched `dist/` byte for byte. Source files
matched the built runtime and reproduced the release hash. Home returned HTTP
200; CSP and same-origin MIDI, wake-lock and fullscreen policies were checked.
See [asset verification](live-assets.json). The 42-file release ZIP was reopened
and checked for exact members, CRC and bytes; [release.json](release.json)
records its size and SHA-256. Chromium verified an offline launch and explicit
service-worker updates that preserve unfinished practice.

## Reproduce and limits

Run `npm run build`, `npm test`, then `npm run dev`. Run `npm run test:training`
with `BROWSER=chromium`, `firefox` or `webkit`. Set
`PIANO_URL=https://piano-quiz.pages.dev/` to test production. See
[development commands](DEVELOPMENT.md#commands) for other suites.

MIDI and safe areas are simulated. Deterministic WebKit exercises use the app's
visual clock because the headless host audio clock can stall; the native
metronome scenario is separate. Tests do not measure a physical device's
MIDI/audio latency.

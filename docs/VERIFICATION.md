# Verification

Screen wake-lock and fullscreen update checked on 2026-11-10 (Europe/Warsaw).

- Play: **https://piano-quiz.pages.dev/**
- Release: `7ec3cb31f0f6a5`
- Production deployment: `3dcf1ad1-026b-4099-a3c0-5da387f2ceab`
- Immutable URL: https://3dcf1ad1.piano-quiz.pages.dev/
- Repository: https://github.com/Listwas/piano-quiz

## Current release

**92 unit tests and 90 browser scenarios passed.** Browser checks ran against
production, except the isolated update suite, which serves two worker versions
locally. Every current report below records this release hash and test time.
No uncaught page errors were recorded.

| Check | Chromium | Firefox | WebKit |
| --- | --- | --- | --- |
| Screen controls | [7 passed](live-display-chromium.json) | [7 passed](live-display-firefox.json) | [7 passed](live-display-webkit.json) |
| Safe areas, docks and rotation | [10 passed](live-viewport-chromium.json) | [10 passed](live-viewport-firefox.json) | [10 passed](live-viewport-webkit.json) |
| Quiz, themes, storage and offline launch | [20 passed](live-chromium.json) | — | — |
| Metronome, rhythm and sight-reading | [15 passed](live-training-chromium.json) | — | — |
| Explicit service-worker updates | [4 passed](update-chromium.json) | — | — |

[Unit report](unit.json). A dash means that suite was not rerun in that engine
for this release. The preceding broader polish audit is preserved in
[the November 7 report](https://github.com/Listwas/piano-quiz/blob/6e354ec4b56dcdb081848b9514497137f0f16abd/docs/VERIFICATION.md).

## Screen behavior

- Keep screen awake defaults on for existing and new users. A screen wake lock
  is requested while a quiz, metronome or exercise is open, including a paused
  practice screen. Home and results release it. Users can opt out in App settings.
- Backgrounding/pagehide releases the lock; returning requests it again while
  practice remains open. A late request cannot retain a lock after leaving.
  OS releases and denied requests show their state and offer Retry. Unsupported
  APIs leave practice usable and explain the limitation.
- The top-bar four-arrow button and App settings → Screen both call the native
  fullscreen API with `navigationUI: 'hide'`. Labels follow native entry/exit,
  including Back/Escape. Refusal opens settings with an explanation and retry.
- Installed apps now request manifest `display: fullscreen`; unsupported modes
  use the browser's normal fallback. Viewport fitting runs after native
  fullscreen transitions. Header controls remain touchable online and offline
  across phone/tablet portrait and landscape sizes, including 320px width.

Both **Chromium and Firefox** acquired and released native screen wake locks,
and entered/exited native fullscreen in the headless host. Separate simulated
API cases cover release recovery, persisted opt-out, missing APIs, rejection,
all four activities, and the exact hidden-navigation request. WebKit checks
cover its available native paths and the graceful unavailable-API fallback;
its report records the host's actual capabilities.

Screenshots: [Chromium settings](images/display-settings-chromium.png),
[Firefox settings](images/display-settings-firefox.png),
[WebKit settings](images/display-settings-webkit.png). These are actual browser
captures; the settings scenario uses simulated APIs for deterministic labels.

## Release integrity

All **40 served runtime files** were fetched from production and compared byte
for byte with `dist/`. Built runtime files were compared with source and the
source-derived release hash was verified. Home returned HTTP 200. Headers allow
same-origin `fullscreen`, `screen-wake-lock` and `midi`; CSP was recorded in
[asset verification](live-assets.json).

The 41-file release ZIP was reopened to verify its exact member list, CRC
integrity and bytes. [release.json](release.json) records its size and SHA-256.
The general browser check also confirms a fresh offline launch, sample output,
saved preferences, and unchanged quiz grading. Training and explicit update
checks cover bar retries, hold feedback, preparation gaps and preserved progress.

## Reproduce

Build, run `npm test`, and start the preview using `npm run dev`. Run
`npm run test:display` and `npm run test:viewport` with `BROWSER=chromium`,
`firefox`, or `webkit`. Set `PIANO_URL=https://piano-quiz.pages.dev/` for production.
Run browser suites sequentially because reports/screenshots share paths.
See [all development commands](DEVELOPMENT.md#commands).

## Physical-device limits

No Honor MagicPad 2, iPhone 14 Pro Max or physical MIDI keyboard is attached.
Native browser API success does not establish physical screen timeout behavior,
system-bar hiding, gesture navigation behavior, or acoustic/input latency.
Browser and power policy can decline a wake lock; a manifest cannot force the
OS to hide system UI. The requested tablet check is opening the updated app,
tapping the four-arrow button, and leaving a practice screen open beyond the
usual screen timeout. Physical confirmation is still pending.

WebKit's Linux audio backend cannot start on this host; earlier independent
checks verify the explicit visual-beat/unavailable-audio fallback. This does
not establish Safari audio or MIDI support on iPhone. MIDI exercise sound comes
from the keyboard itself.

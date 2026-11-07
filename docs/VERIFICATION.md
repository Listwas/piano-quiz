# Verification

Published on 2026-11-07 (Europe/Warsaw).

- Play: **https://piano-quiz.pages.dev/**
- Release: `7b4d29b330ec0d`
- Production deployment: `728fabfc-04a2-44b7-aca5-ac647e47ad50`
- Immutable URL: https://728fabfc.piano-quiz.pages.dev/
- Repository: https://github.com/Listwas/piano-quiz

## Current levels update

**82 unit tests passed.** All 15 training scenarios passed in each of Chromium,
Firefox and WebKit against this local release build. The four-level setup,
generated note values and saved preferences also passed on production in each
engine. Reports record this hash, origin and test time, with no uncaught page
errors.

| Check | Chromium | Firefox | WebKit | Origin |
| --- | --- | --- | --- | --- |
| Full training | 15 passed | 15 passed | 15 passed | Local release build |
| Four-level UI and preference reload | 1 passed | 1 passed | 1 passed | Production |

Reports: [units](unit.json), [training Chromium](training-chromium.json),
[training Firefox](training-firefox.json), [training WebKit](training-webkit.json),
[live Chromium](live-training-focused-chromium.json),
[live Firefox](live-training-focused-firefox.json),
[live WebKit](live-training-focused-webkit.json).

All **39 served files** were fetched from production and compared byte for byte
with `dist/`. Home returned HTTP 200; CSP and `midi=(self)` were checked. See
[asset verification](live-assets.json). The 40-file release ZIP was reopened to
verify members, CRC integrity and exact bytes; its size and SHA-256 are recorded
in [release.json](release.json).

## Rhythm and melody variety

Four levels are available in both Rhythm and Sight-reading: Starter (quarters and
halves), Steady (longer holds and rests), Moving (paired eighths), and Challenge
(dotted values, rests and offbeats). Each introduces its new skill in the first
bar. Legacy Simple and Mixed preferences become Starter and Challenge.

The generator chooses among least-used duration patterns and avoids the two
most recent patterns when alternatives exist. Every available pattern is used
before a repeat, and necessary repeats are distributed evenly. Tests cover
constant random sources as well as a seeded generator. Starter has five patterns
in 4/4 and three in 3/4; longer exercises necessarily reuse some, without adjacent
duplicates. Moving and Challenge produce eight distinct rhythm patterns in the
eight-bar fixtures. A small per-visit history also separates repeated patterns
across new exercises with the same activity, level and meter.

Every bar fills its meter exactly and contains sound. Moving keeps eighths in
pairs. Challenge introduces dotted quarter/half notes and rests, rendered with
SVG dots and the appropriate open or filled heads. Rest dots occupy a staff
space. The same beat-duration model grades fractional note lengths.

Selected spellings, octaves and clefs still define the entire pitch pool. Tests
cover all four levels, both meters, all clefs, exact flats, seven selected naturals,
a single selected pitch, and widely separated octaves. Rhythm diversity remains
available with just one pitch. Melodies balance selected pitch use, favor nearby
notes and avoid immediate repeats or repeated two-note oscillation where possible.

Existing training checks still verify MIDI and touch holds, full-meter release
feedback, entire-bar sight-reading retries, ignored retry-countdown presses,
metronome alignment, completed-bar preservation, reconnects, one-bar notation,
phone/tablet rotation and the pinned note-picker Save button. Retrying keeps the
same music rather than generating a replacement bar.

Screenshots: [Challenge rhythm](images/rhythm-challenge-chromium.png),
[bar retry](images/sight-guided-chromium.png), [tablet](images/sight-tablet-chromium.png).
These are actual browser captures.

## General app baseline

The preceding release `4841977d1ebe7a` passed 20 general quiz/Home checks,
10 viewport/rotation checks and 4 isolated service-worker update checks per engine
on Chromium, Firefox and WebKit. Those reports remain in [live quiz](live-chromium.json),
[viewport](live-viewport-chromium.json) and [updates](update-chromium.json), with
matching engine filenames. General tests include a fresh offline production reload,
all fourteen themes, saved quiz history and exact sharp/flat selections. This
update changes exercise generation and notation; the focused current checks above
are separate from that broader baseline.

## Limits

These are automated headless browser checks with simulated safe areas and MIDI.
Physical iPhone 14 Pro Max, Honor MagicPad 2, USB/Bluetooth transport, system bars,
Android menus and acoustic timing have not been measured. Browser emulation and
virtual MIDI do not establish physical-device latency.

Chromium and Firefox previously verified actual sample output. WebKit's Linux
audio backend cannot start on this host; current training checks verify the
explicit visual-beat fallback. This does not establish physical Safari audio or
MIDI support. MIDI exercises use the keyboard's own piano sound.

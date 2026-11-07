<p align="center"><img src="icons/icon-192.png" width="80" alt="Piano Quiz icon"></p>

<h1 align="center">Piano Quiz</h1>
<p align="center">Read a note. Find its name. Make it second nature.</p>
<p align="center"><a href="https://piano-quiz.pages.dev/"><strong>Open Piano Quiz →</strong></a></p>

A little piano practice for your phone or tablet. Learn to recognise notes and
chords on the staff, with short quizzes you can fit into your day.

<p align="center"><img src="docs/images/gameplay.png" width="310" alt="Piano Quiz showing a staff and large note-answer buttons"></p>

## Start in a minute

1. [Open the app](https://piano-quiz.pages.dev/).
2. Tap **Choose notes** to pick your clef, notes, octaves, and chord types.
3. Choose **Tap names** or **MIDI keyboard**, then tap **Let’s practise**.

With tap answers, choose the letter and accidental, then **Check answer**. For
chords, choose the root and chord type too. With MIDI, play the exact displayed
note. Chords are checked after you release the keys.

Green means correct. Red gives you another chance to try the same question.
MIDI notes react on key press: mistakes never block your next attempt.
**I don’t know yet** or **Skip note** shows the answer and moves on. Your score
counts your first attempt, so retries help you learn without adding extra misses.

## Practise what you need

| Choose | Make it yours |
| --- | --- |
| Notes, chords, or both | All 11 supported chord types |
| Treble, bass, or mixed clefs | Separate progress for each clef |
| Naturals, sharps, and flats | Only the written names you select |
| Different octaves | Higher notes, lower notes, and ledger lines |
| Short sessions | 10 or 20 questions, with pause and resume |
| Your favourite look | 14 themes, plus your device preference |

Want higher C? In **Choose notes → Staff range**, select **C5–B5** under Treble.
C5 sits in the third space. Keep C4–B4 selected if you want to practise both.

Choosing C♯ does not add D♭ to the quiz. Tap answers check the written spelling;
a MIDI keyboard checks the sounding pitch and octave.

## Connect your keyboard

Choose **MIDI keyboard** and start practice, then allow MIDI access when asked.
You can select an input in **App settings**. If unplugging and reconnecting stops
working, tap **Recheck MIDI**.

Notes answer immediately on key press. For chords, hold the displayed tones together, then release them. The app reads
physical key releases, so the sustain pedal does not keep an answer open.
Use your keyboard’s own sound, or enable **Piano after answering**.

MIDI needs a browser with Web MIDI support, such as Chrome on Android or a
compatible desktop browser. Safari on iPhone/iPad and Firefox on Android do not
provide Web MIDI; tap answers still work there.
[Check browser support](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/requestMIDIAccess#browser_compatibility).

## Make it a small daily habit

Finish one round for your daily goal. Missed notes come back for more practice,
and the app spaces out reviews as you learn. There is no penalty for taking a day off.

Your preferences and unfinished round save in this browser. No account,
microphone, subscription, or tracking is needed. Progress stays on your device;
it does not sync between browsers.

### Install and practise offline

Use **Install app** or **Add to Home Screen** in your browser. App settings will
tell you when offline practice is ready. Reopen the app and choose **Update app**
when an update is offered; your learning history stays saved.

## For developers

Requires Node.js 24 or newer.

```sh
npm ci
npm run build
npm test
npm run dev
```

Open **http://127.0.0.1:8421/**. Rebuild after source changes.

[Development guide](docs/DEVELOPMENT.md) · [Tests and device limits](docs/VERIFICATION.md) · [Cloudflare deployment](DEPLOY.md)

## Credits

Adapted from the notation and music theory in the original `random_piano` app.
Piano recordings: **Salamander Grand Piano V3**, Alexander Holm, CC BY 3.0.
[Sample credits](audio/CREDITS.txt). The treble-clef outline is public domain;
its attribution is preserved in the source.

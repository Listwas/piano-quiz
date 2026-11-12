# Cloudflare Pages

Play: **https://piano-quiz.pages.dev/**

Project: `piano-quiz`, production branch `main`, account
`3bbe51d8973c406839b993e52753a08c`. This is an independent static Pages app;
the original `random-piano` app is unchanged.

Release `863902201daef0` was published as production deployment
`3481aa9e-e355-4fe4-8dae-61e8d766bea7`:
https://3481aa9e.piano-quiz.pages.dev/

## Publish an update

```sh
cd /home/ben/code/piano_quiz
npm ci
npm run build
npm test
npm run deploy
```

`npm run deploy` rebuilds and publishes `dist/` to the existing project. The
deployment script verifies account access with `wrangler whoami` first and pins
the account and project. It does not publish or modify a Worker.

Wrangler uses the normal OAuth credentials outside this repository. If the login
cannot refresh, run `npx wrangler login` in an interactive terminal. No credentials
belong in source files or archives. Wrangler logs default to
`/tmp/piano-quiz-wrangler.log`.

## Verify a release

Compare every served runtime file with the local build, including `/version.json`,
then run the browser suite on the production URL:

```sh
PIANO_URL=https://piano-quiz.pages.dev/ BROWSER=chromium npm run test:browser
PIANO_URL=https://piano-quiz.pages.dev/ BROWSER=firefox npm run test:browser
PIANO_URL=https://piano-quiz.pages.dev/ BROWSER=webkit npm run test:browser
npm run test:update
PIANO_URL=https://piano-quiz.pages.dev/ npm run test:midi
PIANO_URL=https://piano-quiz.pages.dev/ npm run test:viewport
PIANO_URL=https://piano-quiz.pages.dev/ npm run test:training
```

The update suite uses an isolated local origin and two worker versions; it does
not change the production site. It checks that updates wait and preserve the
current round, correction, and learning history.

Record the deployment ID, tested build hash, and results in
`docs/VERIFICATION.md`. Inspect a phone screenshot and verify an offline reload.
Physical mobile installation and audio behavior remain device-specific checks.

For a separate new project, set `PIANO_PAGES_PROJECT` to a new unique name and run
`node tools/deploy.mjs --create`; use that same variable for subsequent deploys.

Cloudflare's [Direct Upload documentation](https://developers.cloudflare.com/pages/get-started/direct-upload/)
describes the Wrangler publication flow.

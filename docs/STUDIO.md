# Studio redesign

Today suggests a short session, Practice configures a chosen activity, and Progress opens earlier results. Exercises use a fixed footer and share the notation surface and feedback styles. Sight-reading Practice retries a failed bar. Flow previews the next measure, keeps the same clock through mistakes, and saves a separate comparison setup.

Studio adds `pianoQuiz.studio.v2` for appearance, quiz reports, and review schedules by input. It retains the existing quiz and training keys. On first load it copies both legacy strings into `pianoQuiz.backup.preStudio.v1` before writing to either. An old between-bar pace of `flow` still means no gap in Practice. Only the new `continue` behavior selects Flow. A successful drill keeps the original report and adds its practised tempo.

In Settings, Export progress saves the current data to a JSON file. Import progress replaces the current data after exporting a copy. Restore data from before the redesign returns both legacy keys to the saved snapshot and exports the current progress first. Delete all data permanently clears progress, settings and that browser backup after confirmation. Files you exported are kept.

The project backup is available in the [pre-Studio branch](https://github.com/Listwas/piano-quiz/tree/backup/pre-studio-2026-11-17). The local archive includes the entire project with its Git history, dependencies and previous build. See `../piano_quiz_backups/RESTORE.md` beside the checkout.

Run `npm test`, `npm run build`, and `npm run dev`, then `npm run test:studio`. The last command covers seven simulated viewports, legacy data, theme contrast, quiz feedback and sight-reading Flow with simulated MIDI. Use `BROWSER=firefox` or `BROWSER=webkit` to check the same scenarios in those engines.

The local fonts are Manrope and Newsreader. Their SIL Open Font Licenses are in the [fonts directory](../fonts).

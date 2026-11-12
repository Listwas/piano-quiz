# Pulse

Pulse pairs warm paper with coral controls and a bold heading. It is available
in **App settings → Appearance**. The theme picker now has sixteen explicit
palettes in eight complete rows, plus the full-width Device option.

Runtime: `863902201daef0`.

- [Phone Home](images/pulse-home-430.png)
- [Tablet Home](images/pulse-home-1280.png)
- [Phone quiz](images/pulse-quiz-phone.png)
- [Theme picker](images/pulse-theme-picker.png)
- [Four viewport checks](pulse-browser.json): paired picker rows, persistence,
  light theme on a dark device, text contrast and Home/Quiz/Pause controls.
- [Feedback contrast](pulse-contrast.json): all sixteen palettes.

100 unit tests passed. Viewports were simulated; physical devices were not
attached. Existing theme preferences are preserved.

Published on main: https://piano-quiz.pages.dev/

Production deployment: `3481aa9e-e355-4fe4-8dae-61e8d766bea7`.
Immutable URL: https://3481aa9e.piano-quiz.pages.dev/

[Production check](pulse-production.json) verifies all 43 served files and
Pulse selection, saved preference and quiz pause/resume by touch.

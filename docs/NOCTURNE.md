# Nocturne style study

Visual thesis: an evening practice room, with warm brass controls and real
notation printed on an ivory score in a blue-black surround.

The score is the recurring visual anchor. Home links the written note to a
small set of keys, the exercise uses an ivory sheet, and the session charts
retain the same restrained brass and paper vocabulary. There are no new
decorative cards around the practice controls.

Palette: piano ink `#11151f`, stand `#1b2230`, brass `#e9c58b`,
cream text `#f5ecdd`, and score paper `#eee2c8`. Display type uses a
Baskerville/Palatino serif stack; controls keep the existing system sans.
Movement is limited to the pressed key feel and the existing practice feedback.

The design is isolated from stable-before-design. The preview can use
`?theme=nocturne`, or select Nocturne in App settings. Existing themes and
all practice behavior remain available. Source references:
[Frontend Design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md),
[Frontend Skill](https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4#bringing-it-all-together-with-the-frontend-skill).

## Preview checks

100 unit tests, 20 Chromium browser scenarios, and the feedback contrast check
passed. A Nocturne smoke check covered Home, Quiz, and Pause/Resume at
430 × 932, 1280 × 800, 320 × 568, and 932 × 430. The phone sizes are simulated.

- [Phone Home](images/nocturne-home-phone.png)
- [Phone quiz](images/nocturne-quiz-phone.png)
- [Tablet Home](images/nocturne-home-tablet.png)
- [Tablet quiz](images/nocturne-quiz-tablet.png)
- [Browser report](nocturne-browser.json)
- [Contrast report](nocturne-contrast.json)

Preview: https://74d393dc.piano-quiz.pages.dev/?theme=nocturne

Deployment: 74d393dc-6a64-4338-86a9-76331d98bc34 (Preview).

[Live preview checks](nocturne-live.json) confirm all 43 served files and
that production is still release 832bfaeaa7834d.

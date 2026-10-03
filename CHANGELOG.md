# Changelog

## 1.1.0 (2 October 2026)

A big polish release.

- New look: a bundled Inter typeface, softer surfaces, and motion everywhere. Cards slide open, tabs and segmented controls glide, numbers count up, dialogs and the settings drawer animate in and out.
- A speed slider in Run, from Gentle to Max, with the wait time, responses per minute and total duration updating as you drag.
- AI crowd: describe the kind of people you want and Claude writes complete respondents, each with their own mood and bias, who answer the whole form. Uses your own Anthropic API key.
- Text answers from a spreadsheet or the AI crowd now also pass the form's validation rules.
- One notification at a time, at the bottom, instead of a growing stack.
- More space between the crowd card and the question search.
- Legal pages built into the extension: Terms of Use, Privacy Policy, Acceptable Use Policy and open-source licenses.
- Plain punctuation throughout, checked automatically by `npm run check`.
- A Source link in Settings that opens this repository.

## 1.0.0 (2 October 2026)

First release.

- Parses every Google Forms question type (short answer, paragraph, multiple choice, checkboxes, dropdown, linear scale, rating, choice and checkbox grids, date, time, duration), "Other" options, section branching, response validation and e-mail collection.
- Answer strategies: Persona, Random, Tendency, Weighted, Fixed and Cycle; per-option checkbox probabilities with min/max; per-row grid strategies.
- Crowd model with bell, polarized and uniform shapes, mood, diversity and consistency; presets.
- Smart text generators with consistent respondent identities, templates, lists, numbers and lorem ipsum; validation-aware output, including regex.
- Optional Claude-written answer pools (bring your own key).
- Dry-run preview with observed distributions, CSV/JSON export, pre-filled links and on-page autofill.
- Background runs with delay or spread pacing, parallel workers, retries with backoff, pause/resume/stop, scheduling, notifications and history.
- CSV dataset replay with automatic column mapping.
- Strategy import/export; per-form persistence.
- Light and dark themes; side panel and full-tab layouts.

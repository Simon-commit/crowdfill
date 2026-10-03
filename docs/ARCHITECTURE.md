# Architecture

Crowdfill is a Manifest V3 extension with four parts:

```
 ┌──────────────── side panel / full tab (Preact) ────────────────┐
 │ Design, Preview, Run, Data, Settings                        │
 │ runs the generator locally for previews                         │
 └───────────────┬───────────────────────────────▲─────────────────┘
       runtime messages                     chrome.storage
                 │                        (session: live run,
 ┌───────────────▼────────────────────┐    local: forms, configs,
 │ service worker (background.js)     │    history, settings)
 │  router, form loader, Runner        │─────────┘
 │  scheduler (alarms), Claude client  │──► docs.google.com/forms  (GET viewform, POST formResponse)
 └───────────────┬────────────────────┘──► api.anthropic.com      (optional)
                 │ tabs.sendMessage
 ┌───────────────▼────────────────────┐
 │ content script (Google Form pages) │  "Fill this page"
 └────────────────────────────────────┘
```

All domain logic lives in `src/core` as pure functions with no browser APIs, so it is unit-tested directly and shared by the UI (previews) and the service worker (runs). A preview and a run with the same seed produce identical responses.

## Reading a form

A form's public page (`/forms/d/e/<id>/viewform`) embeds its full definition as `var FB_PUBLIC_LOAD_DATA_ = [...]`. The relevant positions:

| Path | Meaning |
|---|---|
| `data[1][0]` | description |
| `data[1][1]` | items |
| `data[1][8]` | title |
| `data[1][10][6]` | e-mail collection: 1 none, 2 verified, 3 responder input |
| `data[14]` | `"e/<public id>"` |

Each item is `[itemId, title, description, typeId, entries, navAfterPreviousSection, ...]`.

| typeId | Kind | Notes |
|---|---|---|
| 0 / 1 | short answer / paragraph | validation at `entry[4]` |
| 2 / 3 / 4 | multiple choice / dropdown / checkboxes | options at `entry[1]`, each `[label, _, goToSection, _, isOther]` |
| 5 | linear scale | end labels at `entry[3]` |
| 7 | grid | one entry per row, row label at `entry[3][0]`; `entry[11][0] === 1` ⇒ checkbox grid |
| 8 | section break | `item[5]` is where to go **after the previous section** |
| 9 | date | `entry[7] = [includeTime, includeYear]` |
| 10 | time | `entry[6] = [isDuration]` |
| 13 | file upload | unsupported |
| 18 | rating | |
| 6 / 11 / 12 | text block / image / video | ignored |

Navigation targets are a section item id, `-2` (continue to the next section) or `-3` (submit). Validation rules are `[type, operator, args, message]`. Types: 1 number, 2 text, 4 regex, 6 length, 7 checkbox count. Operators: number 1 to 10 (greater than, at least, less than, at most, equal, not equal, between, not between, is a number, whole number); text 100 to 103 (contains, doesn't contain, e-mail, URL); regex 299 to 302 (contains, doesn't contain, matches, doesn't match); length 202/203 (max/min); count 200/201/204 (at least/at most/exactly).

`parser.ts` normalizes all of this into a `FormModel` and is written defensively: unknown types with options degrade to multiple choice, anything else to "unsupported".

## Submitting

The payload mirrors what Google's own page posts (verified by serializing the live form's `FormData`):

```
entry.<id>=value                         text, choice, scale
entry.<id>=a&entry.<id>=b                checkboxes / checkbox-grid rows
entry.<id>=__other_option__
entry.<id>.other_option_response=text    "Other"
entry.<id>_year / _month / _day          date (month/day unpadded)
entry.<id>_hour / _minute [/ _second]    time (zero-padded)
entry.<id>_sentinel=                     radio/checkbox sentinels
emailAddress=...                           when the form collects e-mails
fvv=1&partialResponse=[null,null,"<fbzx>"]&pageHistory=0,2&fbzx=<fbzx>&submissionTimestamp=-1
```

Only answers from visited sections are sent, and `pageHistory` lists exactly the sections on the respondent's path.

Google returns 200 both for success and for refused answers (it re-renders the form), so `outcome.ts` also inspects the body: a re-rendered `<form ... /formResponse>` with `pageHistory` means rejected, a sign-in page means login required (fatal), `closedform` means closed (fatal), and 429/5xx/network errors are retryable.

## The run engine

`background/runner.ts` runs inside the service worker so it survives the panel closing:

- `concurrency` workers pull indices from a shared counter.
- Pacing is a random delay per worker, or precomputed arrival times (sorted uniform samples across the window, i.e. a Poisson-like process).
- Long sleeps are sliced and touch an extension API every 20 s so Chrome doesn't suspend the worker mid-run.
- Retries use exponential backoff with jitter, doubled for HTTP 429.
- State is mirrored to `chrome.storage.session` (throttled to 4 Hz). The UI observes it with `storage.onChanged`, so any number of panels or tabs stay in sync.
- Scheduled runs use `chrome.alarms` and keep their run id when they fire.

## The crowd model

Each submission index `i` gets its own PRNG stream (`sfc32`, seeded from `cyrb128("<seed>:<i>")`), so runs are reproducible and order-independent across parallel workers.

1. **Sentiment** `z` between 0 and 1 is drawn from the crowd shape:
   - bell: `normal(mean, 0.03 + 0.32 * spread)`, folded back into 0 to 1 at the edges
   - polarized: with probability `mean` from `normal(0.92, sd)`, otherwise from `normal(0.08, sd)`
   - uniform: `uniform(0, 1)`
2. **Persona questions** (ordered, `n` options) use a discretized Gaussian centred on `z * (n - 1)` (or `(1 - z) * (n - 1)` when reverse-scored) with `sd = 0.25 + 0.6 * n * (1 - consistency)^1.5`. High consistency gives decisive respondents; zero consistency is close to uniform.
3. **Tendency** on ordered options uses a Gaussian centred on the target with `sd = 0.25 + 0.9 * n * (1 - strength)^1.6`. On unordered options the target gets `1/n + s * (1 - 1/n)` and the rest share what is left.
4. **Free text**: comments and suggestions pick tone buckets from `z` with a little noise, so an unhappy respondent's comment is negative.

Ordered options are detected by `likert.ts`: consecutive small integers (<= 11 options, |n| <= 10), or labels whose valence (from a multilingual lexicon) correlates with position (|r| >= 0.7). Hours, years and age brackets are deliberately not treated as scales.

Text answers are post-processed by `validation.ts` so they pass the form's own rules. Regex rules use `regexgen.ts`, a small generator for the regex subset found in real forms (classes, groups, alternation, quantifiers, back-references), and verify its output against the real `RegExp`.

## On-page autofill

Google's widgets are custom elements, so the content script drives them the way a user would:

- text: native value setter, then `input` and `change` events
- radios and checkboxes: a pointer/mouse event sequence on `[role=radio|checkbox]`
- dropdowns: open the listbox, wait for the popup option to get a size, press it, wait for the hidden input to update

Questions are matched by item id from each container's `data-params` attribute. Only the visible page is filled, and nothing is submitted.

# Contributing to Crowdfill

Thanks for helping! Bug reports, form layouts that don't parse, new generators and UI polish are all welcome.

## Setup

```bash
npm install
npm run dev        # rebuilds dist/ on change; load it via chrome://extensions, then Load unpacked
```

After changing the service worker or content script, click the reload icon on the extension card.

## Before opening a pull request

```bash
npm run check      # typecheck + unit tests + build
npm run e2e        # end-to-end suite in Chrome for Testing (offline)
```

- Keep domain logic in `src/core` and free of browser APIs, and add unit tests for it.
- A form that doesn't parse correctly is the most useful bug report. Include the form's `FB_PUBLIC_LOAD_DATA_` with personal content removed, or a link to a public test form you own.
- Match the existing style: small focused modules, comments that explain *why*, no unused code.
- UI changes: include a screenshot, and check light and dark themes at side-panel width (~360 px).

## Scope

Crowdfill is for testing forms you own and generating synthetic data. These won't be merged:

- proxy or IP rotation, user-agent or fingerprint spoofing, CAPTCHA solving
- anything that bypasses sign-in requirements or "limit to 1 response"
- features aimed at manipulating polls, votes or surveys run by others

## Releasing

1. Bump `version` in `package.json` and update `CHANGELOG.md`.
2. `npm run package` produces `release/crowdfill-<version>.zip`.
3. Tag the commit `v<version>`. The CI workflow attaches the zip to the GitHub release.

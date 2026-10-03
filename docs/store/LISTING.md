# Chrome Web Store listing

Everything the developer dashboard asks for, ready to paste. Images are in this folder and can be regenerated with `npm run screenshots && npm run store-assets`.

## Store listing tab

**Name** (from the manifest, 75 characters max)

> Crowdfill: Google Forms Auto Filler & Response Generator

**Summary** (132 characters max)

> Auto fill and submit Google Forms with realistic responses that lean the way you choose. Test forms and create demo data fast.

**Category:** Productivity, Tools

**Language:** English

**Description**

```
Crowdfill fills your Google Forms with realistic responses, and lets you decide which way they lean.

Testing a form by hand is slow, and random autofillers produce answers no real person would give. Crowdfill generates people instead: each one has a mood, and everything they answer fits together. A happy customer rates high, recommends you and writes something kind. An unhappy one does the opposite, all the way through.

SHOW A TENDENCY
Pick any question and make it lean towards an answer. Set the strength from plain random to almost always, and on rating scales the weight spreads naturally to the neighbouring answers. Or set the exact percentage for every option and watch the numbers update as you drag.

GIVE THE CROWD A MOOD
Choose a happy, unhappy, neutral or polarized crowd in one click, or shape it yourself with sliders for average mood, how different people are, and how consistent each person is.

AI CROWD (OPTIONAL)
Describe the people you want, like price-sensitive students, loyal regulars or customers upset about a recent change, and Claude writes complete respondents who answer the whole form in character. Uses your own Anthropic API key.

WORKS WITH EVERY QUESTION TYPE
Short answer, paragraph, multiple choice, checkboxes, dropdowns, linear scales, ratings, multiple choice grids, checkbox grids, dates and times. "Other" options, section branching and collected e-mail addresses are handled too.

PASSES YOUR RULES
Number ranges, text length, e-mail and URL checks, regular expressions and checkbox limits are read from your form, and every answer passes them.

PREVIEW BEFORE YOU SEND
Generate hundreds of sample responses on the spot, check how the answers spread, export them to CSV or JSON, or fill the open form on screen to look at one up close.

SUBMIT MULTIPLE TIMES, AT YOUR PACE
Choose how many responses to send and set the speed with a slider. The wait, responses per minute and total time update as you drag. Or spread responses over an hour like real traffic, or schedule a run for later. Runs continue in the background with automatic retries, pause and stop.

REPLAY A SPREADSHEET
Drop in a CSV, such as a Google Forms response export, and Crowdfill sends its rows. Columns are matched to questions automatically.

PRIVATE BY DESIGN
No account, no tracking, no servers. Your forms and settings stay in your browser.

Crowdfill is made for testing your own forms, creating demo data, and showing how results look when respondents lean one way or another. Please only use it on forms you own or have permission to test.

Free and open source. Made by dyrt.io. Not affiliated with Google.
```

**Images**

| Slot | File |
|---|---|
| Store icon (128x128) | `static/icons/icon-128.png` |
| Screenshots (1280x800) | `screenshot-1-tendency.png` to `screenshot-5-preview.png` |
| Small promo tile (440x280) | `promo-small-440x280.png` |
| Marquee promo tile (1400x560) | `promo-marquee-1400x560.png` |

**Links**

- Official URL / homepage: https://dyrt.io/crowdfill/
- Support: https://dyrt.io/crowdfill/ (contact: support@dyrt.io)
- YouTube video: https://www.youtube.com/watch?v=VyyYjKN6g_M

## Privacy tab

**Single purpose**

> Crowdfill generates realistic responses for a Google Form the user chooses, lets the user preview them, and submits them to that form when the user starts a run.

**Permission justifications**

| Permission | Justification |
|---|---|
| storage | Saves the user's form setups, preferences and run history locally on their device. |
| sidePanel | Shows Crowdfill next to the Google Form the user is working on. |
| alarms | Starts runs the user has scheduled for a later time. |
| notifications | Tells the user when a run has finished. Can be switched off in Settings. |
| scripting | Injects the "Fill this page" helper into Google Form tabs that were already open before installation. |
| Host: docs.google.com/forms/*, forms.gle/* | Reads the structure of the form the user loads and submits the responses the user configures. |

**Remote code:** No, I am not using remote code. All JavaScript is bundled in the package.

**Data usage:** Leave every data type unchecked. Crowdfill does not collect or transmit user data to the developer.

Certify all three statements:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://dyrt.io/crowdfill/privacy/

## Distribution tab

- Visibility: Public
- Regions: All regions
- Pricing: Free

## Notes for the reviewer

```
To test Crowdfill, create any Google Form in your own account, open it, and click the Crowdfill toolbar icon. The side panel loads the form. The Preview tab shows generated responses without sending anything. The Run tab sends responses to the form only after the user presses Send.

The optional AI crowd feature needs the user's own Anthropic API key and is not required to test the extension.
```

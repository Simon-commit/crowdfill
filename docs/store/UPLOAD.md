# Uploading Crowdfill to the Chrome Web Store

A walk through the developer dashboard, tab by tab, with every field ready to paste. Set aside about 20 minutes.

## What you need

| What | File |
|---|---|
| Package | `release/crowdfill-<version>.zip`, made by `npm run package` |
| Store icon, 128x128 | `static/icons/icon-128.png` |
| Screenshots, 1280x800 | `docs/store/screenshot-1-tendency.png` to `screenshot-5-preview.png` |
| Small promo tile, 440x280 | `docs/store/promo-small-440x280.png` |
| Marquee promo tile, 1400x560 | `docs/store/promo-marquee-1400x560.png` |

The screenshots and tiles are 24-bit PNGs without transparency, which is the format the store asks for. `npm run screenshots && npm run store-assets` makes them again.

The publisher account is the one that already publishes RoLens. That means the registration fee, the verified contact e-mail (support@dyrt.io), the publisher name (dyrt.io) and the non-trader declaration are all in place, and the Crowdfill listing will show the same publisher details as the RoLens one.

A new publisher can have two published extensions. Crowdfill is the second, so a third one will need the limit increase that the dashboard offers.

## 1. Upload the package

1. Open the [developer dashboard](https://chrome.google.com/webstore/devconsole) and sign in with the publisher account.
2. Click **Add new item**.
3. Click **Choose file**, pick the zip, then **Upload**.

Upload the zip as it is. If you unzip it and zip the folder again, the manifest ends up one level down and the upload is refused.

The dashboard reads these from the manifest, so there is nothing to type:

- **Name:** Crowdfill: Google Forms Auto Filler & Response Generator
- **Summary:** Auto fill and submit Google Forms with realistic responses that lean the way you choose. Test forms and create demo data fast.
- **Version:** the one in `package.json`

After the upload, the item opens with a menu on the left: Package, Store listing, Privacy, Distribution and Test instructions. Work through them in that order and press **Save draft** on each.

## 2. Store listing

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

Source code: https://github.com/Simon-commit/crowdfill
Privacy policy: https://dyrt.io/crowdfill/privacy/
Support: support@dyrt.io
```

**Category:** Tools (in the Productivity group)

**Language:** English

**Graphic assets**

| Field | What to add |
|---|---|
| Store icon | `static/icons/icon-128.png` |
| Global promo video | https://www.youtube.com/watch?v=VyyYjKN6g_M |
| Screenshots | The five `screenshot-*.png` files, in number order. The first one is the image people see in search results. |
| Small promo tile | `promo-small-440x280.png` |
| Marquee promo tile | `promo-marquee-1400x560.png` |

**Additional fields**

| Field | Value |
|---|---|
| Official URL | Pick `dyrt.io` from the list. It is already verified for the RoLens listing. |
| Homepage URL | https://dyrt.io/crowdfill/ |
| Support URL | https://github.com/Simon-commit/crowdfill/issues |
| Mature content | Off |

## 3. Privacy

**Single purpose**

```
Crowdfill generates realistic responses for a Google Form the user chooses, lets the user preview them, and submits them to that form when the user starts a run.
```

**Permission justification**

The dashboard shows one box per permission from the manifest.

| Permission | Paste this |
|---|---|
| storage | Saves the user's form setups, preferences and run history locally on their device. |
| sidePanel | Shows Crowdfill next to the Google Form the user is working on. |
| alarms | Starts runs the user has scheduled for a later time. |
| notifications | Tells the user when a run has finished. Can be switched off in Settings. |
| scripting | Adds the "Fill this page" helper to Google Form tabs that were already open before the extension was installed. |
| Host permission | Crowdfill only works with Google Forms. Access to docs.google.com/forms and forms.gle is needed to read the structure of the form the user loads and to submit the responses the user configures to that same form. |

**Remote code:** choose "No, I am not using remote code". Every script is bundled in the package.

**Data usage**

Google asks for every kind of user data the extension handles, and that includes data that never leaves the device. Tick these three:

| Data type | Why it applies |
|---|---|
| Personally identifiable information | A spreadsheet the user imports can contain names and e-mail addresses. It is saved on the device and sent only to the user's own form. |
| Authentication information | The optional Claude API key. It is saved on the device and sent only to Anthropic. |
| Website content | The questions and options of the Google Form the user loads. |

Leave the others unticked: health, financial and payment, personal communications, location, web history and user activity.

Then tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** https://dyrt.io/crowdfill/privacy/

The policy says what is stored, what is sent to Google Forms and to Anthropic, and that Crowdfill follows the Limited Use requirements. Reviewers compare it with the boxes above, so keep the two in step when either changes.

## 4. Distribution

| Field | Value |
|---|---|
| Payments | Free of charge |
| Visibility | Public |
| Distribution | All regions |

## 5. Test instructions

No login is needed, so leave the username and password empty and paste this into the instructions:

```
No account is needed to test Crowdfill.

1. Create a Google Form in your own Google account (forms.new), add a few questions and publish it. The form must accept responses without sign-in.
2. Open the form's responder link and click the Crowdfill toolbar icon. The side panel opens and reads the form.
3. Design tab: choose a crowd and how each question should lean.
4. Preview tab: shows the generated responses. Nothing is sent from here.
5. Run tab: choose how many responses and press Send. Responses go only to the form that is loaded, and only after Send is pressed. They then appear under Responses in the form.

The AI crowd feature is optional and needs the user's own Anthropic API key. Everything else works without it.

The full source code is public at https://github.com/Simon-commit/crowdfill
```

## 6. Submit

1. Check that every tab is saved. If the submit button is greyed out, the **Why can't I submit?** link beside it lists what is missing.
2. Click **Submit for review**.
3. The dialog has a box for publishing automatically once the review passes. Leave it ticked to go live straight away. Untick it to choose the moment yourself; an approved item waits for up to 30 days.

## 7. While it is in review

- Most reviews finish within a few days. New extensions get a closer look, so allow up to a couple of weeks. After three weeks, contact developer support from the dashboard.
- Mail about the review goes to the publisher account's address. Published and staged notices can be switched on under **Account**.
- If it is rejected, the e-mail names the policy. Fix that one thing, raise the version in `package.json`, run `npm run package`, upload the new zip under **Package** and submit again.

Things reviewers look at for an extension like this, and how Crowdfill stands:

- One clear purpose, stated the same way in the listing, the single purpose field and the app.
- The narrowest permissions. The host access covers Google Forms only.
- Nothing is sent without the user. A run starts only when Send is pressed, and the Preview tab shows what will be sent.
- No keyword stuffing in the description, and no words that promote misuse.
- The data boxes, the privacy policy and what the code does all agree.

## 8. After approval

1. Copy the listing URL from the dashboard.
2. On dyrt.io/crowdfill, swap "Coming soon" for an "Add to Chrome" button, and do the same on the home page card.
3. Add the store link to the README and to the YouTube description.
4. Ask Google to index dyrt.io/crowdfill in Search Console.

## Updating later

1. Raise `version` in `package.json` and add the changes to `CHANGELOG.md`.
2. Run `npm run check`, then `npm run package`.
3. In the dashboard, open the item, go to **Package**, click **Upload new package** and submit for review again.

The store only accepts a package whose version is higher than the one already published.

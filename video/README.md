# Showcase video

`npm run video -- --voice=will` renders `release/crowdfill-showcase.mp4`: 1080p at 60 fps, captured at 4K and downscaled for crisp text, with narration, music and interface sounds.

How it works:

- **Real extension, virtual time.** `stage/` is a page that shows a browser window with the real Crowdfill extension in its side panel. `clock.js` replaces timers, animation frames and CSS animation timing, so every captured frame is exactly 1/60 s later than the last, however long the capture takes.
- **A director, not a screen recorder.** `record.mjs` moves the cursor, clicks, drags sliders and pans the camera scene by scene. Clicks and slider drags are delivered as DOM events to the exact element under the cursor.
- **Nothing reaches real services.** Requests to Google Forms and the Claude API are answered by the director on the video's own timeline. The AI crowd in the video is hand-written (`crowd.mjs`).
- **Narration** comes from ElevenLabs (`voice.mjs`). Put `ELEVENLABS_API_KEY=...` in `.env.local`. Every take is cached in `.cache/video/voice`, so re-renders cost nothing. `node video/voice.mjs samples` makes short samples in a few voices.
- **Music and sounds** are synthesized from scratch in `music.mjs`, so there is nothing to license.
- `script.json` holds the narration, one line per scene. Edit it, re-run, and the timeline adapts to the new line lengths.

`npm run video -- --draft` makes a quick 30 fps preview without narration.

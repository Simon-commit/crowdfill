// Narration with ElevenLabs. Every take is cached by voice, model and text, so
// re-rendering the video never spends credits twice.
//   node video/voice.mjs samples        short takes of the opening in several voices
//   node video/voice.mjs <voiceId>      the full script in one voice
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, '.cache', 'video', 'voice');
mkdirSync(cache, { recursive: true });

function apiKey() {
  const env = existsSync(join(root, '.env.local')) ? readFileSync(join(root, '.env.local'), 'utf8') : '';
  const key = process.env.ELEVENLABS_API_KEY || /ELEVENLABS_API_KEY=(\S+)/.exec(env)?.[1];
  if (!key) throw new Error('Put ELEVENLABS_API_KEY in .env.local');
  return key;
}

export const MODEL = 'eleven_v3';

// Built-in ElevenLabs voices (IDs are the same on every account).
export const VOICES = {
  will: { id: 'bIHbv24MWmeRgasZH58o', label: 'Will, American, relaxed and friendly' },
  brian: { id: 'nPczCjzI2devNBz1zQrb', label: 'Brian, American, deep and calm' },
  george: { id: 'JBFqnCBsd6RMkjVDRZzb', label: 'George, British, warm' },
  jessica: { id: 'cgSgspJ2msm6clMCkdW9', label: 'Jessica, American, bright and conversational' },
};

/** Returns the path of an MP3 for this line, generating it only if it isn't cached. */
export async function speak(text, voiceId, context = {}) {
  // Eleven v3 doesn't take continuity hints; each line is a full sentence anyway.
  const { previous, next } = MODEL === 'eleven_v3' ? {} : context;
  const hash = createHash('sha1').update(JSON.stringify([MODEL, voiceId, text, previous ?? '', next ?? ''])).digest('hex').slice(0, 16);
  const file = join(cache, `${hash}.mp3`);
  if (existsSync(file)) return file;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: MODEL,
      voice_settings: { stability: 0.5, similarity_boost: 0.8 },
      ...(previous ? { previous_text: previous } : {}),
      ...(next ? { next_text: next } : {}),
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

const script = JSON.parse(readFileSync(join(root, 'video', 'script.json'), 'utf8'));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  if (arg === 'samples') {
    const text = `${script[0].text} ${script[1].text}`;
    for (const [name, v] of Object.entries(VOICES)) {
      const file = await speak(text, v.id);
      const out = join(root, '.cache', 'video', `sample-${name}.mp3`);
      writeFileSync(out, readFileSync(file));
      console.log(`${out}  (${v.label})`);
    }
  } else if (arg) {
    const id = VOICES[arg]?.id ?? arg;
    for (let i = 0; i < script.length; i++) {
      const file = await speak(script[i].text, id, { previous: script[i - 1]?.text, next: script[i + 1]?.text });
      console.log(`${script[i].id}: ${file}`);
    }
  } else {
    console.log('Usage: node video/voice.mjs samples | <voice name or id>');
  }
}

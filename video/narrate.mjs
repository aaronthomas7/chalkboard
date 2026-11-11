// Generates the narration with Kokoro, an open-source neural voice that runs locally.
// Writes one WAV per line to out/narration/, which assemble.mjs uses.
//
//   npm run narrate            (VOICE=am_michael SPEED=0.92 by default)
import { mkdirSync } from 'node:fs';
import { KokoroTTS } from 'kokoro-js';
import { BEATS } from './beats.mjs';

const VOICE = process.env.VOICE ?? 'am_michael';
const SPEED = Number(process.env.SPEED ?? 0.92); // a little slower than normal reads calmer
const DIR = new URL('./out/narration/', import.meta.url).pathname;

mkdirSync(DIR, { recursive: true });
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });

for (const beat of BEATS) {
  // Kokoro reads the plain caption well, but letter-by-letter names still need spelling out.
  const text = (beat.speech ?? beat.caption).replace(/\bG F\b/g, 'G.F.').replace(/\bM C P\b/g, 'M.C.P.').replace(/\bA G Grid\b/g, 'A.G. Grid');
  const audio = await tts.generate(text, { voice: VOICE, speed: SPEED });
  audio.save(`${DIR}${beat.id}.wav`);
  console.log(`  ${beat.id}`);
}
console.log(`Narration written to out/narration/ (${VOICE}, speed ${SPEED})`);

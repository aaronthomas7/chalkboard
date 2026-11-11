// Turns out/timeline.json from record.mjs into out/chalkboard-demo.mp4 (+ .srt captions).
//
//   npm run assemble
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import ffmpeg from 'ffmpeg-static';

const OUT = new URL('./out/', import.meta.url).pathname;
const timeline = JSON.parse(readFileSync(`${OUT}timeline.json`, 'utf8'));
const { videoPath, end, beats, narration, captions } = timeline;
const NARRATION_DELAY = 0.3; // seconds of breathing room at the start of each step

// Parts of the raw recording to keep: from the first step to the end, minus the cut waits.
const start = beats[0].start + 0.6;
const keep = [];
let position = start;
for (const { from, to } of [...timeline.cuts].sort((a, b) => a.from - b.from)) {
  if (to <= position) continue;
  if (from > position) keep.push([position, from]);
  position = to;
}
keep.push([position, end]);

// Where a moment of the raw recording lands in the final video.
function finalTime(raw) {
  let time = 0;
  for (const [from, to] of keep) {
    if (raw >= to) time += to - from;
    else {
      if (raw > from) time += raw - from;
      break;
    }
  }
  return time;
}

const total = keep.reduce((sum, [from, to]) => sum + (to - from), 0);
const steps = beats.map((beat) => ({
  ...beat,
  at: finalTime(beat.start) + NARRATION_DELAY,
  audio: narration[beat.id],
  caption: captions.find((c) => c.id === beat.id).caption,
}));

const select = keep.map(([from, to]) => `between(t,${from.toFixed(3)},${to.toFixed(3)})`).join('+');
const filters = [
  `[0:v]fps=30,select='${select}',setpts=N/30/TB,format=yuv420p[v]`,
  ...steps.map((step, i) => `[${i + 1}:a]aresample=48000,adelay=${Math.round(step.at * 1000)}:all=1[a${i}]`),
  `${steps.map((_, i) => `[a${i}]`).join('')}amix=inputs=${steps.length}:normalize=0:dropout_transition=0,apad[a]`,
];

const output = `${OUT}chalkboard-demo.mp4`;
execFileSync(
  ffmpeg,
  [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', videoPath,
    ...steps.flatMap((step) => ['-i', step.audio.file]),
    '-filter_complex', filters.join(';'),
    '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
    '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart',
    '-t', total.toFixed(3),
    output,
  ],
  { stdio: 'inherit' },
);

// Captions: one cue per sentence, timed in proportion to its length within the step's narration.
const stamp = (seconds) => {
  const ms = Math.round(seconds * 1000);
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};
const cues = [];
for (const step of steps) {
  const sentences = step.caption.match(/[^.!?]+[.!?]+/g) ?? [step.caption];
  const chars = sentences.reduce((sum, s) => sum + s.length, 0);
  let time = step.at;
  for (const sentence of sentences) {
    const duration = (step.audio.duration * sentence.length) / chars;
    cues.push(`${cues.length + 1}\n${stamp(time)} --> ${stamp(time + duration)}\n${sentence.trim()}\n`);
    time += duration;
  }
}
writeFileSync(`${OUT}chalkboard-demo.srt`, cues.join('\n'));

const minutes = `${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, '0')}`;
console.log(`Wrote ${output} (${minutes}) and chalkboard-demo.srt`);
for (const step of steps) console.log(`  ${stamp(step.at).slice(3, 8)}  ${step.id}`);
if (total > 180) console.log('WARNING: longer than 3:00; judges may stop watching at 3:00.');

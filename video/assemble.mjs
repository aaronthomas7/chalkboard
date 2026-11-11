// Turns out/timeline.json from record.mjs into out/chalkboard-demo.mp4 (+ .srt captions).
//
//   npm run assemble
//
// Narration comes from a recording of your own voice when out/voice.* exists (or VOICE_FILE is set):
// one take of the lines in beats.mjs, in order, with a pause of about 2 seconds between lines.
// It's split on those pauses and each line is laid over its step; a step is held on its last frame
// if the line runs longer. If you redid a line, list the takes to drop, e.g. SKIP_TAKES=4.
// Without a recording it uses the Kokoro narration from narrate.mjs (out/narration/), and failing
// that, the text-to-speech clips from record.mjs.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import ffmpeg from 'ffmpeg-static';
import { BEATS } from './beats.mjs';

const OUT = new URL('./out/', import.meta.url).pathname;
const LEAD = 0.3; // silence before each line
const TAIL = 0.5; // minimum silence after a line before the next step starts

const timeline = JSON.parse(readFileSync(`${OUT}timeline.json`, 'utf8'));
const cuts = [...timeline.cuts].sort((a, b) => a.from - b.from);

function ffmpegLog(args) {
  return spawnSync(ffmpeg, ['-hide_banner', ...args], { encoding: 'utf8' }).stderr;
}

function duration(file) {
  const [, h, m, s] = /Duration: (\d+):(\d+):([\d.]+)/.exec(ffmpegLog(['-i', file]));
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

// Parts of the raw recording kept for a step: its time range minus the cut waits.
function kept(from, to) {
  const parts = [];
  let position = from;
  for (const cut of cuts) {
    if (cut.to <= position || cut.from >= to) continue;
    if (cut.from > position) parts.push([position, cut.from]);
    position = Math.max(position, cut.to);
  }
  if (position < to) parts.push([position, to]);
  return parts;
}

// Splits one take into lines at its longest pauses.
function linesFromRecording(file) {
  const skip = (process.env.SKIP_TAKES ?? '').split(',').filter(Boolean).map(Number);
  const takes = BEATS.length + skip.length;
  const total = duration(file);

  const silences = [];
  for (const line of ffmpegLog(['-i', file, '-af', 'silencedetect=noise=-40dB:d=0.6', '-f', 'null', '-']).split('\n')) {
    const start = /silence_start: ([\d.]+)/.exec(line);
    const end = /silence_end: ([\d.]+)/.exec(line);
    if (start) silences.push({ from: Number(start[1]), to: total });
    if (end && silences.length) silences.at(-1).to = Number(end[1]);
  }
  // Pauses between speech, longest first; the takes - 1 longest are the breaks between lines.
  const gaps = silences.filter((s) => s.from > 0.05 && s.to < total - 0.05);
  if (gaps.length < takes - 1) {
    throw new Error(`Found ${gaps.length + 1} lines in ${file}, expected ${takes}. Leave a 2-second pause between lines.`);
  }
  const breaks = [...gaps].sort((a, b) => b.to - b.from - (a.to - a.from)).slice(0, takes - 1);
  breaks.sort((a, b) => a.from - b.from);

  const leading = silences.find((s) => s.from <= 0.05)?.to ?? 0;
  const trailing = silences.find((s) => s.to >= total - 0.05)?.from ?? total;
  const edges = [leading, ...breaks.flatMap((b) => [b.from, b.to]), trailing];
  const lines = [];
  for (let i = 0; i < edges.length; i += 2) {
    const start = Math.max(0, edges[i] - 0.12);
    const end = Math.min(total, edges[i + 1] + 0.2);
    lines.push({ file, start, duration: end - start });
  }
  const used = lines.filter((_, i) => !skip.includes(i + 1));
  if (used.length !== BEATS.length) throw new Error(`Expected ${BEATS.length} lines after skipping, got ${used.length}.`);
  return used;
}

const voice =
  process.env.VOICE_FILE ??
  ['m4a', 'wav', 'mp3', 'aiff', 'aif', 'mov', 'webm'].map((ext) => `${OUT}voice.${ext}`).find((f) => existsSync(f));
const narrated = (id) => `${OUT}narration/${id}.wav`;
const generated = BEATS.every((beat) => existsSync(narrated(beat.id)));
const lines = voice
  ? linesFromRecording(voice)
  : generated
    ? BEATS.map((beat) => ({ file: narrated(beat.id), start: 0, duration: duration(narrated(beat.id)) }))
    : timeline.beats.map((beat) => ({ file: timeline.narration[beat.id].file, start: 0, duration: timeline.narration[beat.id].duration }));
const narrator = voice ? voice.split('/').pop() : generated ? 'Kokoro (out/narration)' : 'macOS text-to-speech';

// Each step lasts as long as its footage, or its line plus a little air, whichever is longer.
let at = 0;
const steps = timeline.beats.map((beat, i) => {
  const from = i === 0 ? beat.start + 0.6 : beat.start;
  const to = timeline.beats[i + 1]?.start ?? timeline.end;
  const parts = kept(from, to);
  const footage = parts.reduce((sum, [a, b]) => sum + (b - a), 0);
  const line = lines[i];
  const length = Math.max(footage, LEAD + line.duration + TAIL);
  const step = { id: beat.id, parts, hold: length - footage, start: at, line };
  at += length;
  return step;
});
const total = at;

// Video: trim each kept part, join them per step, hold the last frame where needed, join the steps.
const parts = steps.flatMap((step, i) => step.parts.map((range) => ({ step: i, range })));
const filters = [
  `[0:v]fps=30,split=${parts.length}${parts.map((_, j) => `[p${j}]`).join('')}`,
  ...parts.map(({ range: [a, b] }, j) => `[p${j}]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=PTS-STARTPTS[t${j}]`),
  ...steps.map((step, i) => {
    const inputs = parts.map((part, j) => (part.step === i ? `[t${j}]` : '')).join('');
    const hold = step.hold > 0.02 ? `,tpad=stop_mode=clone:stop_duration=${step.hold.toFixed(3)}` : '';
    return `${inputs}concat=n=${step.parts.length}:v=1:a=0${hold}[s${i}]`;
  }),
  `${steps.map((_, i) => `[s${i}]`).join('')}concat=n=${steps.length}:v=1:a=0,format=yuv420p[v]`,
];

// Audio: cut each line from its file and place it at the start of its step.
const audioFiles = [...new Set(lines.map((line) => line.file))];
audioFiles.forEach((file, k) => {
  const uses = steps.filter((step) => step.line.file === file).length;
  filters.push(`[${k + 1}:a]asplit=${uses}${steps.map((step, i) => (step.line.file === file ? `[l${i}]` : '')).join('')}`);
});
// A home recording gets low rumble and steady background hiss taken out.
const cleanup = voice ? ',highpass=f=80,afftdn=nf=-25' : '';
steps.forEach((step, i) => {
  const { start, duration: length } = step.line;
  const delay = Math.round((step.start + LEAD) * 1000);
  filters.push(
    `[l${i}]atrim=start=${start.toFixed(3)}:duration=${length.toFixed(3)},asetpts=PTS-STARTPTS${cleanup},` +
      `aresample=48000,aformat=channel_layouts=mono,adelay=${delay}:all=1[a${i}]`,
  );
});
filters.push(
  `${steps.map((_, i) => `[a${i}]`).join('')}amix=inputs=${steps.length}:normalize=0:dropout_transition=0,` +
    'loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono,apad[a]',
);

const output = `${OUT}chalkboard-demo.mp4`;
execFileSync(
  ffmpeg,
  [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', timeline.videoPath,
    ...audioFiles.flatMap((file) => ['-i', file]),
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

// Captions: one cue per sentence, timed in proportion to its length within the spoken line.
const stamp = (seconds) => {
  const ms = Math.round(seconds * 1000);
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};
const cues = [];
steps.forEach((step, i) => {
  const text = BEATS[i].caption;
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text];
  const chars = sentences.reduce((sum, s) => sum + s.length, 0);
  let time = step.start + LEAD;
  for (const sentence of sentences) {
    const length = (step.line.duration * sentence.length) / chars;
    cues.push(`${cues.length + 1}\n${stamp(time)} --> ${stamp(time + length)}\n${sentence.trim()}\n`);
    time += length;
  }
});
writeFileSync(`${OUT}chalkboard-demo.srt`, cues.join('\n'));

const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
console.log(`Wrote ${output} (${clock(total)}) and chalkboard-demo.srt, narrated by ${narrator}`);
for (const step of steps) {
  const held = step.hold > 0.05 ? `  (held ${step.hold.toFixed(1)}s longer for the line)` : '';
  console.log(`  ${clock(step.start).padStart(5)}  ${step.id.padEnd(10)} line ${step.line.duration.toFixed(1)}s${held}`);
}
if (total > 180) console.log('WARNING: longer than 3:00; judges may stop watching at 3:00.');

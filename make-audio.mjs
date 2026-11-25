import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, copyFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

globalThis.window = {};
await import('./dist/episodes.js');
const clipsDirectory = process.argv[2];
const key = process.env.HEYGEN_API_KEY;
const voice = process.env.HEYGEN_VOICE_ID;
if (!clipsDirectory && (!key || !voice)) {
  throw new Error('Set HEYGEN_API_KEY and HEYGEN_VOICE_ID, or pass a directory of HeyGen clips.');
}

async function fetchClip(text, file) {
  const reply = await fetch('https://api.heygen.com/v3/models/audio/tts', {
    method: 'POST',
    headers: {'X-Api-Key': key, 'Content-Type': 'application/json'},
    body: JSON.stringify({
      model: 'heygen-voice-1-turbo', voice_id: voice, text,
      language: 'en', expressiveness_boost: 0.8
    }),
    signal: AbortSignal.timeout(120_000)
  });
  if (!reply.ok) throw new Error('HeyGen synthesis failed: ' + reply.status);
  const payload = await reply.json();
  const audioUrl = new URL((payload.data ?? payload).audio_url);
  if (audioUrl.protocol !== 'https:') throw new Error('Invalid HeyGen audio URL');
  const audio = await fetch(audioUrl, {signal: AbortSignal.timeout(60_000)});
  if (!audio.ok) throw new Error('HeyGen audio download failed: ' + audio.status);
  writeFileSync(file, Buffer.from(await audio.arrayBuffer()));
}

const temp = mkdtempSync(join(tmpdir(), 'english-on-air-'));
try {
  const timestamps = {};
  for (const [id, , , , , dialogue] of window.episodes) {
    let time = 0;
    const clips = [];
    timestamps[id] = [];
    for (const [index, [line]] of dialogue.entries()) {
      const stem = id + '-' + index;
      const source = join(clipsDirectory ?? temp, stem + '.audio');
      if (!clipsDirectory) await fetchClip(line, source);
      const clip = join(temp, stem + '.wav');
      execFileSync('ffmpeg', ['-v', 'error', '-i', source, '-ar', '24000', '-ac', '1', '-af', 'apad=pad_dur=0.3', clip]);
      const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', clip]));
      if (!Number.isFinite(seconds) || seconds <= 0.3) throw new Error('Invalid clip duration: ' + stem);
      timestamps[id].push(time);
      time += seconds;
      clips.push(clip);
    }
    const args = clips.flatMap(file => ['-i', file]);
    const labels = clips.map((_, i) => '[' + i + ':a]').join('');
    execFileSync('ffmpeg', ['-v', 'error', ...args, '-filter_complex', labels + 'concat=n=' + clips.length + ':v=0:a=1', '-b:a', '64k', join(temp, id + '.mp3')]);
    console.log(id + ' · ' + Math.round(time) + ' s');
  }
  mkdirSync('dist/audio', {recursive: true});
  for (const id of Object.keys(timestamps)) copyFileSync(join(temp, id + '.mp3'), 'dist/audio/' + id + '.mp3');
  writeFileSync('dist/timestamps.js', 'window.timestamps = ' + JSON.stringify(timestamps) + ';\n');
} finally {
  rmSync(temp, {recursive:true, force:true});
}

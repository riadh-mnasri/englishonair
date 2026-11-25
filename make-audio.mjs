import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

globalThis.window = {};
await import('./dist/episodes.js');
mkdirSync('dist/audio', {recursive: true});
const temp = mkdtempSync(join(tmpdir(), 'english-on-air-'));
try {
  const timestamps = {};
  for (const [id, , , , , dialogue] of window.episodes) {
    let time = 0;
    const clips = [];
    timestamps[id] = dialogue.map(([line], index) => {
      const file = join(temp, index + '.wav');
      execFileSync('espeak-ng', ['-v', index % 2 ? 'en-us+f3' : 'en-gb+m3', '-s', '146', '-w', file, line]);
      clips.push(file);
      const start = time;
      time += Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]));
      if (!Number.isFinite(time)) throw new Error('Invalid audio duration: ' + id);
      return start;
    });
    const args = clips.flatMap(file => ['-i', file]);
    const labels = clips.map((_, i) => '[' + i + ':a]').join('');
    execFileSync('ffmpeg', ['-v', 'error', '-y', ...args, '-filter_complex', labels + 'concat=n=' + clips.length + ':v=0:a=1', '-b:a', '64k', 'dist/audio/' + id + '.mp3']);
  }
  writeFileSync('dist/timestamps.js', 'window.timestamps = ' + JSON.stringify(timestamps) + ';\n');
} finally {
  rmSync(temp, {recursive:true, force:true});
}

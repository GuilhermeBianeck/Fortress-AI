import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const sources = process.argv.slice(2);
if (sources.length !== 2) throw new Error('Provide the two original theme MP3 paths, in order.');
fs.mkdirSync('public/audio', { recursive: true });
fs.mkdirSync('asset-workbench/music-v8', { recursive: true });
const report = sources.map((source, index) => {
    const output = `public/audio/fortress-theme-${index + 1}.mp3`;
    // Stream copy removes the embedded cover without another lossy encoding pass.
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', source, '-map', '0:a:0', '-c:a', 'copy', '-map_metadata', '-1', output]);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', output], { encoding: 'utf8' }));
    const measured = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', output, '-af', 'loudnorm=I=-18:TP=-2:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
    if (measured.status !== 0) throw new Error(measured.stderr);
    const metrics = JSON.parse(measured.stderr.slice(measured.stderr.indexOf('{'), measured.stderr.lastIndexOf('}') + 1));
    const pcmHash = (file: string) => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:a:0', '-c:a', 'pcm_f32le', '-f', 'hash', '-hash', 'sha256', '-'], { encoding: 'utf8' }).trim();
    const sourcePcm = pcmHash(source), outputPcm = pcmHash(output);
    if (sourcePcm !== outputPcm) throw new Error(`Decoded music changed: ${source}`);
    const silence = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', output, '-af', 'silencedetect=noise=-48dB:d=0.5', '-f', 'null', '-'], { encoding: 'utf8' });
    if (silence.status !== 0) throw new Error(silence.stderr);
    const silentRegions = [...silence.stderr.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+)/g)].map(match => ({ start: Number(match[1]), end: Number(match[2]) }));
    return {
        source: path.basename(source), sourceSha256: createHash('sha256').update(fs.readFileSync(source)).digest('hex'),
        output, sha256: createHash('sha256').update(fs.readFileSync(output)).digest('hex'),
        bytes: fs.statSync(output).size, duration: Number(probe.format.duration),
        sampleRate: Number(probe.streams[0].sample_rate), channels: probe.streams[0].channels,
        audioStreams: probe.streams.length, processing: 'MP3 stream copy; cover and metadata stripped; runtime gain matching, no lossy re-encode',
        integratedLufs: Number(metrics.input_i), truePeakDb: Number(metrics.input_tp), loudnessRangeLu: Number(metrics.input_lra),
        decodedPcmSha256: outputPcm, sourcePcmIdentical: true, silentRegions,
    };
});
fs.writeFileSync('asset-workbench/music-v8/audio-qa.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(report);

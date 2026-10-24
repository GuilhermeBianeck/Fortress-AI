import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = 'asset-workbench/royal-menu-v4/reference/animation.mp4';
const outputPath = 'public/audio/royal-menu-loop.wav';
const introPath = 'public/audio/royal-menu-intro.wav';
const reportPath = 'asset-workbench/royal-menu-v4/audio-qa.json';
const speechReportPath = 'asset-workbench/royal-menu-v4/audio-speech-verification.json';
const sampleRate = 48000;
const channels = 2;
export const MENU_AUDIO_REGIONS = { introEndSeconds: 6, musicStartSeconds: 6, musicEndSeconds: 8, crossfadeSeconds: 0.4 } as const;
const crossfadeSeconds = MENU_AUDIO_REGIONS.crossfadeSeconds;
const attenuationDb = -3;
const introFadeOutSeconds = 0.12;
const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

function run(command: string, args: string[]): Buffer {
    return execFileSync(command, args, { maxBuffer: 64 * 1024 * 1024 });
}

function floats(raw: Buffer): Float32Array {
    const samples = new Float32Array(raw.length / 4);
    for (let i = 0; i < samples.length; i++) samples[i] = raw.readFloatLE(i * 4);
    return samples;
}

const db = (amplitude: number): number | null => amplitude > 0 ? 20 * Math.log10(amplitude) : null;

/** Overlap the tail with the head, then wrap into contiguous source samples. */
export function createPeriodicLoop(input: Float32Array, channelCount: number, overlapFrames: number, gain: number): Float32Array {
    const frames = input.length / channelCount;
    if (!Number.isInteger(channelCount) || channelCount < 1 || !Number.isInteger(frames)
        || !Number.isInteger(overlapFrames) || overlapFrames < 2 || overlapFrames * 2 >= frames
        || !Number.isFinite(gain) || gain <= 0 || gain > 1) {
        throw new Error('Invalid PCM layout, overlap, or attenuation');
    }
    const length = frames - overlapFrames;
    const unchangedFrames = frames - 2 * overlapFrames;
    const output = new Float32Array(length * channelCount);
    for (let frame = 0; frame < length; frame++) {
        const index = frame - unchangedFrames;
        const t = Math.max(0, index) / (overlapFrames - 1);
        // Smoothstep makes both fade slopes zero at their joins; equal power avoids an artificial dip.
        const phase = t * t * (3 - 2 * t) * Math.PI / 2;
        for (let channel = 0; channel < channelCount; channel++) {
            const tail = input[(frame + overlapFrames) * channelCount + channel];
            output[frame * channelCount + channel] = gain * (index < 0 ? tail
                : tail * Math.cos(phase) + input[index * channelCount + channel] * Math.sin(phase));
        }
    }
    return output;
}

export function encodeWav(pcm: Float32Array, rate: number, channelCount: number): Buffer {
    const output = Buffer.alloc(44 + pcm.length * 2);
    output.write('RIFF', 0);
    output.writeUInt32LE(output.length - 8, 4);
    output.write('WAVEfmt ', 8);
    output.writeUInt32LE(16, 16);
    output.writeUInt16LE(1, 20);
    output.writeUInt16LE(channelCount, 22);
    output.writeUInt32LE(rate, 24);
    output.writeUInt32LE(rate * channelCount * 2, 28);
    output.writeUInt16LE(channelCount * 2, 32);
    output.writeUInt16LE(16, 34);
    output.write('data', 36);
    output.writeUInt32LE(pcm.length * 2, 40);
    for (let i = 0; i < pcm.length; i++) {
        if (!Number.isFinite(pcm[i]) || Math.abs(pcm[i]) >= 1) throw new Error(`Clipping or non-finite PCM at sample ${i}`);
        output.writeInt16LE(Math.round(pcm[i] * 32767), 44 + i * 2);
    }
    return output;
}

export function createMenuIntro(input: Float32Array): Float32Array {
    const frames = Math.round(MENU_AUDIO_REGIONS.introEndSeconds * sampleRate);
    const fadeInFrames = Math.round(0.01 * sampleRate), fadeOutFrames = Math.round(introFadeOutSeconds * sampleRate);
    const gain = 10 ** (attenuationDb / 20);
    const output = new Float32Array(frames * channels);
    for (let frame = 0; frame < frames; frame++) {
        const t = Math.min(1, Math.max(0, (frame - (frames - fadeOutFrames)) / (fadeOutFrames - 1)));
        const fadeOut = Math.cos(t * t * (3 - 2 * t) * Math.PI / 2);
        for (let channel = 0; channel < channels; channel++) {
            output[frame * channels + channel] = input[frame * channels + channel] * gain
                * Math.min(1, frame / (fadeInFrames - 1)) * fadeOut;
        }
    }
    return output;
}

// Optional offline verification, not a build/runtime dependency. No audio is sent to a service.
const speechVerificationPython = String.raw`
import hashlib, importlib.metadata, json, subprocess, sys
from pocketsphinx import Decoder
paths = json.loads(sys.stdin.read())
def decode(path, start=0, end=None, repeats=1):
    args = ['ffmpeg','-v','error','-i',path,'-map','0:a:0','-ss',str(start)]
    if end is not None: args += ['-t',str(end-start)]
    pcm = subprocess.check_output(args + ['-ar','16000','-ac','1','-f','s16le','pipe:1']) * repeats
    decoder = Decoder(samprate=16000, loglevel='ERROR')
    decoder.start_utt(); decoder.process_raw(pcm, False, True); decoder.end_utt()
    hypothesis = decoder.hyp()
    segments = [{'word':s.word, 'startSeconds':s.start_frame/100 + start, 'endSeconds':(s.end_frame+1)/100 + start}
                for s in decoder.seg()] if hypothesis else []
    return {'hypothesis':hypothesis.hypstr if hypothesis else '',
            'words':[s for s in segments if not s['word'].startswith(('<','['))],
            'nonLexicalEvents':[s for s in segments if s['word'].startswith('[')], 'segments':segments}
def identity(path):
    with open(path,'rb') as file: digest = hashlib.sha256(file.read()).hexdigest()
    return {'path':path, 'sha256':digest}
source = decode(paths['source'], end=8)
tail = decode(paths['source'], start=6, end=8)
intro = decode(paths['intro'])
loop = decode(paths['loop'], repeats=5)
last_word = max((word['endSeconds'] for word in source['words']), default=8)
print(json.dumps({'recognizer':'PocketSphinx', 'version':importlib.metadata.version('pocketsphinx'),
    'mode':'Unconstrained default English model, local CPU, 16 kHz mono analysis; not forced alignment.',
    'documentation':'https://pocketsphinx.readthedocs.io/en/stable/pocketsphinx.html',
    'source':identity(paths['source']), 'intro':identity(paths['intro']), 'loop':identity(paths['loop']),
    'sourceRecognition':source, 'introRecognition':intro, 'musicSourceRecognition':tail,
    'fiveLoopRecognition':loop, 'detectedLastWordEndSeconds':last_word,
    'musicGuardAfterDetectedSpeechSeconds':round(6-last_word, 3),
    'checks':{'sourceSpeechDetected':bool(source['words']), 'speechEndsBeforeMusic':last_word <= 5.8,
              'introSpeechDetected':bool(intro['words']), 'noWordsInMusicSource':not tail['words'],
              'noWordsAcrossFiveMusicLoops':not loop['words']},
    'limitations':['ASR absence of words does not prove absence of faint speech, reverb, or singing.',
                  'The repeated loop may produce non-lexical [SPEECH] acoustic markers; these are retained, not treated as verified words or dismissed as proof of silence.',
                  'Word spelling and 10 ms frame timestamps are estimates, not a verified transcript.',
                  'No human listening performed here. Main must listen to the isolated tail and several loop boundaries.'],
    'vocalSeparationPerformed':False, 'humanListeningPerformed':False}, indent=2))
`;

export function analyzePcm(pcm: Float32Array, rate: number, channelCount: number) {
    const frames = pcm.length / channelCount;
    const windowFrames = Math.min(Math.round(rate * 0.05), Math.floor(frames / 2));
    const perChannel = Array.from({ length: channelCount }, (_, channel) => {
        let energy = 0, peak = 0, sum = 0, differenceEnergy = 0, clippedSamples = 0;
        const differences: number[] = [];
        for (let frame = 0; frame < frames; frame++) {
            const sample = pcm[frame * channelCount + channel];
            if (!Number.isFinite(sample)) throw new Error('Non-finite PCM');
            energy += sample * sample;
            sum += sample;
            peak = Math.max(peak, Math.abs(sample));
            if (Math.abs(sample) >= 32767 / 32768) clippedSamples++;
            if (frame > 0) {
                const delta = sample - pcm[(frame - 1) * channelCount + channel];
                differenceEnergy += delta * delta;
                differences.push(Math.abs(delta));
            }
        }
        differences.sort((a, b) => a - b);
        const first = pcm[channel], last = pcm[(frames - 1) * channelCount + channel];
        const step = first - last;
        const previousStep = last - pcm[(frames - 2) * channelCount + channel];
        const nextStep = pcm[channelCount + channel] - first;
        const windowRms = (start: number) => {
            let total = 0;
            for (let frame = start; frame < start + windowFrames; frame++) total += pcm[frame * channelCount + channel] ** 2;
            return Math.sqrt(total / windowFrames);
        };
        const before = windowRms(frames - windowFrames), after = windowRms(0);
        return {
            peak, peakDbfs: db(peak), rmsDbfs: db(Math.sqrt(energy / frames)), dcOffset: sum / frames, clippedSamples,
            adjacentStepRms: Math.sqrt(differenceEnergy / (frames - 1)),
            adjacentStepP999: differences[Math.floor((differences.length - 1) * 0.999)],
            adjacentStepMax: differences[differences.length - 1],
            seam: {
                firstSample: first, lastSample: last, absoluteStep: Math.abs(step), stepDbfs: db(Math.abs(step)),
                slopeChange: Math.max(Math.abs(step - previousStep), Math.abs(nextStep - step)),
                before50msRmsDbfs: db(before), after50msRmsDbfs: db(after),
                levelChangeDb: before && after ? db(after / before) : null,
            },
        };
    });
    let longestSilentRunFrames = 0, silentRun = 0;
    for (let frame = 0; frame < frames; frame++) {
        let silent = true;
        for (let channel = 0; channel < channelCount; channel++) {
            if (Math.abs(pcm[frame * channelCount + channel]) >= 1 / 32768) silent = false;
        }
        silentRun = silent ? silentRun + 1 : 0;
        longestSilentRunFrames = Math.max(longestSilentRunFrames, silentRun);
    }
    const waveform = [];
    for (let start = 0; start < frames; start += Math.round(rate * 0.1)) {
        const end = Math.min(frames, start + Math.round(rate * 0.1));
        let energy = 0, peak = 0;
        for (let i = start * channelCount; i < end * channelCount; i++) {
            energy += pcm[i] ** 2;
            peak = Math.max(peak, Math.abs(pcm[i]));
        }
        waveform.push({ seconds: start / rate, rmsDbfs: db(Math.sqrt(energy / ((end - start) * channelCount))), peakDbfs: db(peak) });
    }
    return { frames, durationSeconds: frames / rate, sampleRate: rate, channels: channelCount,
        longestSilentRunSeconds: longestSilentRunFrames / rate, perChannel, waveform100ms: waveform };
}

export function prepareMenuAudio(verifySpeech = false) {
    const source = path.join(root, sourcePath);
    const destination = path.join(root, outputPath);
    const sourceHash = sha256(fs.readFileSync(source));
    const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', source]).toString());
    const stream = probe.streams.find((item: { codec_type: string }) => item.codec_type === 'audio');
    if (!stream || Number(stream.sample_rate) !== sampleRate || stream.channels !== channels) throw new Error('Expected 48 kHz stereo reference');
    // Decode only the stream duration: AAC packet padding must not become loop silence.
    const input = floats(run('ffmpeg', ['-v', 'error', '-i', source, '-map', '0:a:0', '-t', stream.duration,
        '-ar', String(sampleRate), '-ac', String(channels), '-f', 'f32le', '-acodec', 'pcm_f32le', 'pipe:1']));
    const overlap = Math.round(crossfadeSeconds * sampleRate);
    const gain = 10 ** (attenuationDb / 20);
    const music = input.slice(MENU_AUDIO_REGIONS.musicStartSeconds * sampleRate * channels, MENU_AUDIO_REGIONS.musicEndSeconds * sampleRate * channels);
    const output = encodeWav(createPeriodicLoop(music, channels, overlap, gain), sampleRate, channels);
    const intro = encodeWav(createMenuIntro(input), sampleRate, channels);
    const quantized = new Float32Array((output.length - 44) / 2);
    for (let i = 0; i < quantized.length; i++) quantized[i] = output.readInt16LE(44 + i * 2) / 32768;
    const originalMetrics = analyzePcm(input, sampleRate, channels);
    const introQuantized = Float32Array.from({ length: (intro.length - 44) / 2 }, (_, i) => intro.readInt16LE(44 + i * 2) / 32768);
    const introMetrics = analyzePcm(introQuantized, sampleRate, channels);
    const musicSourceMetrics = analyzePcm(music, sampleRate, channels);
    const loopMetrics = analyzePcm(quantized, sampleRate, channels);
    // Check the joins of the crossfade as well as the physical WAV boundary.
    const crossfadeStart = music.length / channels - 2 * overlap;
    const joinSteps = [0, crossfadeStart].map(frame => ({ frame, seconds: frame / sampleRate,
        steps: Array.from({ length: channels }, (_, channel) => Math.abs(quantized[frame * channels + channel]
            - quantized[((frame - 1 + loopMetrics.frames) % loopMetrics.frames) * channels + channel])) }));
    const oversampled = floats(execFileSync('ffmpeg', ['-v', 'error', '-f', 'wav', '-i', 'pipe:0',
        '-af', 'aresample=192000:filter_size=64', '-f', 'f32le', '-acodec', 'pcm_f32le', 'pipe:1'],
    { input: output, maxBuffer: 64 * 1024 * 1024 }));
    let oversampledPeak = 0;
    for (const sample of oversampled) oversampledPeak = Math.max(oversampledPeak, Math.abs(sample));
    const checks = {
        exactDuration: loopMetrics.frames === music.length / channels - overlap,
        noClipping: loopMetrics.perChannel.every(channel => channel.clippedSamples === 0) && oversampledPeak < 1,
        introNoClipping: introMetrics.perChannel.every(channel => channel.clippedSamples === 0 && channel.peak < 0.25),
        introFadedAtBothEnds: [0, 1, introQuantized.length - 2, introQuantized.length - 1].every(index => introQuantized[index] === 0),
        conservativeHeadroom: oversampledPeak < 10 ** (-9 / 20),
        seamWithinNormalSteps: joinSteps.every(join => join.steps.every((step, index) => step <= loopMetrics.perChannel[index].adjacentStepP999)),
        smoothPeriodicSlope: loopMetrics.perChannel.every(channel => channel.seam.slopeChange <= channel.adjacentStepP999),
        boundedBoundaryEnvelopeChange: loopMetrics.perChannel.every(channel => Math.abs(channel.seam.levelChangeDb ?? Infinity) < 4),
        noAddedSilentGap: loopMetrics.longestSilentRunSeconds <= Math.max(0.001, originalMetrics.longestSilentRunSeconds),
        lowerWorstBoundaryJump: Math.max(...loopMetrics.perChannel.map(channel => channel.seam.absoluteStep))
            < Math.max(...musicSourceMetrics.perChannel.map(channel => channel.seam.absoluteStep)) * gain,
        sourceUnchanged: sourceHash === sha256(fs.readFileSync(source)),
    };
    if (Object.values(checks).some(passed => !passed)) throw new Error(`Audio QA failed: ${JSON.stringify(checks)}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, output);
    fs.writeFileSync(path.join(root, introPath), intro);
    const verificationPath = path.join(root, speechReportPath);
    if (verifySpeech) {
        const verification = execFileSync('uv', ['run', '--no-project', '--python', '3.12', '--with', 'pocketsphinx==5.1.1', 'python', '-c', speechVerificationPython],
            { input: JSON.stringify({ source: sourcePath, intro: introPath, loop: outputPath }), cwd: root, maxBuffer: 1024 * 1024 });
        fs.writeFileSync(verificationPath, verification);
    }
    if (!fs.existsSync(verificationPath)) throw new Error('Run with --verify-speech to create the offline speech evidence first');
    const speech = JSON.parse(fs.readFileSync(verificationPath, 'utf8'));
    if (speech.source.sha256 !== sourceHash || speech.loop.sha256 !== sha256(output) || speech.intro.sha256 !== sha256(intro)
        || !Object.values(speech.checks).every(Boolean)) throw new Error('Speech evidence is stale or failed; rerun with --verify-speech and inspect the results');
    const report = {
        source: { path: sourcePath, sha256: sourceHash, codec: stream.codec_name, ...originalMetrics },
        output: { path: outputPath, sha256: sha256(output),
            bytes: output.length, format: 'PCM signed 16-bit little-endian WAV', ...loopMetrics },
        intro: { path: introPath, sha256: sha256(intro), ...introMetrics,
            fadeInSeconds: 0.01, fadeOutSeconds: introFadeOutSeconds, loop: false,
            note: 'One-shot; seam metrics are descriptive only, not a loop requirement.' },
        speech: { verificationArtifact: speechReportPath, sourceWordRegionSeconds: [speech.sourceRecognition.words[0].startSeconds, speech.detectedLastWordEndSeconds],
            introSourceRegionSeconds: [0, 6], musicSourceRegionSeconds: [6, 8], guardSeconds: speech.musicGuardAfterDetectedSpeechSeconds,
            method: 'Exclude the entire speech-bearing region in time. No EQ, cancellation, or crossfade is claimed to remove speech.',
            automatedCheck: 'Default English ASR recognized lexical words in the intro, none in source 6-8s or five concatenated music loops. Non-lexical [SPEECH] markers at loop joins remain in the evidence; human review is required.',
            humanApproval: 'Pending; ASR non-detection is not human listening approval.' },
        musicSource: musicSourceMetrics,
        processing: { crossfadeSeconds, overlapFrames: overlap, attenuationDb,
            method: 'Tail/head equal-power crossfade with smoothstep phase; retained middle unchanged except gain and PCM16 quantization.',
            layout: 'Music only: source[6.4s:7.6s], then crossfade(source[7.6s:8s], source[6s:6.4s]). No source before 6s enters the loop.',
            speedChange: false, encoderPadding: false, runtimeGain: 0.6 },
        playback: { onceScope: 'Document lifetime, including controller disposal/recreation and BFCache restoration.',
            urls: { intro: '/audio/royal-menu-intro.wav', music: '/audio/royal-menu-loop.wav?v=instrumental-2' },
            welcomeEligibility: 'First trusted, unmuted, visible-menu gesture. Muted gestures do not consume or arm the welcome.',
            welcomeConsumedWhen: 'A source containing the intro successfully starts while unmuted; never at fetch, decode, or unlock.',
            interruption: 'Skip the remaining intro on mute, route exit, hide, or disposal. Never replay its start.',
            firstBuffer: { durationSeconds: 7.6, loopStart: 6, loopEnd: 7.6, sourceStartOffset: 0 },
            subsequentBuffer: { durationSeconds: 1.6, loopStart: 0, loopEnd: 1.6 },
            transition: 'The final 120ms of the faded intro overlaps the end of the music period, followed by a contiguous native music wrap.' },
        periodicJoins: joinSteps,
        oversampledPeak: { amplitude: oversampledPeak, dbfs: db(oversampledPeak), factor: 4, method: 'FFmpeg 192 kHz sinc resampling, 64-tap filter' },
        checks,
        browserValidation: { performed: false, reason: 'This preparation script does not launch browsers. See verification.md and tests/e2e/royal-menu.spec.ts for separate runtime validation.' },
        humanListening: { performed: false, reason: 'No human listening session available; numerical QA cannot establish musical or perceptual seamlessness.' },
        reproduce: { prepare: 'npx tsx scripts/prepare-menu-audio.ts', verifySpeech: 'npx tsx scripts/prepare-menu-audio.ts --verify-speech',
            tests: 'npx tsx --test src/audio/menuAmbience.test.ts',
            dependency: 'Optional --verify-speech uses uv with PocketSphinx 5.1.1 (~34 MB source distribution, bundled English model), isolated outside this repository. No runtime dependency or cloud audio upload.' },
    };
    fs.mkdirSync(path.dirname(path.join(root, reportPath)), { recursive: true });
    fs.writeFileSync(path.join(root, reportPath), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ output: outputPath, report: reportPath, seconds: loopMetrics.durationSeconds, checks }, null, 2));
    return report;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) prepareMenuAudio(process.argv.includes('--verify-speech'));

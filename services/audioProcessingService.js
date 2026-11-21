const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');

const AUDIO_PRESETS = Object.freeze({
  corporateVoice: Object.freeze({ highpassHz: 90, presenceDb: 2, compressionRatio: 2.3, targetLufs: -16, truePeakDb: -1.5 }),
  uploadedVoice: Object.freeze({ highpassHz: 80, presenceDb: 1, compressionRatio: 2.5, noiseReductionDb: 6, targetLufs: -16, truePeakDb: -1.5 }),
  backgroundMusic: Object.freeze({ targetLufs: -23, truePeakDb: -2, gainDb: 0, fadeInSec: 0, fadeOutSec: 0 }),
});
const LIMITS = {
  highpassHz: [20, 250], presenceDb: [-6, 6], compressionRatio: [1, 6],
  noiseReductionDb: [0, 12], targetLufs: [-30, -10], truePeakDb: [-6, -1],
  gainDb: [-60, 0], fadeInSec: [0, 30], fadeOutSec: [0, 30], durationSec: [0.01, 7200],
};

function getPresetSettings(preset, overrides = {}) {
  if (!Object.hasOwn(AUDIO_PRESETS, preset)) throw new Error('Unknown audio processing preset');
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new Error('Audio overrides must be an object');
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(LIMITS, key) || (key !== 'durationSec' && !Object.hasOwn(AUDIO_PRESETS[preset], key))) {
      throw new Error(`Unsupported audio override: ${key}`);
    }
    const [low, high] = LIMITS[key];
    if (!Number.isFinite(value) || value < low || value > high) throw new Error(`Invalid audio override: ${key}`);
  }
  return { ...AUDIO_PRESETS[preset], ...overrides };
}

function buildAudioFilters(preset, overrides = {}) {
  const s = getPresetSettings(preset, overrides);
  const filters = [];
  if (preset !== 'backgroundMusic') {
    filters.push(`highpass=f=${s.highpassHz}`);
    if (s.noiseReductionDb) filters.push(`afftdn=nr=${s.noiseReductionDb}:nf=-45`);
    filters.push(`equalizer=f=3000:t=q:w=1.2:g=${s.presenceDb}`);
    filters.push(`acompressor=threshold=-18dB:ratio=${s.compressionRatio}:attack=8:release=80:makeup=1`);
  }
  filters.push(`loudnorm=I=${s.targetLufs}:TP=${s.truePeakDb}:LRA=${preset === 'backgroundMusic' ? 11 : 7}`);
  if (preset === 'backgroundMusic') {
    filters.push(`volume=${s.gainDb}dB`);
    if (s.fadeInSec) filters.push(`afade=t=in:st=0:d=${s.fadeInSec}`);
    if (s.fadeOutSec) {
      if (!Number.isFinite(s.durationSec)) throw new Error('Music fade-out requires durationSec');
      filters.push(`afade=t=out:st=${Math.max(0, s.durationSec - s.fadeOutSec)}:d=${s.fadeOutSec}`);
    }
  }
  filters.push(`alimiter=limit=${Math.pow(10, s.truePeakDb / 20).toFixed(6)}:level=0:attack=5:release=80`);
  return filters.join(',');
}

function resolveFfmpegPath() {
  try { return require('ffmpeg-static') || 'ffmpeg'; } catch { return 'ffmpeg'; }
}

function runAudioTool(binary, args, { timeoutMs = 120000 } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 600000) return Promise.reject(new Error('Invalid audio tool timeout'));
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', data => { stdout = (stdout + data).slice(-1048576); });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-65536); });
    child.on('error', () => { clearTimeout(timer); reject(new Error('FFmpeg could not start; install FFmpeg or restore ffmpeg-static')); });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error('FFmpeg audio operation timed out'));
      if (code !== 0) return reject(new Error(`FFmpeg audio operation failed (exit ${code})`));
      resolve({ stdout, stderr });
    });
  });
}

async function requireAudioFile(file) {
  const stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile() || stat.size === 0) throw new Error('Audio input is missing, empty, or not a file');
}

function createAudioProcessor({ binary, run = runAudioTool } = {}) {
  const ffmpeg = () => binary || resolveFfmpegPath();
  async function validateAudioFile(file, { timeoutMs = 120000 } = {}) {
    await requireAudioFile(file);
    const result = await run(ffmpeg(), ['-hide_banner', '-nostdin', '-v', 'error', '-xerror', '-protocol_whitelist', 'file,pipe', '-i', path.resolve(file), '-map', '0:a:0', '-vn', '-progress', 'pipe:1', '-nostats', '-f', 'null', '-'], { timeoutMs });
    const times = [...result.stdout.matchAll(/out_time_us=(\d+)/g)].map(match => Number(match[1]));
    const durationSec = Math.max(0, ...times) / 1000000;
    if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error('Audio contains no decodable samples');
    return { durationSec };
  }

  async function processAudio({ inputFile, outputFile, preset = 'corporateVoice', overrides = {}, timeoutMs = 120000 }) {
    if (typeof inputFile !== 'string' || typeof outputFile !== 'string') throw new Error('inputFile and outputFile are required');
    getPresetSettings(preset, overrides);
    const input = path.resolve(inputFile), output = path.resolve(outputFile);
    await requireAudioFile(input);
    const realInput = await fs.realpath(input);
    const realOutput = await fs.realpath(output).catch(() => output);
    if (input === output || realInput === realOutput) throw new Error('Source audio must not be overwritten');
    const existing = await fs.stat(output).catch(() => null);
    const inputStat = await fs.stat(input);
    if (existing && existing.dev === inputStat.dev && existing.ino === inputStat.ino) throw new Error('Source audio must not be overwritten');
    const extension = path.extname(output).toLowerCase();
    if (!['.mp3', '.wav', '.m4a', '.flac'].includes(extension)) throw new Error('Use an MP3, WAV, M4A, or FLAC output');
    const { durationSec } = await validateAudioFile(input, { timeoutMs });
    const settings = { ...overrides };
    if (settings.durationSec && settings.durationSec > durationSec + 0.1) throw new Error('Output duration exceeds the source audio');
    if (preset === 'backgroundMusic' && !settings.durationSec) settings.durationSec = durationSec;
    const filters = buildAudioFilters(preset, settings);
    await fs.mkdir(path.dirname(output), { recursive: true });
    const scratch = await fs.mkdtemp(path.join(path.dirname(output), '.audio-'));
    const staged = path.join(scratch, `processed${extension}`);
    try {
      const args = ['-hide_banner', '-nostdin', '-v', 'error', '-xerror', '-y', '-protocol_whitelist', 'file,pipe', '-i', input, '-map', '0:a:0', '-vn', '-af', filters, '-ar', '48000', '-ac', preset === 'backgroundMusic' ? '2' : '1', '-map_metadata', '-1'];
      if (overrides.durationSec) args.push('-t', String(overrides.durationSec));
      if (extension === '.mp3') args.push('-c:a', 'libmp3lame', '-b:a', preset === 'backgroundMusic' ? '192k' : '128k');
      if (extension === '.m4a') args.push('-c:a', 'aac', '-b:a', '192k');
      args.push(staged);
      await run(ffmpeg(), args, { timeoutMs });
      await validateAudioFile(staged, { timeoutMs });
      await fs.rename(staged, output);
      return output;
    } finally {
      if (path.dirname(scratch) !== path.dirname(output) || !path.basename(scratch).startsWith('.audio-')) throw new Error('Invalid audio scratch path');
      await fs.rm(scratch, { recursive: true, force: true });
    }
  }
  return { processAudio, validateAudioFile };
}

module.exports = { AUDIO_PRESETS, getPresetSettings, buildAudioFilters, runAudioTool, resolveFfmpegPath, createAudioProcessor, ...createAudioProcessor() };

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { VOICE_PROFILES, getEditionVoiceProfile } = require('../../config/audioVoiceProfiles');
const { buildSsml, speechIdentity, createAzureSpeechService } = require('../../services/azureSpeechService');
const { AUDIO_PRESETS, buildAudioFilters, createAudioProcessor, processAudio, validateAudioFile, runAudioTool, resolveFfmpegPath } = require('../../services/audioProcessingService');
const { commercialAudioIdentity, createCommercialNarrationService } = require('../../services/commercialNarrationService');
const { EDITIONS, synthesizeVoiceover } = require('../../scripts/render_product_tour_mp4');

const AUDIO = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(512, 0x55)]);
const ENV = { AZURE_SPEECH_KEY: 'unit-test-key-not-a-real-key', AZURE_SPEECH_REGION: 'uksouth' };
async function directory(t) {
  const root = path.resolve(os.tmpdir());
  const dir = await fs.mkdtemp(path.join(root, 'rentalhub-audio-test-'));
  t.after(async () => {
    assert.equal(path.dirname(dir), root);
    assert.ok(path.basename(dir).startsWith('rentalhub-audio-test-'));
    await fs.rm(dir, { recursive: true, force: true });
  });
  return dir;
}
const mockDecode = async file => { assert.deepEqual(await fs.readFile(file), AUDIO); return { durationSec: 1 }; };
const response = () => new Response(AUDIO, { headers: { 'Content-Type': 'audio/mpeg' } });
function service(options = {}) {
  return createAzureSpeechService({ env: ENV, validateAudio: mockDecode, fetchImpl: async () => response(), ...options });
}

test('all four commercial editions use the specified central Nigerian English profiles', () => {
  assert.deepEqual(Object.keys(EDITIONS).sort(), ['flagship', 'landlord', 'protection', 'tenant']);
  for (const edition of ['flagship', 'landlord']) assert.equal(VOICE_PROFILES[getEditionVoiceProfile(edition)].voiceId, 'en-NG-AbeoNeural');
  for (const edition of ['tenant', 'protection']) assert.equal(VOICE_PROFILES[getEditionVoiceProfile(edition)].voiceId, 'en-NG-EzinneNeural');
  for (const voice of Object.values(VOICE_PROFILES)) assert.equal(voice.locale, 'en-NG');
  assert.throws(() => getEditionVoiceProfile('__proto__'), /Unknown/);
});

test('SSML escapes narration, includes the selected voice and avoids accent-altering prosody', () => {
  const ssml = buildSsml(`A & B <home> "yes" 'no'`, 'femaleCorporate');
  assert.ok(ssml.includes('A &amp; B &lt;home&gt; &quot;yes&quot; &apos;no&apos;'));
  assert.ok(ssml.includes('xml:lang="en-NG"'));
  assert.ok(ssml.includes('name="en-NG-EzinneNeural"'));
  assert.ok(!ssml.includes('prosody'));
  assert.throws(() => buildSsml('bad\u0000text'), /invalid XML/);
  assert.throws(() => buildSsml('x'.repeat(61000)), /too long/);
});

test('missing or invalid Azure configuration fails before any HTTP call', async t => {
  const dir = await directory(t);
  let calls = 0;
  for (const env of [{}, { AZURE_SPEECH_KEY: 'fake', AZURE_SPEECH_REGION: 'https://other.example' }]) {
    const api = service({ env, fetchImpl: async () => { calls++; throw Error('must not call'); } });
    await assert.rejects(api.generateSpeech({ text: 'Example', cacheDir: dir }), /AZURE_SPEECH/);
  }
  assert.equal(calls, 0);
});

test('successful mocked Azure synthesis writes validated audio and reuses only its own cache', async t => {
  const dir = await directory(t);
  await fs.writeFile(path.join(dir, 'vo_tenant_master.mp3'), AUDIO);
  let calls = 0;
  const api = service({ fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://uksouth.tts.speech.microsoft.com/cognitiveservices/v1');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['Ocp-Apim-Subscription-Key'], ENV.AZURE_SPEECH_KEY);
    assert.match(options.headers['X-Microsoft-OutputFormat'], /mp3$/);
    assert.ok(options.body.includes('en-NG-EzinneNeural'));
    return response();
  } });
  const options = { editionId: 'tenant', profile: 'femaleCorporate', text: 'Tenant example.', cacheDir: dir };
  const first = await api.generateSpeech(options);
  assert.equal(await api.generateSpeech(options), first);
  assert.equal(calls, 1);
  assert.match(path.basename(first), /^azure_tenant_[a-f0-9]{64}\.mp3$/);
  assert.deepEqual(await fs.readFile(first), AUDIO);
  assert.ok(!(await fs.readdir(dir)).some(name => name.startsWith('.azure-')));
});

test('raw and processed cache identities change with edition, script, voice and generation/processing settings', () => {
  const base = { editionId: 'tenant', text: 'Original.', profile: 'femaleCorporate' };
  const identity = speechIdentity(base);
  assert.notEqual(identity.hash, speechIdentity({ ...base, text: 'Changed.' }).hash);
  assert.notEqual(identity.hash, speechIdentity({ ...base, text: 'Original. ' }).hash);
  assert.notEqual(identity.hash, speechIdentity({ ...base, editionId: 'protection' }).hash);
  assert.notEqual(identity.hash, speechIdentity({ ...base, profile: 'maleCorporate' }).hash);
  assert.equal(identity.locale, 'en-NG');
  assert.match(identity.outputFormat, /24khz.*mp3/);
  const master = commercialAudioIdentity(base);
  assert.notEqual(master.hash, commercialAudioIdentity({ ...base, profile: 'maleCorporate' }).hash);
  assert.notEqual(master.hash, commercialAudioIdentity({ ...base, text: 'Changed.' }).hash);
  assert.equal(master.processing.filters, buildAudioFilters('corporateVoice'));
});

test('script changes, voice changes, corrupt caches and force regenerate Azure audio', async t => {
  const dir = await directory(t);
  let calls = 0;
  const api = service({ fetchImpl: async () => { calls++; return response(); } });
  const base = { editionId: 'tenant', text: 'Original.', profile: 'femaleCorporate', cacheDir: dir };
  const first = await api.generateSpeech(base);
  assert.notEqual(first, await api.generateSpeech({ ...base, text: 'Changed.' }));
  assert.notEqual(first, await api.generateSpeech({ ...base, profile: 'maleCorporate' }));
  await api.generateSpeech({ ...base, force: true });
  assert.equal(calls, 4);
  await fs.writeFile(first, 'broken');
  await api.generateSpeech(base);
  assert.equal(calls, 5);
});

test('concurrent identical synthesis is coalesced instead of billed twice', async t => {
  const dir = await directory(t);
  let calls = 0;
  const api = service({ fetchImpl: async () => { calls++; return response(); } });
  const options = { text: 'Concurrent.', cacheDir: dir };
  const [a, b] = await Promise.all([api.generateSpeech(options), api.generateSpeech(options)]);
  assert.equal(a, b);
  assert.equal(calls, 1);
});

test('Azure authentication errors are not retried or echoed from the response body', async t => {
  const dir = await directory(t);
  let calls = 0;
  const api = service({ fetchImpl: async () => { calls++; return new Response(ENV.AZURE_SPEECH_KEY, { status: 401 }); } });
  await assert.rejects(api.generateSpeech({ text: 'Example', cacheDir: dir }), error => /authentication failed/.test(error.message) && !error.message.includes(ENV.AZURE_SPEECH_KEY));
  assert.equal(calls, 1);
  assert.deepEqual(await fs.readdir(dir), []);
});

test('Azure rate limits and transient errors use bounded retries and Retry-After', async t => {
  const dir = await directory(t);
  const delays = [];
  let calls = 0;
  const api = service({ sleep: async ms => delays.push(ms), fetchImpl: async () => {
    calls++;
    if (calls === 1) return new Response('', { status: 429, headers: { 'Retry-After': '1' } });
    if (calls === 2) return new Response('', { status: 503 });
    return response();
  } });
  await api.generateSpeech({ text: 'Example', cacheDir: dir });
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 1000]);
  let exhausted = 0;
  const fail = service({ sleep: async () => {}, fetchImpl: async () => { exhausted++; return new Response('', { status: 500 }); } });
  await assert.rejects(fail.generateSpeech({ text: 'Other', cacheDir: dir }), /HTTP 500/);
  assert.equal(exhausted, 3);
});

test('long Retry-After is not ignored or allowed to hold the renderer indefinitely', async t => {
  const dir = await directory(t);
  let calls = 0;
  const api = service({ sleep: async () => assert.fail('should not sleep'), fetchImpl: async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '120' } }); } });
  await assert.rejects(api.generateSpeech({ text: 'Example', cacheDir: dir }), /rate limit/);
  assert.equal(calls, 1);
});

test('request timeouts are enforced and raw network errors cannot expose keys', async t => {
  const dir = await directory(t);
  const timeout = service({ fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Error('aborted')), { once: true })) });
  await assert.rejects(timeout.generateSpeech({ text: 'Timeout.', cacheDir: dir, timeoutMs: 15, maxRetries: 0 }), /timed out/);
  const network = service({ fetchImpl: async () => { throw Error(ENV.AZURE_SPEECH_KEY); } });
  await assert.rejects(network.generateSpeech({ text: 'Network.', cacheDir: dir, maxRetries: 0 }), error => error.message === 'Azure speech network request failed');
});

test('empty, non-audio, oversized and corrupt responses never become cached narration', async t => {
  for (const make of [
    () => new Response('', { headers: { 'Content-Type': 'audio/mpeg' } }),
    () => new Response('not audio', { headers: { 'Content-Type': 'application/json' } }),
    () => new Response(AUDIO, { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(21 * 1024 * 1024) } }),
    () => new Response(Buffer.alloc(515), { headers: { 'Content-Type': 'audio/mpeg' } }),
  ]) {
    const dir = await directory(t);
    let calls = 0;
    const api = service({ fetchImpl: async () => { calls++; return make(); } });
    await assert.rejects(api.generateSpeech({ text: 'Example', cacheDir: dir }));
    assert.equal(calls, 1);
    assert.deepEqual(await fs.readdir(dir), []);
  }
});

test('voice and music presets are separate, bounded, and do not alter pitch or pace', () => {
  assert.deepEqual(Object.keys(AUDIO_PRESETS), ['corporateVoice', 'uploadedVoice', 'backgroundMusic']);
  const voice = buildAudioFilters('corporateVoice');
  const uploaded = buildAudioFilters('uploadedVoice');
  const music = buildAudioFilters('backgroundMusic', { fadeInSec: 2.2, fadeOutSec: 2.8, durationSec: 30 });
  assert.match(voice, /highpass=.*equalizer=.*acompressor=.*loudnorm=.*alimiter=/);
  assert.match(uploaded, /afftdn=nr=6/);
  assert.ok(!/highpass|equalizer|acompressor|afftdn/.test(music));
  assert.match(music, /afade=t=in:st=0:d=2.2/);
  assert.match(music, /afade=t=out:st=27.2:d=2.8/);
  assert.ok(!/atempo|asetrate|rubberband|volume=1.32/.test(voice));
  assert.throws(() => buildAudioFilters('missing'), /Unknown/);
  assert.throws(() => buildAudioFilters('corporateVoice', { filters: 'unsafe' }), /Unsupported/);
  assert.throws(() => buildAudioFilters('corporateVoice', { presenceDb: 80 }), /Invalid/);
});

test('audio processing rejects missing files and source overwrite, including hard links', async t => {
  const dir = await directory(t), source = path.join(dir, 'source.mp3'), output = path.join(dir, 'output.mp3');
  const processor = createAudioProcessor({ run: async () => assert.fail('should not run FFmpeg') });
  await assert.rejects(processor.processAudio({ inputFile: source, outputFile: output }), /missing/);
  await fs.writeFile(source, AUDIO);
  await assert.rejects(processor.processAudio({ inputFile: source, outputFile: source }), /must not be overwritten/);
  await fs.link(source, output);
  await assert.rejects(processor.processAudio({ inputFile: source, outputFile: output }), /must not be overwritten/);
});

test('a failed processor preserves source and previous output and removes staging files', async t => {
  const dir = await directory(t), source = path.join(dir, 'source.mp3'), output = path.join(dir, 'output.mp3');
  await fs.writeFile(source, AUDIO);
  await fs.writeFile(output, 'previous master');
  const processor = createAudioProcessor({ run: async (_binary, args) => {
    if (args.includes('-progress')) return { stdout: 'out_time_us=1000000\n', stderr: '' };
    throw Error('FFmpeg failed for test');
  } });
  await assert.rejects(processor.processAudio({ inputFile: source, outputFile: output }), /FFmpeg failed/);
  assert.deepEqual(await fs.readFile(source), AUDIO);
  assert.equal(await fs.readFile(output, 'utf8'), 'previous master');
  assert.ok(!(await fs.readdir(dir)).some(name => name.startsWith('.audio-')));
});

test('commercial cache ignores Google masters and passes the right preset and force flag', async t => {
  const dir = await directory(t);
  await fs.writeFile(path.join(dir, 'vo_tenant_master.mp3'), AUDIO);
  const generated = [], processed = [];
  const api = createCommercialNarrationService({ validate: mockDecode, generate: async options => {
    generated.push(options);
    const file = path.join(dir, 'raw.mp3'); await fs.writeFile(file, AUDIO); return file;
  }, process: async options => { processed.push(options); await fs.copyFile(options.inputFile, options.outputFile); } });
  const options = { editionId: 'tenant', text: 'Example.', cacheDir: dir };
  const first = await api.getCommercialNarration(options);
  assert.equal(first.cached, false);
  assert.equal((await api.getCommercialNarration(options)).cached, true);
  assert.equal(generated.length, 1);
  assert.equal(generated[0].profile, 'femaleCorporate');
  assert.equal(processed[0].preset, 'corporateVoice');
  assert.match(path.basename(first.file), /^azure_vo_tenant_[a-f0-9]{64}_master.mp3$/);
  await api.getCommercialNarration({ ...options, force: true });
  assert.equal(generated[1].force, true);
  await api.getCommercialNarration({ ...options, text: 'Different.' });
  assert.equal(generated.length, 3);
});

test('renderer reports its safe no-narration fallback instead of claiming Azure succeeded', async () => {
  const logs = [], warnings = [];
  const result = await synthesizeVoiceover('flagship', 'Example.', { narrationService: async () => { throw Error('Configure AZURE_SPEECH_KEY and AZURE_SPEECH_REGION'); }, logger: { log: s => logs.push(s), warn: s => warnings.push(s) } });
  assert.equal(result, null);
  assert.equal(logs.length, 0);
  assert.match(warnings[0], /without generated narration/);
  assert.match(warnings[0], /AZURE_SPEECH_KEY/);
});

test('real FFmpeg validates mocked Azure audio and independently processes all presets without changing the source', async t => {
  const ffmpeg = resolveFfmpegPath();
  if (ffmpeg !== 'ffmpeg' && !await fs.stat(ffmpeg).catch(() => null)) { t.skip('FFmpeg unavailable'); return; }
  const dir = await directory(t), source = path.join(dir, 'input.wav');
  await runAudioTool(ffmpeg, ['-hide_banner', '-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=0.4', source]);
  const before = crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex');
  for (const preset of Object.keys(AUDIO_PRESETS)) {
    const output = path.join(dir, `${preset}.mp3`);
    assert.equal(await processAudio({ inputFile: source, outputFile: output, preset, overrides: preset === 'backgroundMusic' ? { fadeInSec: 0.03, fadeOutSec: 0.04 } : {} }), output);
    assert.ok((await validateAudioFile(output)).durationSec > 0);
  }
  assert.equal(crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex'), before);
  const bytes = await fs.readFile(path.join(dir, 'corporateVoice.mp3'));
  let requests = 0;
  const azure = createAzureSpeechService({ env: ENV, fetchImpl: async () => { requests++; return new Response(bytes, { headers: { 'Content-Type': 'audio/mpeg' } }); } });
  const generated = await azure.generateSpeech({ text: 'Mock HTTP with real audio decoding.', cacheDir: path.join(dir, 'azure') });
  assert.ok((await validateAudioFile(generated)).durationSec > 0);
  assert.equal(requests, 1);
  const broken = path.join(dir, 'broken.mp3'); await fs.writeFile(broken, Buffer.alloc(512));
  await assert.rejects(validateAudioFile(broken), /FFmpeg/);
});

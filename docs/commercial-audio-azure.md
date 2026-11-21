# Commercial narration with Azure Speech

## What changed

The four promotional editions now use Azure Speech REST with Node's native fetch. Existing listing-tour services and voice-call providers are unchanged. No package dependency was added.

| Edition | Profile | Voice | Locale |
| --- | --- | --- | --- |
| flagship | maleCorporate | en-NG-AbeoNeural | en-NG |
| landlord | maleCorporate | en-NG-AbeoNeural | en-NG |
| tenant | femaleCorporate | en-NG-EzinneNeural | en-NG |
| protection | femaleCorporate | en-NG-EzinneNeural | en-NG |

Edit `config/audioVoiceProfiles.js` to change assignments centrally. The selected voice supplies the accent; processing does not change pitch or speaking speed.

## Set up Azure

1. Create an Azure subscription, then create a Speech resource in the Azure portal. Follow [Microsoft's setup guide](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/get-started-text-to-speech).
2. Open that resource's **Keys and Endpoint** page. Copy one key and its region identifier.
3. Set the following privately in the backend environment (or the root `.env` for the renderer). Never place the key in web/mobile code, source control, logs or command history.

```dotenv
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=
```

Use the region code, not a URL. The code calls the regional Speech REST endpoint and requests `audio-24khz-96kbitrate-mono-mp3`. See [REST documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech) and [supported voices](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support).

**Cost warning:** Azure's free tier has quotas. It is not unlimited. Usage beyond a free allowance may incur charges, depending on your resource tier. Check the current [quotas](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits) and pricing before rendering. Set budget alerts. Retries and forced regeneration can create extra requests.

## Render

Use the backend's supported Node version with native fetch. Install the existing dependencies. The video renderer still requires FFmpeg and ffprobe on PATH; the shared audio service uses the installed `ffmpeg-static`, falling back to FFmpeg on PATH.

Run from the repository root:

```sh
node scripts/render_product_tour_mp4.js --clip=flagship
node scripts/render_product_tour_mp4.js --clip=tenant
node scripts/render_product_tour_mp4.js --clip=landlord
node scripts/render_product_tour_mp4.js --clip=protection
node scripts/render_product_tour_mp4.js --clip=all
node scripts/render_product_tour_mp4.js --clip=tenant --vertical-only
node scripts/render_product_tour_mp4.js --clip=tenant --landscape-only
node scripts/render_product_tour_mp4.js --clip=tenant --regen-vo
node scripts/render_product_tour_mp4.js --clip=tenant --resume
```

Existing output filenames, public/build destinations, scripts, scenes and layouts remain. Music selection, 650 ms narration delay, 2.2-second fade-in, 2.8-second fade-out and sidechain ducking remain. Resume checks scene duration before reusing an act.

Missing keys or failed synthesis produce an explicit warning. The renderer continues with music, or silence when music is unavailable, and reports which editions lack narration. Available narration is retained even when music is missing. A successful render alone does not mean narration succeeded.

## Cache and request safety

Raw cache keys include provider/schema, edition, exact narration text hash, voice, locale, SSML version and output format. Processed keys also include the corporate preset's filters and encoding settings. Changing text, profile or processing settings creates a different file. Legacy Google masters are never reused as Azure output. `--regen-vo` bypasses both caches and can incur charges.

Each cache hit must decode successfully. An existing valid cache can be used without credentials. Files are staged before replacement; failed generation does not publish empty audio or remove a previous valid file. Concurrent identical requests within one service instance share the pending request. Separate processes do not share that lock.

Requests have a 30-second timeout and at most two retries by default for transient failures. Retry-After is respected within the bounded wait; long delays stop with a useful error. Authentication errors are not retried. Error text excludes response bodies, keys and raw network messages. SSML text is escaped; malformed or oversized narration is rejected. Output size and decoded audio are checked.

## Use the shared processor independently

```js
const { processAudio } = require('./services/audioProcessingService');

async function prepareAudio() {
  await processAudio({
    inputFile: '/trusted/input/recording.wav',
    outputFile: '/trusted/output/recording-clean.mp3',
    preset: 'uploadedVoice',
  });
  await processAudio({
    inputFile: '/trusted/input/music.wav',
    outputFile: '/trusted/output/music-bed.mp3',
    preset: 'backgroundMusic',
    overrides: { fadeInSec: 2.2, fadeOutSec: 2.8 },
  });
}
```

`corporateVoice` uses rumble reduction, moderate presence EQ, gentle compression, loudness normalisation and peak limiting. `uploadedVoice` adds mild noise reduction. `backgroundMusic` uses separate music level, fade and peak controls; it never receives the speech chain. Overrides are numeric, bounded and preset-specific. Inputs must be trusted local files. This service is not a public upload endpoint; callers must retain their own permissions and upload checks.

Reference only: the old renderer used `atempo=1.05,highpass=f=90,equalizer=f=3000:t=q:w=1.2:g=2.4,acompressor=threshold=-18dB:ratio=2.8:attack=6:release=60,volume=1.32`, followed by a fixed mix gain of 1.42. Speed manipulation and fixed boost were removed. The shared processor uses loudness and peak control instead. Source files, including hard-linked inputs, cannot be overwritten. Failed FFmpeg runs and undecodable outputs are rejected.

Other backend scripts can also call `generateSpeech` from `services/azureSpeechService.js` with `{ editionId, text, profile, cacheDir, force }`; it returns a validated file path. Use a configured profile name such as `femaleCorporate`.

## Verification

```sh
node --test tests/services/commercialAudio.test.js
npm test
```

The audio tests mock every Azure request. A local synthetic tone checks real FFmpeg decoding and all three presets. These checks do not audition Nigerian voices or establish the listening quality of a final commercial. Generate and listen to real narration after private Azure configuration, before publication.

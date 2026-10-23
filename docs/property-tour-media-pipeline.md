# Property Tour Media Pipeline

How automatic property-tour videos are built, and how to configure the optional
audio, multi-aspect and photo-quality layers. Everything here is **best effort**:
a failure in any step downgrades the tour, it never blocks a listing.

## Order of work

`generatePropertyTour` (`config/utils/propertyTourService.js`)

1. Download photos and clips, rejecting anything below the minimum size.
2. Select an approved music track (optional).
3. Build a fact-grounded narration script from the property's own data.
4. Synthesise each line with the configured TTS provider (optional).
5. Encode intro → photo tour → clip reel → outro, with the verified feature
   highlights burned into the top bar.
6. Mix music (looped, faded, ducked under voice) and narration over the film.
7. Upload the master and any enabled aspect variants to Cloudinary.

The finished tour is written to `properties.video_url`; aspect variants are
written to `properties.video_variants` as `[{ format, label, url }]`.

## Truthfulness rules

- Narration only speaks values that exist on the property row or in
  `structured_features` with `available === true`.
- `false` means "landlord confirmed not available" and is never advertised.
- `null` means "unspecified" and is never spoken or highlighted.
- No adjectives or claims are generated (no "luxury", "perfect", …).
- Music only comes from `property_tour_music` rows that are active, not
  archived, `auto_select = true`, and `commercial_use_approved = true`.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PROPERTY_TOUR_RESOLUTION` | `4k` | `1080p`, `4k`, `8k` master size |
| `PROPERTY_TOUR_OUTPUT_FORMATS` | `16:9` | comma list of `16:9,9:16,4:5` variants |
| `PROPERTY_TOUR_ENHANCE_PHOTOS` | `true` | light eq/unsharp pass on stills |
| `PROPERTY_TOUR_MIN_PHOTO_WIDTH` | `640` | reject smaller photos |
| `PROPERTY_TOUR_MIN_PHOTO_HEIGHT` | `480` | reject smaller photos |
| `PROPERTY_TOUR_STABILISE_CLIPS` | `true` | `deshake` on landlord clips |
| `PROPERTY_TOUR_CLIP_SOURCE_SECONDS` | `12` | how much of each clip is read |
| `PROPERTY_TOUR_PREMIUM_HOLD` / `SNAPPY_HOLD` | `4.4` / `2.9` | shot lengths |
| `PROPERTY_TOUR_INTRO_SECONDS` / `OUTRO_SECONDS` | `4.2` / `5.2` | bookends |
| `PROPERTY_TOUR_PHONE` | `08030601238` | fallback contact line |
| `PROPERTY_TOUR_PHONE_STATES` | `{}` | per-state phone JSON map |

### Voice-over (optional)

| Variable | Purpose |
| --- | --- |
| `PROPERTY_TOUR_VOICE_ENABLED` | must be `true` to speak at all |
| `PROPERTY_TOUR_VOICE_PROVIDER` | `openai`, `elevenlabs`, or `custom` |
| `PROPERTY_TOUR_VOICE_ID` | provider voice id (required for ElevenLabs) |
| `PROPERTY_TOUR_VOICE_MODEL` | optional model override |
| `PROPERTY_TOUR_VOICE_LANGUAGE` | default `en-NG` |
| `OPENAI_API_KEY` | used by the `openai` adapter |
| `ELEVENLABS_API_KEY` | used by the `elevenlabs` adapter |
| `PROPERTY_TOUR_VOICE_ENDPOINT` / `_API_KEY` | used by the `custom` adapter |

Synthesised lines are cached by content + voice hash in the OS temp directory,
so re-running a tour does not re-bill the provider.

## Super Admin music library

- UI: `/super-admin/tour-music` (`client/src/pages/admin/TourMusicLibrary.jsx`).
- API: `/api/super/property-tour-music` (`routes/propertyTourMusic.js`).
- A track cannot score a tour until **Commercial use approved** is set.
- Archiving is soft: existing videos keep their audio, and the row stays in the
  library for licence auditing.
- Mix settings (`music_enabled`, `default_volume`, `ducking_enabled`,
  `ducking_volume`) live in `property_tour_music_settings` (single row).

## Structured features

- Server schema: `config/utils/propertyFeatureSchema.js`.
- Client schema: `client/src/data/propertyFeatureSchema.js` (kept in sync; a test
  asserts every server feature has a client counterpart).
- Landlord UI: `client/src/components/properties/PropertyFeaturesForm.jsx`.
- Tenant-facing display: `client/src/components/properties/PropertyFeaturesDisplay.jsx`.
- Search picks up `?features=water_board,prepaid_meter` and only matches
  properties where each feature is explicitly `available === true`.

## Migrations

- `171_property_structured_features.sql`
- `172_property_tour_music_library.sql`
- `173_property_tour_variants.sql`

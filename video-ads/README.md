# How to Generate Video Ads

## Prerequisites
- **Node.js v18 or v20** installed on your computer
- **FFmpeg** installed (download from https://ffmpeg.org)

## Step 1: Install dependencies
Open a terminal in the `video-ads/` folder:

```bash
cd video-ads
npm install
```

## Step 2: Preview ads (optional)
Opens a browser where you can see all ads before rendering:

```bash
npx remotion studio
```

## Step 3: Render individual ads
```bash
npx remotion render TextAd1 out/text-ad-1.mp4
npx remotion render TextAd2 out/text-ad-2.mp4
npx remotion render TextAd3 out/text-ad-3.mp4
npx remotion render TextAd4 out/text-ad-4.mp4
npx remotion render TextAd5 out/text-ad-5.mp4
npx remotion render CartoonAd1 out/cartoon-ad-1.mp4
npx remotion render CartoonAd2 out/cartoon-ad-2.mp4
npx remotion render CartoonAd3 out/cartoon-ad-3.mp4
```

## Step 4: Render all at once
```bash
npm run render:all
```

## Output
All MP4 files will be in `video-ads/out/`

---

## Available Ads

| Script Name | Command | Duration | Size |
|---|---|---|---|
| Stop Getting Scammed | `render:text-1` | 15 sec | 1080×1920 |
| 3 Steps | `render:text-2` | 20 sec | 1200×630 |
| 36 States | `render:text-3` | 10 sec | 1200×675 |
| Testimonials | `render:text-4` | 15 sec | 1080×1920 |
| Scam Statistics | `render:text-5` | 12 sec | 1200×630 |
| The Bad Agent (cartoon) | `render:cartoon-1` | 30 sec | 1080×1920 |
| How It Works (cartoon) | `render:cartoon-2` | 20 sec | 1200×630 |
| Nigeria Map (cartoon) | `render:cartoon-3` | 15 sec | 1080×1920 |

## Notes
- Text-only ads have animated text (zoom, slide, shake, typewriter effects)
- Cartoon ads show text-only for now — replace with actual cartoon animations in Animaker/Canva
- Colors match RentalHub branding: dark blue `#0f172a`, blue `#0284c7`, red `#dc2626`, yellow `#eab308`

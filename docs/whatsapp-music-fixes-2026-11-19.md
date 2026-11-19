# WhatsApp contact recovery and music playback — 19 November 2026

## Live result

- WhatsApp contacts: 163 before recovery; 7,552 missing contacts recovered; 7,715 unique contacts afterwards.
- The existing 163 all occur in the older SMS file, so they are counted once. The total is not 7,878.
- Source: 7,715 SMS contacts imported on 22 October 2026. The owner confirmed this was the same file intended for the earlier WhatsApp import.
- Existing WhatsApp records were preserved. No SMS records were changed. No messages were sent.
- Recovered records have source recovery, batch Recovered WhatsApp import 2026-10-22, status unknown and subscribed=false. SMS subscription alone is not treated as WhatsApp permission.
- The contact screen now says Saved WhatsApp contacts and shows the campaign permission state. Importing another batch returns to the complete list instead of hiding earlier batches.
- Repeat imports preserve existing subscriptions and the original batch rather than silently re-subscribing contacts.

## Findings

The live WhatsApp table contained IDs 1 through 163, with its sequence also at 163. Its only recorded successful import was Agc-contact on 5 November. Four available database backups from 11–14 November also held 163 records. An older implementation rejected a WhatsApp import when its numbers already existed under SMS. There is no saved older WhatsApp batch to restore directly; the matching SMS import was used for recovery at the owner's request.

All 289 music files exist. Their old browser links returned HTML with HTTP 200 rather than audio. The old button labelled Pause changed a track's eligibility for tours; it did not pause playback.

## Music changes

- Added authenticated, Super Admin/MFA-protected GET /api/super/property-tour-music/tracks/:id/audio.
- File lookup uses the database track ID. Only files inside the preset MP3 folder or uploaded tour-music folder are allowed. Real paths are checked to block traversal and escaping symlinks.
- Added Play, Pause and Stop. Stop rewinds the track and cancels a pending request. Starting another preview stops the previous one. Leaving the page stops playback and releases the temporary browser URL.
- Preview requests use the existing authenticated API client. HTML responses and missing audio produce a visible error.
- Renamed the unrelated tour eligibility control to Disable for tours / Enable for tours.
- No music files were added to Git. No CSP, Nginx or private upload policy was relaxed.

## Validation

- Backend: 293 passed, 0 failed.
- Website: 44 test files, 230 tests passed, 0 failed.
- Website production build passed. Final build: 4.19 seconds.
- Full tests ran on 0e4dd47. The final three-line import-view correction was rebuilt successfully on 646e28c.
- All 289 live music paths resolve inside the allowed folders.
- A real track decoded successfully and contained non-silent audio.
- The deployed controller was tested on a temporary loopback-only HTTP server using a real track: HTTP 206, audio/mpeg, bytes 0-15/3283382 and a valid audio header. The temporary server was closed after the test.
- The public music-preview and WhatsApp-contact endpoints still return HTTP 401 without sign-in.
- The public homepage points at the new assets; all referenced built JS/CSS assets match the files on disk. The homepage HTML contains normal additional server/edge markup, so whole-page byte comparison is not used.
- RentalHub health check passed after reloading workers 2 and 3. Other applications were not restarted.
- Physical-device speaker playback and an interactive Super Admin session were not tested. Playback controls are covered by browser-component tests and real audio transport/decoder checks.
- Existing build warnings about chunk sizes and an unused legacy MediaPipe branch remain; they were not hidden.

## Files

Changed: client/src/components/admin/WhatsappMarketingTab.jsx; client/src/pages/admin/TourMusicLibrary.jsx; controllers/propertyTourMusicController.js; routes/propertyTourMusic.js; services/whatsappMarketingService.js.

Added: client/src/components/admin/TourMusicPlayer.jsx; client/src/components/admin/TourMusicPlayer.test.jsx; config/utils/tourMusicPath.js; scripts/recoverWhatsappContacts.js; tests/services/tourMusicPreview.test.js; tests/services/whatsappContactRecovery.test.js; this report.

No schema migration, new environment variable or new APK was needed.

## Recovery and rollback evidence

Private server backup: /var/backups/rentalhub/music-whatsapp-recovery-2026-11-19. It contains the original WhatsApp tables, the old website build, original source revision and recovery result. The recovery is transactional, normalizes Nigerian numbers and skips existing numbers. Its default mode is a dry run; --apply is explicit. Source revision deployed: 646e28c. Existing hashed browser assets were retained so already-open pages can continue loading them.

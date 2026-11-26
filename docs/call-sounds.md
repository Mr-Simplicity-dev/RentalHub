# Incoming call sounds

Super Admin: dashboard **Call Settings**. Personal choice: **Profile > Call sounds** on web, **Settings > Call sounds** on mobile. Workers can opt into the spoken greeting. Normal is the default. No religion field is requested or inferred. Super Admin can disable all sounds, the greeting or caller ringback independently.

Settings use the existing app_settings and user_notification_preferences tables. No migration is required. Global changes require the existing Super Admin MFA guard and are audited. Per-user writes merge only incomingCallSound, preserving unrelated preferences. Ordinary notification updates also preserve this choice.

The foreground sound session is bounded by the call expiry, deduplicates the call id, stops on acceptance/rejection/end/missed/logout/unmount and discards late asynchronous players. The web offers Enable call sounds when autoplay is blocked. Preview buttons never create a call. Android foreground playback checks ringer volume, silent/vibrate mode, Do Not Disturb and the call notification channel. iOS playback does not opt out of silent mode.

Incoming call push alerts reuse Expo delivery with a TTL of at most 45 seconds and normal/greeting/silent channels. They do not create ordinary unread notifications. Tapping an alert or reconnecting checks the saved ringing call and recipient on the backend; expired/accepted/ended/another user's call cannot be recovered. Push recovery makes no signed-in request from the logged-out welcome screen. Foreground push sounds are suppressed to prevent double ringing.

Background/locked-phone alerts are short OS-managed notification sounds, not a new full-screen Telecom/CallKit calling service. Delivery depends on OS permission, network and battery settings. OS-managed sound already delivered to a closed app cannot be guaranteed to stop instantly when a different device answers. Foreground ringing stops immediately through call state. Do not promise guaranteed wake-up or a successful real-device test without one.

## Assets and mobile release

The three WAV files are locally generated. The greeting is synthesized with Microsoft Zira and should be previewed by the owner for pronunciation. No paid speech request is used. Existing repository rules exclude audio binaries from Git. Versioned SHA-256 manifests are tracked, while actual sound files are stored in local assets and on the server at `/call-sounds/`. Before an explicitly authorised Android/iOS build, run `npm run prepare:call-sounds` in RentalHubMobile. It validates assets, restores missing assets from the public server only when their hashes match, and prepares Android raw resources. It does not build an APK. iOS resource references include the bundled normal/greeting WAVs.

Mobile adds Expo SDK 55-compatible expo-audio. Android registers the small RentalHubCallSound native module. iOS requires the normal `pod install` on macOS before its next build. Existing installed APKs do not contain these assets or modules and need an explicitly authorised future release. Do not run an APK build as part of web/backend deployment.

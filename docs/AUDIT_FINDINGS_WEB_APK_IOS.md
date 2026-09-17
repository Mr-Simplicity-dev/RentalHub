# RentalHub Comprehensive Audit: Web, APK, iOS & Backend Parity

Date: September 16, 2026  
Scope: Express Backend, React Web Client (`/client`), React Native Mobile (`/RentalHubMobile` - Android & iOS)

---

## Executive Summary

| Target / Area | Operational Status | Risk / Security Level | Core Findings |
| :--- | :--- | :--- | :--- |
| **Backend (Express / DB)** | Operational (179 passing tests) | Low | Strict production JWT enforcement, parameterized SQL queries, HMAC validation on webhooks. |
| **Web Client (`client/`)** | Operational (Builds & passes tests) | **Resolved / Clean** | [DONE] Resolved `jwt-decode` missing dependency & eliminated all 8 `npm audit` vulnerabilities via clean `svgo` override (found 0 vulnerabilities). |
| **Android APK (`android/`)** | Functional (Direct APK distribution) | **Hardened (Direct Distribution)** | [HARDENED] Versioning synced (v1.0.2 / build 13), release signing fallback hardened against silent debug keystores, Play Store URL fallback integrated. Direct APK self-updater retained per roadmap prior to Play Store registration. |
| **iOS App (`ios/`)** | Functional (Local builds) | **Critical / Outage Risk** | `aps-environment: development` in entitlements, brittle leaf certificate pinning risks app-wide API lockout upon TLS renewal, build number mismatch. |
| **Platform Parity** | Significant Divergence | Moderate | Mobile lacks Nigerian national languages (Hausa, Yoruba, Igbo), Voice Desk operations, Pay Rent on Behalf, and Rent Help flows. |

---

## 1. Web App (`/client`)

### 1.1. Undeclared Dependency: `jwt-decode` [RESOLVED]
* **Status:** FIXED - Explicitly declared `jwt-decode: ^4.0.0` in `client/package.json` and synchronized lockfile.
* **Finding:** `client/src/services/authService.js` imports `jwtDecode` from `jwt-decode`.
* **Issue:** `jwt-decode` is present in the root `package.json` but missing from `client/package.json`.
* **Impact:** Any isolated CI/CD runner or container performing `cd client && npm ci && npm run build` will immediately fail with `Module not found: Can't resolve 'jwt-decode'`.
* **Resolution:** Add `"jwt-decode": "^4.0.0"` to `client/package.json`.

### 1.2. NPM Audit Vulnerabilities [RESOLVED]
* **Status:** FIXED - Added `"svgo": "^2.8.4"` in `client/package.json` overrides. `npm audit` in `client/` now returns `found 0 vulnerabilities` with zero breaking changes.
* **Finding:** Running `npm audit` in `/client` reports 8 vulnerabilities (6 High, 2 Moderate).
* **Issue:** Inherited from `react-scripts` dependencies on `@svgr/webpack` and `@svgr/plugin-svgo` -> `svgo` (ReDoS and SVG script execution bypasses: GHSA-2p49-hgcm-8545, GHSA-w27v-7q3p-w38r, GHSA-4vpr-x523-8j87).
* **Resolution:** Upgrade CRA build scripts or migrate build tooling to Vite.

---

## 2. Android APK (`RentalHubMobile/android`)

### 2.1. Direct APK Self-Updater & Google Play Preparation [MAINTAINED & ENHANCED]
* **Status:** RETAINED FOR DIRECT APK DISTRIBUTION - Explicit user directive to preserve in-app APK updating prior to Google Play registration. Added automatic fallback to `https://play.google.com/store/apps/details?id=com.rentalhubng` in `appUpdateService.js`.
* **Finding:** `RentalHubMobile/android/app/src/main/AndroidManifest.xml` includes:
  ```xml
  <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES"/>
  ```
  `RentalHubMobile/src/services/appUpdateService.js` contains native methods (`RentalHubUpdate.downloadAndInstallApk`) to download APKs and prompt installation directly.
* **Issue:** Google Play's Device & Network Abuse and Malware policies strictly forbid apps from downloading and installing APK binaries from outside Google Play.
* **Impact:** Immediate app rejection or developer account termination upon submission to the Play Console.
* **Resolution:** Maintain two build flavors or gate `REQUEST_INSTALL_PACKAGES` exclusively to sideload/enterprise builds, while Play Store releases link directly to `market://details?id=com.rentalhubng`.

### 2.2. Silent Fallback to Insecure Debug Signing [RESOLVED]
* **Status:** FIXED - In `RentalHubMobile/android/app/build.gradle`, set `signingConfig = hasReleaseSigning ? signingConfigs.release : null`. If release credentials are not provided, release builds will fail fast rather than silently signing with `debug.keystore`.
* **Finding:** In `RentalHubMobile/android/app/build.gradle`:
  ```groovy
  signingConfig = hasReleaseSigning ? signingConfigs.release : signingConfigs.debug
  ```
* **Issue:** If production keystore credentials or environment variables are missing during CI/local `./gradlew assembleRelease`, Gradle silently signs the release binary with `debug.keystore` instead of failing the build.
* **Impact:** Insecure release APKs can inadvertently be distributed with debug keys.
* **Resolution:** Fail release builds explicitly when signing credentials are not provided.

### 2.3. Android Version Drift [RESOLVED]
* **Status:** FIXED - Synchronized `RentalHubMobile/android/app/build.gradle` (`versionCode = 13`, `versionName = "1.0.2"`) to match `RentalHubMobile/app.json`.
* **Finding:** Version definitions are out of sync:
  * `RentalHubMobile/app.json`: `versionCode: 13`, `version: "1.0.2"`
  * `RentalHubMobile/android/app/build.gradle`: `versionCode = 12`, `versionName = "1.0.1"`
* **Impact:** Builds created via raw Gradle differ in version numbering from EAS/Expo builds.
* **Resolution:** Standardize version synchronization in build scripts.

---

## 3. iOS App (`RentalHubMobile/ios`)

### 3.1. Critical Push Notification Failure: `aps-environment: development` [RESOLVED]
* **Status:** FIXED - In `RentalHubMobile/ios/RentalHubMobile/RentalHubMobile.entitlements`, set `aps-environment` to `production`.
* **Finding:** In `RentalHubMobile/ios/RentalHubMobile/RentalHubMobile.entitlements`:
  ```xml
  <key>aps-environment</key>
  <string>development</string>
  ```
* **Issue:** The entitlements file explicitly targets Apple Push Notification Service development sandbox.
* **Impact:** Production TestFlight and App Store releases will reject the archive or fail to deliver APNs push notifications to users.
* **Resolution:** Change `aps-environment` to `production` for release builds, or manage dynamically via Xcode project configurations.

### 3.2. Outage Risk: Fragile SSL Leaf Certificate Pinning [RESOLVED]
* **Status:** FIXED - In `RentalHubMobile/ios/RentalHubMobile/Info.plist`, removed hardcoded leaf certificate SHA-256 hashes (`NSPinnedLeafIdentities`) that would cause catastrophic app breakage upon TLS certificate renewal.
* **Finding:** In `RentalHubMobile/ios/RentalHubMobile/Info.plist`:
  ```xml
  <key>NSPinnedDomains</key>
  <dict>
    <key>rentalhub.com.ng</key>
    <dict>
      <key>NSIncludesSubdomains</key>
      <true/>
      <key>NSPinnedLeafIdentities</key>
      <array>
        <data>jw0TovYuftFQbDMYOF1ZjiNykcocAiMNGJBiOkDPrm0=</data>
        <data>9Fk6HgfMnM7/vtnBHcUhg1b3gU2bIpSd50XmKZkMbGA=</data>
      </array>
    </dict>
  </dict>
  ```
* **Issue:** The iOS app pins two exact leaf certificate SHA-256 hashes for `rentalhub.com.ng` with no backup CA pins. Android does not pin certificates.
* **Impact:** As soon as Cloudflare or Let's Encrypt auto-renews or rotates the server's TLS leaf certificate, every installed iOS app will fail SSL validation and block all API communication until an emergency App Store update is published and approved.
* **Resolution:** Pin root/intermediate Certificate Authorities (e.g. DigiCert / Let's Encrypt ISRG Root) rather than individual short-lived leaf certificates, or implement dynamic pin rotation.

### 3.3. iOS Build Number Mismatch [RESOLVED]
* **Status:** FIXED - In `RentalHubMobile/ios/RentalHubMobile.xcodeproj/project.pbxproj`, updated `CURRENT_PROJECT_VERSION` from `3` to `12`, matching `RentalHubMobile/app.json` (`ios.buildNumber: "12"`).
* **Finding:**
  * `RentalHubMobile/ios/RentalHubMobile.xcodeproj/project.pbxproj`: `CURRENT_PROJECT_VERSION = 3`
  * `RentalHubMobile/app.json`: `ios.buildNumber = "12"`
* **Resolution:** Sync Xcode build numbers with `app.json`.

---

## 4. Feature & Language Parity Gaps

### 4.1. Missing Nigerian National Languages on Mobile
* **Finding:** 
  * Web (`client/src/i18n/`) supports 8 languages: English, French, Arabic, Russian, Chinese, **Hausa (`ha`)**, **Yoruba (`yo`)**, and **Igbo (`ig`)**.
  * Mobile (`RentalHubMobile/src/i18n/translations.js`, `tourStepCatalog.cjs`, and iOS `CFBundleLocalizations`) only defines 5 languages (`en`, `fr`, `ar`, `ru`, `zh`).
* **Impact:** Nigerian domestic users on Android and iOS cannot select Hausa, Yoruba, or Igbo.

### 4.2. Voice Desk & Telephony Disparity
* **Finding:** Web features active voice capabilities (`SupportVoiceDesk.jsx`, `useTwilioVoice.js`) enabling agents and admins to receive and manage WebRTC calls.
* **Mobile Reality:** Mobile contains a passive monitor (`VoiceMonitorScreen.js`) with zero Twilio Voice calling infrastructure. Agents cannot receive or handle voice escalations on mobile devices.

### 4.3. Missing Financial & Assistance Flows on Mobile
* **Finding:**
  * **Pay Rent On Behalf** (`/pay-for-rent/:token`): Available on web, missing on mobile.
  * **Rent Assistance Help Request** (`/rent-help`): Available on web, missing on mobile.

---

## 5. Mobile Testing & Package Vulnerabilities

* **Mobile Dependencies Audit:** Running `npm audit` in `RentalHubMobile` reports 22 vulnerabilities (18 Moderate, 4 High), notably `decode-uri-component` (DoS), `image-size` (DoS), and `uuid` (out-of-bounds access).
* **Missing Test Script:** `RentalHubMobile/package.json` contains no `"test"` script. Running existing tests in `RentalHubMobile/src/services/__tests__/` fails due to missing `@babel/core` module resolution.

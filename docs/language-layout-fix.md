# Stable layout while switching languages

The screenshots showed two competing direction states: the selected language changed immediately, but React Native kept the previously initialized native RTL direction. Welcome tried to compensate locally, leaving other screens and subsequent English selections mirrored.

The app now uses a stable LTR control layout for every language. Arabic keeps its reading direction and translated copy; language selection does not mirror branding, buttons, navigation or the Explore hint. The Explore instruction, pointer and navigation arrows stay in the same positions/orientations.

Changes:
- LanguageProvider applies a fixed layout root, separates text direction from layout direction and never enables native RTL on language selection.
- Android and iOS startup clear legacy persisted RTL and left/right-swap preferences before React creates screens.
- The language dropdown and Settings no longer ask users to restart after choosing a language.
- Rapid selections persist in order. Storage failures do not crash language initialization or prevent an in-session selection.
- Welcome removes native-direction compensation and locale-dependent navigation arrow flipping. The hint can wrap within the screen width.
- Tour text can read right-to-left, while its controls retain the same row order.
- Existing screens are not keyed/remounted when the language changes, preserving their component state.

Verification:
- npm run test:language exercises all eight locales, English/Arabic round trips, both initial native direction states, rapid changes and storage failures. It compares the Explore controls, yellow hint styles and arrow orientations while checking translated text.
- Native startup order is checked against the installed React Native APIs.
- The test is included in the backend regression suite when the mobile checkout and its test dependencies are available.
- Tour and typography contract checks passed.

Release requires new Android and iOS binaries because the repair includes native startup changes. Installing the updated app clears the old mirrored direction automatically; users do not need to clear app data or log out. JavaScript exports are bundling checks, not signed binaries or physical-device testing. iOS compilation and device walkthroughs require the normal release environment.

Final verification: all 495 backend tests passed. Android and iOS JavaScript exports passed. Native tour and typography checks passed.

# Tour System Checklist

Last Updated: August 2026

---

## Core System (COMPLETE)

- [x] **TourContext** (`client/src/context/TourContext.jsx`) — State management, event tracking, resume logic, 14 event types, server-backed persistence, version migration, 7-day inactivity threshold
- [x] **useTour hook** (`client/src/hooks/useTour.js`) — Access tour state from any component
- [x] **TourProvider** — Wraps app in `App.jsx` (line 931)
- [x] **TourManager** (`client/src/components/tour/TourManager.jsx`) — Welcomes user, tracks session, renders `WelcomeModal` then `TourOverlay`
- [x] **WelcomeModal** (`client/src/components/tour/WelcomeModal.jsx`) — Branded intro with benefits, role-aware new/returning/resume flow
- [x] **TourOverlay** (`client/src/components/tour/TourOverlay.jsx`) — Spotlight highlight, smart positioning, progress bar, step counter, keyboard navigation, screen reader support, `advanceOn` auto-advance, action steps
- [x] **tourConfig** (`client/src/config/tourConfig.js`) — 21+ dashboard role configurations with targets, steps, icons, actions, action hints
- [x] **Workflow tours** (`client/src/config/tourWorkflows.js`) — 6 guided workflow tours for profile-based discovery

---

## Per Dashboard Integration (COMPLETE)

All dashboard components have their required CSS classes / `data-tour-id` attributes:

| Dashboard                | Component File                                      | Selectors Verified |
|--------------------------|-----------------------------------------------------|---------------------|
| Tenant                   | `client/src/pages/Dashboard.jsx`                    | 8 of 8              |
| Landlord                 | `client/src/pages/Dashboard.jsx`                    | 8 of 8              |
| Agent                    | `client/src/pages/agent/AgentDashboard.jsx`         | 4 of 4              |
| Lawyer                   | `client/src/pages/lawyer/LawyerDashboard.jsx`       | 4 of 4              |
| Admin                    | `client/src/pages/admin/AdminDashboard.jsx`         | 5 of 5              |
| Financial Admin          | `client/src/pages/admin/FinancialAdminDashboard.jsx`| 4 of 4              |
| LGA Financial Admin      | `client/src/pages/admin/FinancialAdminDashboard.jsx`| 3 of 3              |
| State Admin              | `client/src/pages/admin/StateAdminDashboard.jsx`    | 4 of 4              |
| Super Admin              | `client/src/pages/SuperAdminDashboard.jsx`          | 5 of 5              |
| Super Financial Admin    | `client/src/pages/admin/SuperFinancialAdminDashboard.jsx` | 4 of 4         |
| Transportation Admin     | `client/src/pages/admin/TransportationAdminDashboard.jsx` | 4 of 4        |
| State Transportation     | `client/src/pages/admin/TransportationAdminStateDashboard.jsx` | 4 of 4 |
| Super Transportation     | `client/src/pages/admin/TransportationSuperAdminDashboard.jsx` | 4 of 4 |
| Fumigation Admin         | `client/src/components/fumigation/FumigationCleaningAdmin.jsx` | 4 of 4 |
| Super Fumigation         | `client/src/components/admin/FumigationOversightPanel.jsx` | 4 of 4   |
| Recruitment Admin        | `client/src/pages/admin/RecruitmentAdminDashboard.jsx` | 3 of 3          |
| LGA Support Admin        | `client/src/pages/admin/LgaSupportAdminDashboard.jsx` | 3 of 3          |
| State Support Admin      | `client/src/pages/admin/StateSupportAdminDashboard.jsx` | 3 of 3        |
| Super Support Admin      | `client/src/pages/admin/SuperSupportAdminDashboard.jsx` | 4 of 4       |

---

## Mobile Tour System (COMPLETE)

- [x] **Mobile TourContext** (`RentalHubMobile/src/context/TourContext.js`) — 916 lines, state management, event tracking, resume logic
- [x] **NativeTourManager** (`RentalHubMobile/src/components/tour/NativeTourManager.js`) — Welcome modal + coach mark overlay in a single component
- [x] **TourTarget** (`RentalHubMobile/src/components/tour/TourTarget.js`) — View registration for tour step targeting
- [x] **TourNavigationBridge** (`RentalHubMobile/src/components/tour/TourNavigationBridge.js`) — Handles navigation to correct screen before measuring targets
- [x] **TourScrollContext** (`RentalHubMobile/src/components/tour/TourScrollContext.js`) — Scrolls to reveal off-screen targets
- [x] **Mobile tourConfig** (`RentalHubMobile/src/config/tourConfig.js`) — 14 role-based step sets with icons (Ionicons), actions, destinations
- [x] **Tour service** (`RentalHubMobile/src/services/tourService.js`) — Backend API for tour state/events
- [x] **55 tour step IDs** — All registered via `TourTarget` or `useTourTarget` in their respective screens
- [x] **17 navigation destinations** — All exist in AppNavigator
- [x] **34 Ionicons** — All valid and available

---

## i18n / Multilingual (COMPLETE)

- [x] **Web** — `tourTranslations.js` (395 lines) with `tour.ui.*`, `tour.welcome.*`, `tour.welcomeNamed`, `tour.welcomeDefault`, `tour.welcomeText`, `tour.resumeText`, `tour.duration`, `tour.openControl`, `tour.focusedLabel`, `tour.missing`, `tour.stepCount`, `tour.guidedWalkthrough`, `tour.openControlHint`, `tour.openingControl`, `tour.progressLabel` and dynamic step titles/descriptions for all 5 languages
- [x] **Mobile catalog.cjs** — 61 `tour.*` UI keys per language
- [x] **Mobile tourStepCatalog.cjs** — Step titles + descriptions for all 55 step IDs across 5 languages
- [x] **Mobile translations.js** — Alternative translations module with all tour keys
- [x] **Available locales:** English (en), French (fr), Arabic (ar), Russian (ru), Chinese (zh)
- [x] **i18n.js integration** — tourTranslations merged into i18next resource bundle

---

## Optional Enhancements (Status)

| Enhancement                         | Status           |
|-------------------------------------|------------------|
| Replay Tour (Profile/Settings page) | **DONE**         |
| Backend API for tour state/events   | **DONE**         |
| Tour analytics dashboard            | **DONE**         |
| Resume support (cross-session)      | **DONE**         |
| Multilingual (5 languages)          | **DONE**         |
| Screen reader accessibility         | **DONE**         |
| RTL support (Arabic)                | **DONE**         |
| Admin panel for tour content        | Not implemented   |
| Video/image in tour steps           | Not implemented   |
| Tour skip survey                    | Not implemented   |
| A/B testing for tour flows          | Not implemented   |

---

## Test Coverage

- [x] `tests/tourSystemCoverage.test.js` (203 lines) — Web target registration coverage
- [x] `tests/tourEngagement.test.js` (509 lines) — Backend analytics event handling
- [x] `tests/webTourRuntimeTranslations.test.js` — Runtime translation testing
- [x] `RentalHubMobile/scripts/verify-tour-system.cjs` — Mobile tour system verification (55 step IDs, 5 locales, 14 event types, screen registration, icon validation, PII sanitization, Android RTL, iOS locale declaration, Babel transforms)

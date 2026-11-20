# Survey, screen-route and security audit — 20 November 2026

The screen was checked against its server route before the remaining changes. No new survey tables or migrations are needed.

## Survey and analysis

- Public draft saves previously stored answers without the respondent’s contact and location fields. Drafts now save name, phone, email/no-email choice, residence and state of origin, and restore them when resumed.
- Account-linked responses use actual saved account details where their old survey contact columns are empty. Origin is never guessed.
- Anonymous historical partial responses cannot be repaired with information that was never collected. They show “Not provided yet”. Public-link entries without an agent show “Self-service”; an agent LGA does not apply to those entries.
- Responses have pagination, saved-answer counts and clear partial/completed states on web and native administration screens.
- Reporting excludes superseded responses. Partial responses are counted separately and do not distort completed-answer statistics. Empty NPS answers are not treated as zero scores.
- The mobile public survey saves and restores drafts using a protected resume token in the phone keychain. Contact data is not copied into ordinary phone storage.
- Only an authenticated marketing agent can use agent-specific exceptions. Typing an agent name cannot bypass the public survey gate. Administrative survey routes require the existing privileged verification.

## Other completed corrections

- Music uses one native player. Stop sits beside it. Private tracks retain authorized streaming and authenticated fallback; other tracks stop when one starts.
- Entering an approval note enables the review action. Missing identity evidence gives a clear explanation and an existing revalidation-request action; it is not approved merely because a note was entered.
- Mobile Users now exposes individual identity approval, verification reminders, and notes for delete/promotion actions. Unsupported bulk actions were removed from that menu.
- Identity approval locks and updates the record with its audit entries in one database transaction. A failure to save its audit entries rolls it back. An optional post-commit photo-index failure no longer reports an already committed approval as failed.
- Fumigation and transportation mobile calls now match server methods, paths and payload field names. The published damage-report link was corrected.
- Private service summaries enforce ownership, actual assignment or the relevant administrative scope. Name matching or a short phone suffix cannot grant access; phone-based fallback requires a verified complete phone number.
- Native service tracking uses real summaries and registered navigation routes. Prototype random movement and stock completion evidence were removed from unused field consoles. No fake GPS, reviews, licence or safe-entry confirmation is presented as measured evidence.
- Recruitment and conduct ZIP creation supports the installed archive library. Directory downloads are tested too.

## Checks and evidence

- Full backend suite: 311 passed, 0 failed. A further ZIP-directory test passed, bringing the checked backend cases to 312.
- Full web suite: 45 files, 233 passed, 0 failed.
- Focused native parity/public-survey tests: 5 passed. Build compatibility: 2 passed.
- Native registration, support, landlord survey progress and tour checks passed. Tour coverage: 87 steps, 8 locales and 32 roles.
- Static contract scan: 675 production files; 1,097 backend routes; 1,611 fixed API calls; 173 native screens; 242 native navigation calls; 141 web routes; 546 web links. Zero parse errors, missing imports, unmatched fixed API paths, unmatched native navigation or unmatched web links. There are 34 dynamic calls; these need contextual review and are not proved by the static scan.
- Production web build passed. Existing large-chunk and unused MediaPipe-runtime export warnings remain; the live-face implementation explicitly uses the tested TFJS runtime.
- Android and iOS release-mode JavaScript bundles both passed (about 7.8 MB each). This is not a signed APK/IPA or a device-install test.
- Reviewed backend and mobile production dependency scans: zero reported advisories. Compatible Metro and query-string patches are versioned and tested with a real PNG asset and Unicode navigation parameters.
- Tests ran in an isolated server folder with a mock database. No customer was approved, contacted or altered by running them.

## Main implementation files

Backend: `services/surveyService.js`, `services/surveyAnalysisService.js`, `config/utils/surveyContact.js`, `routes/adminSurvey.js`, `services/superAdmin/verificationService.js`, `services/superAdmin/schemaHelpers.js`, `services/superAdmin/userService.js`, `services/superAdmin/bulkActionService.js`, `services/adminService.js`, `config/utils/serviceTrackingAccess.js`, `config/middleware/auth.js`, `services/fumigationTrackingService.js`, `services/transportationTrackingService.js`, `routes/serviceTracking.js`, `routes/transportationDriver.js`, `routes/fumigationTeam.js`, `routes/fumigationCleaning.js`, `config/utils/archiveFactory.js`, `routes/adminConduct.js`, `services/recruitmentService.js`, `scripts/checkMobileApiContracts.js`, package manifests/locks.

Web: `client/src/components/admin/SurveyAdminPanel.jsx`, `client/src/components/survey/SurveyWizard.jsx`, `client/src/components/admin/TourMusicPlayer.jsx`, `client/src/components/admin/UsersTab.jsx`, `client/src/pages/SuperAdminDashboard.jsx`, `client/src/components/damage/DamageReportCard.jsx` and corresponding tests.

Native: `src/screens/shared/PublicSurveyScreen.js`, `src/services/surveyDraftStorage.js`, `src/services/surveyService.js`, `src/services/surveyAnalyticsService.js`, `src/screens/admin/SurveyAnalyticsScreen.js`, `src/screens/admin/SuperAdminDashboardScreen.js`, `src/screens/admin/AdminUserDetailScreen.js`, `src/services/adminService.js`, `src/services/superAdminService.js`, `src/utils/identityReview.cjs`, tracking services/screens, `src/components/common/ServiceTrackingDetail.js`, `src/navigation/AppNavigator.js`, `src/i18n/interfaceCopy.json`, contract/test scripts and versioned build patches.

## Release boundaries

No new migration, environment variable or paid provider is required. The published APK remains v1.0.67/build 78 until a separate signed mobile release is built and published. iOS source shares these corrections, but a production IPA needs the signing/Xcode environment. Static checks and passing tests are evidence for the paths covered, not a promise that every possible project bug has been found.
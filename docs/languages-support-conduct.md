# Career languages, support matching and electronic Code of Conduct

Date: 12 November 2026.

## What is ready

Deployed on 12 November 2026. Database migrations 2045, 2046 and 2047 are applied. Android v1.0.61 build 72 is published. iOS source is updated; a signed IPA still needs a Mac and Apple signing.

### Career applications

1. Every volunteer opportunity, including the eight existing positions and future volunteer roles, uses the language requirement.
2. Employment opportunities whose stored role title contains “support” use the same requirement. Other employment opportunities keep their existing requirements.
3. Applicants must choose 2–5 different languages. Nigerian Pidgin is required and counts as one of the five.
4. Every choice needs a speaking/understanding (or signing) level and a reading/writing level. Reading/writing can honestly be “Not yet”.
5. The continuation button stays disabled until the selections are complete. The server validates them again using the stored opportunity, not a claimed opportunity type in the request.
6. Language skills are saved on the existing recruitment application. Recruitment can see that the levels are self-reported. Applying does not create a staff account or approve language skills.
7. Volunteer applications still cost zero and do not initialise Paystack. Employment fees still come from the stored role.

The searchable catalogue contains 585 entries. It is a local snapshot of [Glottolog’s Nigeria catalogue](https://glottolog.org/glottolog/language.map.html?country=NG), retrieved on 11 November 2026, with English, Nigerian Pidgin and Nigerian Sign Language included. Attribution and source details are stored in the catalogue JSON. No online translation account or paid AI is needed for matching. Language classifications and names may need later updates; this is a dated catalogue, not a promise that no language or local name is missing.

### Support matching and responsibility

1. The contact form asks the customer which language to use. Existing clients that omit this field remain accepted.
2. Staff submit their own language profile. A Super Support Admin or Super Admin records an assessment and approves or rejects each language. Staff cannot approve themselves. Changing a profile sends its skills for assessment again.
3. Text support matching requires approved conversational/fluent speaking/understanding and reading/writing levels in the chosen language.
4. Matching keeps LGA → State → Super Support priority, current account restrictions, geography and the existing least-loaded approach. The agent must have marked themselves available. The normal buttons offer one hour of availability or an immediate break; availability expires.
5. If no suitable agent is available, the request stays saved and unassigned. Senior support is alerted. The monitor can assign it later when an eligible agent becomes available.
6. The customer’s selected language is shown in staff ticket cards. Manual assignment also checks approved language ability and availability for tickets with a selected language.
7. An agent who was not assigned a request is not automatically blamed for it.

The web language desk is in the existing admin layout. The shared mobile source adds it under More Tools for support staff. Applicant languages are not automatically copied into a privileged staff role; appointment and assessment remain separate decisions.

### Waiting-time monitor

The existing job now uses one language-aware response monitor. Its old entry points delegate to the same implementation. Database locks coordinate server workers rather than relying on a particular PM2 process number.

Default behaviour:

- Check roughly every 20 seconds.
- Record an assigned request waiting 90 seconds for a first reply or a later customer reply.
- Recent typing gives a short grace period, but cannot postpone attention indefinitely. With the defaults, typing protection ends after 210 seconds of waiting.
- Reuse existing SUPPORT_REASSIGN_AFTER_SECONDS, SUPPORT_TYPING_GRACE_SECONDS, SUPPORT_MAX_HANDOVERS and SUPPORT_REASSIGN_TICK_SECONDS settings where configured.
- Normally allow two automatic handovers, then leave the matter for senior review instead of endlessly moving it.
- Record misses in the database and notify the replacement agent and senior support through the existing notification system.
- Keep department specialists’ escalated work outside this rapid support reassignment sweep. Existing longer service deadlines remain in place.
- Let a different senior officer record a valid reason or a need for follow-up. There is no automatic punishment.

Availability is a staff declaration, not proof that their phone or network was working. A late reply is a review flag, not proof of deliberate misconduct. Real phone push delivery and launcher badge presentation were not field-tested in this task.

### Optional ₦5,000 electronic submission

Web page: `/admin/code-of-conduct`. Shared mobile entry: More Tools → Code of Conduct.

1. The 24 private role PDFs cover 26 current admin role identifiers. Legacy `admin` uses the canonical LGA document. Super Admin is not a signing role; Super Admin can adopt documents and review submissions.
2. Documents start inactive. Super Admin must read and adopt the exact version before it is offered to workers.
3. An admin downloads the approved document, accepts the signing statement and types their account full name. The server saves the document hash, signing statement and time.
4. Only then can the admin start the optional ₦5,000 checkout. The server fixes the amount at 500,000 kobo and NGN. A request cannot set its own price or mark itself paid.
5. Server verification checks Paystack’s status, reference, currency, amount and saved payer email. A paid submission then enters Recruitment’s existing administrative environment through the new conduct queue.
6. Checkout references are reused, and a background reconciliation job checks pending payments. A lost connection does not deliberately create another fee. A user can also select “Already paid? Check payment”.
7. Recruitment can read the protected signed pack and accept or return it with a note. Self-review is blocked. A returned document can be signed again under the same paid submission; earlier signature evidence is retained and the fee is not charged again.
8. Downloads include the original approved PDF plus a linked electronic-signature/payment record in a ZIP, and a separate PDF signature record/receipt. This is typed-name signing; it does not add a drawn signature image to the original blank signature line.
9. Printing and delivering the document physically remains free. This service does not impose payment on that path.

The owner explicitly approved v1.5 on 12 November 2026. All 26 admin role documents are active, excluding Super Admin. No staff signature was created for anyone. Each staff member must read and sign personally.

## Security

- New staff endpoints require authentication, the existing privileged authenticator check, role checks and a prohibition on impersonated actions.
- Staff writes are rate-limited, parameterised and audited.
- Skill approval and its assessment note are saved together. A reviewer cannot approve their own skills or review their own missed-response record.
- Conduct files live under `private/admin-conduct`, outside public downloads. Role/ownership checks protect downloads, signatures, receipts and review.
- Conduct document hashes are verified before adoption and download. Payment and signing evidence are stored separately from client claims.
- Existing recruitment Turnstile, validation, document upload and employment-payment routes remain in place.
- No new account privileges are created by a Career application, language choice, signature or payment.

## Database changes

- `2045_support_language_matching.sql`: recruitment application language skills, ticket preferred language/wait tracking, agent availability, assessed staff languages, assessment history and persistent missed-response review records.
- `2046_admin_conduct_submission.sql`: versioned/inactive conduct documents, private PDF hashes, electronic signature/payment submissions and prior-signature history. A partial unique index allows only one active document version per role.
- Old employment records keep their existing classification and fees. Existing applications receive an empty language list; this migration does not rewrite their history or automatically approve skills.
- No migration already applied to production was edited.

## API additions

Public: `GET /api/support-languages/catalog`.

Staff language desk:

- `GET/PUT /api/support-languages/profile`
- `PUT /api/support-languages/availability`
- `GET/POST /api/support-languages/review`
- `GET /api/support-languages/monitor`
- `POST /api/support-languages/monitor/:id/review`

Conduct service, all authenticated and role checked:

- `GET /api/admin-conduct/mine`
- `GET /api/admin-conduct/documents` (Super Admin)
- `POST /api/admin-conduct/documents/:id/adopt` (Super Admin)
- `GET /api/admin-conduct/documents/:id/download`
- `POST /api/admin-conduct/sign`
- `POST /api/admin-conduct/:id/pay`
- `POST /api/admin-conduct/:id/verify`
- `GET /api/admin-conduct/queue`
- `POST /api/admin-conduct/:id/review`
- `GET /api/admin-conduct/:id/receipt`
- `GET /api/admin-conduct/:id/signed-copy`

Existing `/api/recruitment/apply` accepts validated `language_skills`. Existing contact/ticket creation accepts `preferred_language`. Scoped manual assignment validates a requested language match.

## Checks and limits

- Full backend: **152 passed, 0 failed**.
- Full web: **159 passed, 0 failed**.
- Seven background-job tests passed, including worker takeover and overlapping-job protection.
- Local and VPS web production builds passed. Optional analytics configuration and chunk-size warnings remain.
- Signed Android APK build passed; package and signing certificate match the existing app.
- Public APK download verified byte-for-byte by SHA-256.
- Migrations 2045–2047 applied after a database and source backup.
- All 48 pages of the v1.5 role forms were rendered and visually checked.
- Live worker takeover test: worker 2 to worker 3; one scheduler lock; website health 200.
- No real payment, applicant or support complaint was created for testing.

## Remaining setup

1. Staff must submit language profiles, obtain assessment and mark themselves available.
2. WhatsApp property-match delivery is waiting for an approved Meta template name and language. The business name remains Amana RentalHub NG.
3. iOS needs a signed release from a Mac. Updated shared source alone does not update installed iPhones.
4. Check payment and notification behaviour on real devices. Daily and weekly money-moving jobs were registered, not forced to run early.
5. No new environment variables are required for job leadership. Conduct payments use existing Paystack configuration.

See job-scheduler-audit.md and releases/1.0.61.md for deployment evidence.

## Exact source files

Web/backend root: `D:/New folder/tenant site`.

Changed:
- `server.js`
- `jobs/supportReassignJobs.js`
- `routes/support.js`
- `services/recruitmentService.js`
- `services/supportReassignService.js`
- `client/src/pages/App.jsx`
- `client/src/pages/Careers.jsx`
- `client/src/pages/Careers.volunteers.test.jsx`
- `client/src/i18n.js`
- `client/src/pages/admin/AdminLayout.jsx`
- `client/src/pages/admin/RecruitmentAdminDashboard.jsx`
- `client/src/components/admin/RecruitmentAdminTab.jsx`
- `client/src/components/admin/SupportTicketWorkspace.jsx`
- `client/src/components/common/FloatingContactWidget.jsx`

New:
- `config/utils/languagePolicy.js`
- `config/utils/nigerianLanguages.json`
- `services/supportLanguageService.js`
- `services/supportResponseMonitor.js`
- `services/conductPaymentService.js`
- `routes/supportLanguages.js`
- `routes/adminConduct.js`
- `migrations/2045_support_language_matching.sql`
- `migrations/2046_admin_conduct_submission.sql`
- `client/src/data/languagePolicy.js`
- `client/src/data/nigerianLanguages.json`
- `client/src/components/common/LanguageSkillsField.jsx`
- `client/src/components/common/LanguageSkillsField.test.jsx`
- `client/src/components/admin/SupportLanguageDesk.jsx`
- `client/src/pages/admin/AdminConduct.jsx`
- `client/src/i18n/languageSkillsTranslations.js`
- `tests/services/supportLanguages.test.js`
- `docs/languages-support-conduct.md` (this report)

New private PDF files:
- `private/admin-conduct/Code_of_Conduct_financial_admin.pdf`
- `private/admin-conduct/Code_of_Conduct_lawyer.pdf`
- `private/admin-conduct/Code_of_Conduct_lga_admin.pdf`
- `private/admin-conduct/Code_of_Conduct_lga_financial_admin.pdf`
- `private/admin-conduct/Code_of_Conduct_lga_fumigation_admin.pdf`
- `private/admin-conduct/Code_of_Conduct_lga_support_admin.pdf`
- `private/admin-conduct/Code_of_Conduct_lga_transportation_admin.pdf`
- `private/admin-conduct/Code_of_Conduct_recruitment_admin.pdf`
- `private/admin-conduct/Code_of_Conduct_state_admin.pdf`
- `private/admin-conduct/Code_of_Conduct_state_financial_admin.pdf`
- `private/admin-conduct/Code_of_Conduct_state_fumigation_admin.pdf`
- `private/admin-conduct/Code_of_Conduct_state_lawyer.pdf`
- `private/admin-conduct/Code_of_Conduct_state_support_admin.pdf`
- `private/admin-conduct/Code_of_Conduct_state_transportation_admin.pdf`
- `private/admin-conduct/Code_of_Conduct_super_financial_admin.pdf`
- `private/admin-conduct/Code_of_Conduct_super_fumigation_admin.pdf`
- `private/admin-conduct/Code_of_Conduct_super_lawyer.pdf`
- `private/admin-conduct/Code_of_Conduct_super_support_admin.pdf`
- `private/admin-conduct/Code_of_Conduct_super_transportation_admin.pdf`
- `private/admin-conduct/Code_of_Conduct_zonal_admin.pdf`
- `private/admin-conduct/Code_of_Conduct_zonal_financial_admin.pdf`
- `private/admin-conduct/Code_of_Conduct_zonal_fumigation_admin.pdf`
- `private/admin-conduct/Code_of_Conduct_zonal_lawyer.pdf`
- `private/admin-conduct/Code_of_Conduct_zonal_transportation_admin.pdf`

Mobile root: `D:/New folder/tenant site/RentalHubMobile`.

Changed:
- `src/navigation/AppNavigator.js`
- `src/screens/shared/CareersScreen.js`
- `src/screens/shared/ContactWidgetScreen.js`
- `src/screens/shared/NativeToolsScreen.js`
- `src/screens/service-admin/SupportTicketsScreen.js`
- `src/i18n/interfaceCopy.json`

New:
- `src/data/nigerianLanguages.json`
- `src/data/languagePolicy.cjs`
- `src/components/common/LanguageSkillsField.js`
- `src/screens/shared/AdminConductScreen.js`
- `src/screens/shared/SupportLanguageScreen.js`

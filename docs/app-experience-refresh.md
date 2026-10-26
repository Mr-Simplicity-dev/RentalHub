# App experience refresh

## Changes
- Tours advance to version 5. The native catalogue includes 76 steps in eight languages, with selectable journeys covering Wallet, separate Disputes and Property Reports, paid coverage assistance, public Careers/free volunteering and anonymized resolved cases.
- Inter remains the shared typeface. Native shared text has a 13px minimum and readable line heights; text inputs use at least 16px and 44px touch height with accessibility scaling retained. Web assistant text, helper text and controls receive matching readability improvements.
- Both support widgets start with the shared assistant. General questions use the public assistant endpoint; authenticated account questions use owner-scoped account lookups. Human assistance remains available explicitly, and a reviewable form carries the problem context forward. Opening a handoff does not send a ticket automatically.

## AI and privacy
The existing Anthropic integration is reused. POST /api/support/assistant/public supplies general guidance without private account access. The existing authenticated POST /api/support/assistant retains authorization and rate limiting. The model has no action tools or database write access. Account identity and ticket draft flows bypass generation. Bounded user history and account guidance context are redacted before generation. Verified account facts are supplied by existing queries; model guidance cannot replace those records.

The provider request has a timeout and rejects incomplete or unsafe output. Missing credentials or provider errors fall back to guided troubleshooting, without presenting it as AI-generated content. Tickets still use the existing authorized submission endpoint after user review.

## Configuration and deployment
No new database migration is required for this refresh. Deploy the backend and rebuilt web client together, then build and distribute new Android and iOS releases. Existing installed binaries retain their old interface.

The server requires its existing ANTHROPIC_API_KEY for live AI. Optional settings documented in .env.example are SUPPORT_AI_ENABLED (default true), SUPPORT_AI_MODEL (default claude-haiku-5-5), and SUPPORT_AI_API_VERSION (default 2026-10-21). Do not expose the provider key to browser or mobile bundles. Provider availability and billing must be configured on the deployment server.

Earlier WhatsApp property-alert changes have separate migration/template requirements described in property-request-whatsapp-deployment.md; the on-site widgets are separate from the WhatsApp messaging webhook.

## Verification
- Backend suite: npm test from the server project.
- Web suite/build: npm --prefix client test -- --run; npm --prefix client run build.
- Native contracts: test:tour, test:typography, verify-account-assistant.cjs, verify-support-centre.cjs.
- Android and iOS JavaScript exports completed successfully. These exports do not constitute signed APK/IPA releases or device visual testing.
- Browser checks at 320, 375, 390, 768, 1024 and 1440px verified panel bounds, no horizontal overflow, visible 16px inputs, loaded Inter fonts and no page errors using mocked API responses.
- Synthetic live-provider checks confirmed a complete AI response without sending customer data.

The web build retains its existing large-chunk warning. Shared typography was audited across native components; every screen was not individually rendered on physical devices.

Final results: 491/491 backend tests and 43/43 web tests passed. The production web build passed. Native tour, typography, assistant and support-centre contracts passed. Android/iOS exports passed. One web test timed out while checks competed for resources; the unchanged full web suite passed when rerun separately.

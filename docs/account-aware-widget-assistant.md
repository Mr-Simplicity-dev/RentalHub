# Account-aware widget assistant

The WhatsApp-style website widget is a local FAQ chat, not the Meta WhatsApp webhook. Its existing human-support button opens wa.me. The actual WhatsApp webhook still only acknowledges incoming events. This change does not send account records or login sessions into WhatsApp. Handoff URLs exclude query strings and fragments.

## Account answers

POST /api/support/assistant uses the existing authenticate middleware, a dedicated Redis-backed rate limit (30 requests per minute), validation and Cache-Control: no-store. Only signed-in tenant and landlord roles can use it. The user ID and role always come from authenticated server context, never the request body. SQL queries are fixed, parameterized and owner-scoped. No arbitrary SQL, model-generated commands or privileged actions are supported.

Supported facts: profile, verification, subscription, wallet ledger balance, withdrawals, payments and payment-reference lookup, refunds, assistance coverage, property listings/applications, rent savings, transportation/cleaning bookings, personal disputes and support tickets. Lists show the five most recent records; count questions use the full matching record count. A property application is not represented as an established tenancy. Ledger balance is not a promise of withdrawal eligibility. No passwords, NIN/BVN, passport files, security codes, bank details, admin notes or other users' accounts are exposed.

This extends the existing rule-based assistant; it does not introduce an unrestricted language model. Unsupported questions and unavailable databases produce honest fallback/support guidance. Status records do not imply an unrecorded reason or guaranteed completion date. Public FAQ responses remain available to guests and during private-service outages. Signed-in account and property-listing guidance points to the user's dashboard rather than registration.

## Ticket flow

A user can type Create a ticket followed by their problem, or select Create a ticket and answer the details prompt. The assistant prepares a draft using the verified account location and an existing support category. The Submit ticket card calls the unchanged POST /api/support/tickets endpoint. Existing support assignment, timelines, notifications and admin review remain authoritative. No ticket is claimed until that API returns a saved ticket ID. Duplicate clicks are blocked. An uncertain submission directs the user to check existing tickets rather than blindly retry.

## Privacy and mobile

Both the web widget and shared Android/iOS WhatsAppBotScreen use the same endpoint. Conversation records stay in component memory, are filtered by current identity and cleared when the account changes. Late responses from a previous identity are discarded. Native cards open existing in-app screens; web cards retain the existing link-card format. Guests receive sign-in or registration cards.

## Deployment

No migration, new environment variable, external AI provider or new dependency is required. Deploy backend and client together, restart the existing server process, and build/release the mobile app for Android and iOS. Existing mobile binaries will retain their old FAQ behavior until updated.

## Verification

Backend: node --test tests/accountAssistant.test.js (31 tests); npm test (444 passed).
Web: npm test (39 passed); npm run build.
Mobile: node scripts/verify-account-assistant.cjs, npm run test:typography, and Expo exports for Android and iOS.

No live deployment or real user ticket submission was performed during development. Tests use controlled fixtures and existing regression coverage; production database connectivity still needs normal deployment smoke checks.

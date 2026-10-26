# Property-request notifications: deployment and Meta setup

This change implements consented utility updates for a specific property request. It does not automatically obtain Meta template approval, verify live credentials, or certify unrelated marketing campaigns. No live messages were sent during development.

## Required deployment order

1. Create and obtain approval for the utility template below in WhatsApp Manager. Use the exact five body parameters, no header, and the configured language. Meta decides approval and final category; if it is paused, rejected or unavailable the queue will not fall back to free-form messages.
2. Configure the existing Meta credentials, phone-number ID, app secret and webhook verify token. Set the template name, language and an explicitly supported Graph API version from your Meta app's current API setup. Do not copy the version used only by test fixtures.
3. Apply migration 2029_property_request_delivery_policy.sql using the existing migration runner before starting the updated server. Existing requests and paid requests default to WhatsApp opt-in FALSE; email remains available. Existing notified/fulfilled data is preserved and is not automatically resent.
4. Deploy backend and frontend, restart the existing PM2 process with updated environment, then build/release Android and iOS. New and old mobile clients remain able to create email-only requests; the new checkbox is needed to record WhatsApp consent.
5. Register the HTTPS webhook URL /api/whatsapp/webhook in Meta and subscribe to message events. The endpoint handles GET verification and POST receipts/STOP events. The configured phone-number ID must match webhook metadata. Missing app secret blocks POST processing; failed persistence returns 503 so Meta can retry.

Server commands after reviewing the release and configuring the environment:

    npm run migrate:dry-run
    npm run migrate
    npm --prefix client run build
    pm2 restart rentalhub --update-env

The migration runner may also have other pending migrations; review dry-run output. No migration has been executed on the live database by this task.

## Environment

Existing required credentials:

    WHATSAPP_PROVIDER=meta
    WHATSAPP_META_TOKEN=<existing sender token>
    WHATSAPP_PHONE_NUMBER_ID=<sender phone-number ID>
    WHATSAPP_APP_SECRET=<Meta app secret>
    WHATSAPP_VERIFY_TOKEN=<private webhook verification token>

Property-update settings:

    WHATSAPP_PROPERTY_MATCH_TEMPLATE=<approved template name>
    WHATSAPP_PROPERTY_MATCH_LANGUAGE=en
    WHATSAPP_GRAPH_API_VERSION=<currently supported version from Meta API setup>

The language must exactly match the approved template language. Use a supported version in vNN.N format. Property WhatsApp jobs remain blocked while required settings are absent. Email processing is independent. Do not commit real credentials.

## Proposed utility template for Meta review

Suggested name: rentalhub_property_request_update
Category requested: Utility
Language: English (en), or the exact language configured above
Header: none
Body:

Hello {{1}}, here is an update on the property request you submitted to Amana RentalHub NG.
{{2}}
Location: {{3}}
{{4}}
View your update: {{5}}
For help, contact support@rentalhub.com.ng or visit https://rentalhub.com.ng/support.
Reply STOP to stop WhatsApp updates.

Parameter order: applicant name; matching-property title or request-completed update; location; rent detail or request-update detail; property URL or request-search URL. Use sample values without real applicant details when submitting the template. This is a requested service update, not a promotional campaign. Approval/category must be confirmed in Meta before enabling the sender.

## Consent and opt-out

The unchecked, optional checkbox on the web and mobile request forms identifies Amana RentalHub NG, the property-request purpose and the supplied number, and explains STOP. The server records a boolean, server timestamp and consent copy version property-request-v1. Consent persists through the paid-request record into the eventual property request. Merely entering a phone number or using an older client never grants consent.

Signed STOP/UNSUBSCRIBE/CANCEL/END/QUIT replies are recorded by normalized sender phone. The shared text, template and media senders all check suppression, including campaign sends. Database unavailability during the suppression check blocks sending. Signed START/SUBSCRIBE clears the phone suppression for future eligible updates; already cancelled delivery jobs are not automatically resurrected. Out-of-order older preference events do not overwrite newer choices. Nothing can retract a message already accepted by Meta before an opt-out arrived.

## Delivery and recovery

property_alert_deliveries has one durable row per request/channel. Enqueueing never claims delivery. Worker claims use PostgreSQL SKIP LOCKED and a lease for multiple PM2 workers. Transient rejections retry with backoff, up to five attempts within seven days. Missing credentials/template configuration is blocked with hourly rechecks. Accepted WhatsApp messages wait for verified sent/delivered/read receipts and are never blindly resent. Ambiguous network outcomes or an interrupted in-flight worker are uncertain, requiring receipt evidence or manual review rather than risking a duplicate.

Automatic fulfillment/notified_at occurs only after email provider acceptance or a confirmed WhatsApp delivered/read receipt. Email acceptance is not proof that the person opened or received the email. State-admin manual fulfillment remains an explicit sourcing decision; it no longer sets notified_at before sending. A failed WhatsApp channel can still retry independently after email succeeds.

A minute job also recovers active, unnotified requests with a verified available match but no queued notification, and manually fulfilled, unnotified requests with no queued notification. Existing matching criteria and one-match-per-request behavior are preserved. Matching does not reserve a property or guarantee it remains available later.

Webhook batches are persisted with deduplication and correlation data; monotonic receipt handling prevents read/delivered states being downgraded by late events. Only IDs, timestamps, state/error codes and opt-out preferences are stored, not the raw incoming conversation. Unknown receipts expire from processing after seven days. Missing receipt correlation does not get treated as confirmed delivery.

Operator inspection (read-only):

    SELECT id, alert_id, channel, status, attempts, last_error, message_id, updated_at
    FROM property_alert_deliveries ORDER BY id DESC LIMIT 100;

For uncertain/failed rows, inspect provider delivery records and the recipient details before any manual resend. Never requeue cancelled opt-out jobs without a new explicit consent decision. Old requests whose earlier code already marked notified_at may require manual investigation; their historical delivery cannot be reconstructed from timestamps alone.

## Dashboard

Tenant and landlord More cards separately show Disputes, Property Reports and Support. Disputes/property reports have been removed from inside the Support centre. Paid Coverage assistance and support channels remain in Support.

## Policy source and verification

WhatsApp Business Messaging Policy: https://business.whatsapp.com/policy (opt-in, opt-out, approved templates and the 24-hour customer service window).

Automated checks cover consent, paid-request preservation, template-only dispatch, phone normalization, shared STOP suppression, bounded retries, blocked configuration, ambiguous-send protection, multi-worker claim SQL, authenticated receipts, batching and monotonic event handling. Web form checks confirm email-only default and explicit checkbox submission. Mobile parsing/behavior checks and Android/iOS exports verify shared source compatibility. No production database migration or live message delivery was performed; complete normal deployment smoke checks with a consenting test recipient.

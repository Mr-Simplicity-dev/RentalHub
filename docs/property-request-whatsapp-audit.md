# Property request WhatsApp audit

This is a repository audit, not confirmation of live delivery. No real messages were sent and no production secrets were inspected. Notification logic was not changed.

## Existing flow

1. Property requests are stored in tenant_property_alerts and initially enter support review. Matching only includes active, previously unnotified requests in approved_assigned, sourcing or lga_coverage_missing status.
2. services/adminService.js calls notifyAlertsForProperty after administrator property approval. It is not triggered simply by every property draft being created.
3. config/utils/propertyAlertService.js matches property type, optional state/LGA/city, budget and minimum bedroom/bathroom requirements.
4. It attempts an email and, when the request includes a phone number, a WhatsApp text to that number. The automatic message contains the property title, location, rent and property link.
5. It then sets matched_property_id, notified_at, fulfilled_at, workflow_status=fulfilled and is_active=false.
6. There is also a manual state-team fulfilled action that attempts email and WhatsApp with a filtered search link rather than a specific matched-property link.

## Webhook distinction

/api/whatsapp/webhook handles Meta verification and acknowledges incoming messages/status events. It currently logs the number of statuses and messages; it does not generate the property match notification, auto-reply to WhatsApp users, persist delivery/read state or trigger retries. The website/mobile WhatsApp-style assistant is a separate UI.

## Delivery risks found

- Automatic matching marks the request fulfilled even when email fails or WhatsApp returns success=false. Manual fulfillment also marks notification time before attempting delivery. The notified_at filter then excludes the request from automatic matching. No dedicated per-channel property-alert retry queue was found.
- Property alerts call sendWhatsAppText, not the already available sendWhatsAppTemplate. WhatsApp only permits free-form messages within its 24-hour customer-service window; later proactive notifications require an approved template. A property match may occur days after the original request.
- The sender strips non-digits from phone numbers but does not convert Nigerian local 080... numbers to international 23480... format. Whether this affects live users depends on how their submitted phone numbers are stored.
- Required sender settings are WHATSAPP_META_TOKEN and WHATSAPP_PHONE_NUMBER_ID (WHATSAPP_PROVIDER defaults to meta). Their live configuration, template approval and actual delivery were not verified.

Official WhatsApp policy: https://business.whatsapp.com/policy (Business Platform section).

Recommended follow-up: approved utility template for request matches, per-channel delivery records and retry handling, international phone normalization, and webhook message-ID reconciliation. A fulfillment decision should be distinct from proof that a notification was delivered.

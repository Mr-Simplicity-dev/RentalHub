# Support customer lookup and private complaint handling

Implemented 7 November 2026.

## Customer contacts

- Signed-in ticket ownership comes from authentication, not an entered email or phone. Staff read the saved account contacts.
- New guest support forms require email and a phone number. Migration 2044 adds `support_tickets.contact_name` and `contact_phone`, without changing ownership of old tickets.
- Older mobile versions can still submit their existing email-only form. Staff see a missing-phone notice for those requests.
- Guest account matching requires both contacts and an unambiguous account in the staff member's permitted area. It is labelled a possible match, never proof of identity. It does not attach the guest ticket to that account.
- Customer lookup returns only basic account and contact/verification-status fields. It excludes identity documents, bank details, credentials and biometric data.
- Staff lookup is authenticated, MFA protected, territory scoped, rate limited, non-cacheable and audited. Search uses bound SQL parameters and official clients send search terms in a POST body. Contact values/search payloads are redacted by audit middleware.

## Staff screens and routes

- Web ticket workspace: remote name/phone/email search over permitted tickets, including tickets beyond the previously loaded list.
- Android/iOS shared native ticket queue: the same search endpoint and customer-details card in ticket detail.
- `GET /api/support/tickets/:id/customer`: scoped read-only account/contact card.
- `POST /api/support/tickets/search`: scoped support ticket search; existing GET listing retained.
- Customer detail includes manual phone/email actions. It does not send messages automatically or grant account editing.

## Complaint privacy

A normal support ticket is private to its customer and authorised support staff. It does not automatically alert the other tenant or landlord. The existing consented support-to-dispute workflow shares an approved summary, links a formal case and alerts both participants. Private ticket replies, contact forms and internal notes are not copied to the opposing party.

## Validation and limitations

- Backend suite: 129 passed, 0 failed, including seven new customer-lookup/security tests.
- Web suite: 156 passed, 0 failed, including four new customer-card tests.
- Web production build passed, with the existing chunk-size warning.
- Live migration 2044 applied. Real PostgreSQL projection and phone-search queries passed. No customer records changed by probes.
- Android/iOS use shared JavaScript. Android release is signed separately; iOS signing requires macOS/Xcode and is not performed on Windows.
- No real customer account, message or push notification was created to test these changes. Physical-device push delivery and launcher presentation depend on the device and its settings.

## Code of Conduct

The user's governance handbook has not yet been supplied. Do not invent official staff rules or publish an unsigned policy as an approved handbook. Once supplied, prepare the shared staff obligations plus role-specific duties and signature pages, excluding Super Admin as requested. Customer rules remain separate from staff duties and should be linked to the existing Terms/Privacy flow.

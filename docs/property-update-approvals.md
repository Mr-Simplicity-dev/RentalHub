# Property description and amenity update approvals

Every edit submitted through `PUT /api/properties/:propertyId` now creates a pending update request. It no longer overwrites the published listing. Existing creation approval, availability, unlisting, photo uploads and damage reports keep their separate workflows.

## Landlord and agent workflow

On web, Android and iOS, open **My Properties → Update property details**. The form loads current server values and edits title, description, other amenities and the existing structured feature catalogue (including borehole type, water availability, tanks, electricity and other categories). Supply a reason, then submit. Approved public values remain unchanged while pending. Withdraw a pending request to edit again. Rejected requests show the administrator's note; a new submission can be made. Previous requests are retained.

Agents use existing assignment and `can_manage_properties` permissions. Customers cannot change verification, owner or review status through this workflow. If the current listing is unsafe or misleading while a request is pending, use the existing pause/unlist process and damage-report/support channels; a submitted improvement is not presented as verified before approval.

## Review

General-admin property lists prioritise pending updates. Open a property and select **Property update approvals** (mobile: **Review property updates**). Super Admin's property table also links to review. Compare the previous and proposed fields; enter a note and approve or reject. The existing general-admin role guard and current state/LGA scope apply. Zonal roles remain blocked on the existing non-zone-scoped admin endpoints. Self-review is rejected. Moving a property across a reviewer's jurisdiction requires a broader administrator.

Submission, cancellation and review use transactions and property row locks. Only one pending request per property is permitted. Approval uses the stored proposed values, never extra values from the review payload. A changed baseline blocks approval rather than overwriting intervening changes. Rejection and withdrawal do not modify the listing. Existing tenancy/application records are not rewritten. The complete pre-change metadata is kept in the request history.

Approval does not reset an inspection date or grant a new verification badge. Existing photo/tour content is not silently replaced by editing text: admins should check that media remains accurate, use the existing media workflow and request tour regeneration where needed. Damage-photo collection remains in the existing damage-report workflow; this form does not introduce a second upload system.

Landlords receive existing in-app notifications on submission and review. All administrative decisions use the existing activity logger. Responses containing revision history are not cached.

## Database and deployment

Migration: `2032_property_update_approvals.sql`. Adds only `property_update_requests`, with before/proposed JSON, reason, submitter, decision, reviewer, review note and timestamps. Indexes enforce one pending update and support queue/history access. No existing property data is converted or deleted. Apply before deploying the backend:

```sh
cd /var/www/rentalhub
npm run migrate:dry-run
npm run migrate
npm run build --prefix client
pm2 restart rentalhub
```

No environment variables or paid services added. Release a new Android/iOS app build to expose the native editor. Both platforms share the same source. No live migration or deployment was performed during development.

## API

- Existing `PUT /properties/:propertyId`: submits an approval request (returns pending request data).
- `GET /properties/:propertyId/updates`: authorized owner/agent current metadata and latest 50 requests.
- `POST /properties/:propertyId/updates/:requestId/withdraw`: withdraw own pending request.
- `GET /admin/properties/:id/updates`: scoped review/history.
- `PATCH /admin/properties/:id/updates/:requestId`: approve/reject, with mandatory note.
- Existing admin property/pending lists include pending updates; My Properties includes the latest update status.

## Verification

Focused backend tests cover ownership, whitelisting, pending uniqueness, reason validation, unchanged public data on submission/rejection, atomic approval, stale/conflicting changes, self-review, territorial scope and withdrawal. Web tests cover editing/submission, pending-state controls, API failure and admin decisions. Native schema is copied from the existing web catalogue; keep both files synchronized when adding new feature definitions.

## Final local results (30 October 2026)

- Focused approval backend tests: 11 passed.
- Web editor/admin interaction tests: 4 passed, including draft preservation after withdrawal.
- Full backend suite: 552/554 passed. Remaining failures are the existing mobile language-layout subprocess timeout and the existing registration currency source-expression assertion; neither was suppressed.
- Full web suite: 125/126 passed, with one existing WhatsApp widget test timing out under concurrent builds. The affected widget suite and final editor suite were rerun together: all 12 tests passed.
- Final Vite production build: passed; existing large-chunk warnings remain.
- Final Android and iOS JavaScript/Hermes exports: both passed (1,429 modules in the earlier run; final bundles approximately 8.6 MB each). These are bundle checks, not signed APK/IPA releases.
- Web/mobile feature-catalogue parity and final native syntax checks passed. Mobile property details now render approved structured amenities from the existing access-controlled property response.
- No live database migration, production deployment or physical-device approval transaction was performed.

## Files

New backend files: `services/propertyUpdateService.js`, `migrations/2032_property_update_approvals.sql`, `tests/propertyUpdateRequests.test.js`, and this guide.

Updated backend files: `services/propertyService.js`, `services/adminService.js`, `routes/properties.js`, `routes/admin.js`.

New web files: `client/src/components/properties/PropertyUpdateEditor.jsx`, `client/src/components/properties/PropertyUpdateEditor.test.jsx`, `client/src/components/admin/PropertyUpdateReview.jsx`.

Updated web files: `client/src/pages/MyProperties.jsx`, `client/src/pages/admin/AdminPropertyDetail.jsx`, `client/src/pages/admin/AdminProperties.jsx`, `client/src/components/admin/PropertiesTab.jsx`, and the eight `client/src/i18n/{en,fr,ar,ru,zh,ha,yo,ig}.json` catalogues.

New mobile files: `RentalHubMobile/src/components/properties/PropertyUpdateModal.js`, `RentalHubMobile/src/data/propertyFeatureSchema.js`.

Updated mobile files: `src/screens/dashboard/MyPropertiesScreen.js`, `src/screens/admin/AdminPropertyDetailScreen.js`, `src/screens/admin/AdminPropertiesScreen.js`, `src/screens/home/PropertyDetailScreen.js`, and `src/i18n/interfaceCopy.json` (all under `RentalHubMobile`).

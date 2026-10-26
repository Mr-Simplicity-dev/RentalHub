# Administrative tour refresh

Updated the existing web and shared Android/iOS tour architecture; no new dashboard or permission changes were introduced.

- Tour version 6 refreshes the available guide without deleting stored account data.
- All 21 administrative roles have role-specific tour coverage checks. Existing finance, support, recruitment, transport and fumigation tours remain available alongside territorial administration and Super Admin.
- Web admin/state tours include tenant property-request review within their jurisdiction. Zonal roles do not receive the LGA request-review step.
- Super Admin steps open the actual request, recruitment/volunteer, pricing, admin account and pending approval tabs. Overview steps explicitly return to Overview when resuming a tour from another tab.
- Recruitment guidance distinguishes employment from free volunteer intake, explains independent volunteer control, manual review, payment Not Applicable and intentionally selected interviews.
- Native Super Admin steps select the correct workspace. Zonal administrators now receive their own Zone Overview tour instead of a generic Admin Dashboard destination.
- Native collapsed workspace cards become visible when the current tour targets them. The zone screen uses the existing dashboard scroll controller for target reveal.
- The native catalogue now has 85 localized steps in eight languages.
- The web property-request introduction, payment/free note and State/LGA fee instruction are centred within a readable width. Pricing calculations, payment requirements and notification consent are unchanged.

## Verification
- 491 backend tests passed.
- 68 web tests passed, including 25 new administrative-tour regression cases.
- Web production build passed with the existing large-chunk warning.
- Native tour checks passed across all 21 roles and eight languages, including workspace destinations, selectable workflows, targets and Babel parsing.
- Native typography checks passed.
- Browser layout checks passed at 320, 375, 390, 768, 1024 and 1440px: both message paragraphs centred, within the viewport, fee-location instruction present, no page errors. Test API responses were mocked; no requests were submitted.

Deploy the rebuilt website and release updated Android/iOS applications for users to receive the changes. No migration or new environment variable is required for this tour/layout update. JavaScript exports verify bundling; physical-device walkthroughs and signed store builds remain release steps.

Android and iOS JavaScript exports both passed. Existing WebRTC package-export warnings remain non-blocking.

# Tour and currency audit

## Findings repaired
- Several native steps were navigating away from dashboard controls before trying to highlight those controls. Preparation navigation is now separate from the action a user chooses to open. Steps for Applications, Payment History, Support, Settings and evidence verification intentionally retain their destination-screen behavior.
- The notification step opens Explore, where the notification anchor is registered. Agent and lawyer roles no longer inherit tenant tab-bar steps.
- Finance reconciliation points to its actual Controls screen. Lawyer client-assignment guidance describes authorized property assignments rather than a Messages action.
- Marketing agents have their own survey capture/summary tour. Zonal finance, transportation, fumigation and lawyer roles no longer fall back to inappropriate tenant/admin tour definitions.
- National transportation/fumigation tours use their actual specialist workspaces and matching anchors. Their root navigator now honors the initial workspace already supplied by the role router.
- Web specialist roles have their own dashboard/workflow mappings. Lawyer workflows retain the correct state, zonal or national dashboard route.
- Removed the agent referral step whose control is absent, and added the missing Super Admin property-request anchor.
- Tour version 7 makes the corrected guide available. The native catalogue has 87 localized steps in eight languages.

## Currency
Repaired 17 currency labels: seven in native registration, five in web wallet withdrawal displays, three mobile administrator prices using N instead of the symbol, and two refund responses. The native registration changes cover the total due, diaspora estimate, lawyer/agent options and additional foreign-card amount. Shared native source applies to Android and iOS.

All four bundled Inter weights on both web and native contain U+20A6. Existing web registration local fees render with the proper symbol. Pricing, fees, payment calculations and authorization were not changed.

## Verification
- 494 backend tests passed, including new source-encoding, registration-prefix and actual font-glyph checks.
- 108 web tests passed, including registration fee rendering and role-specific selector checks for all 31 roles in the web role catalogue.
- The production website build passed with its existing large-chunk warning.
- Native tour checks match preparation routes to the signed-in role's own navigator and verify the target exists in the destination component tree for all 32 navigator roles. The catalogue, localization and Babel checks passed.
- A repository-wide tracked-source scan found no remaining instances of the two corrupted naira sequences checked after repairs.

These are code, component-rendering and bundle checks. They do not guarantee every live-data state or replace a physical-device walkthrough. Missing-data and permission-dependent screens still need release smoke testing with suitable accounts.

## Release
Deploy the rebuilt website/backend and distribute new Android/iOS releases. Existing installed applications keep their old interface until updated. No migration, payment-provider change or new environment variable is required for these repairs.

Android and iOS JavaScript exports both passed. Native typography and account-assistant regression checks also passed.

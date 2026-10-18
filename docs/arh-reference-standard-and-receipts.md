# ARH Platform Reference Standard & Receipt Overhaul — Implementation Spec

Work on my RentalHub repository and implement the following changes carefully.

IMPORTANT:
- This is a financial/production system.
- Do not break existing payment, payout, webhook, reconciliation, recruitment,
  receipt, wallet, subscription, refund, or Paystack logic.
- Inspect all affected call sites before editing.
- Run the complete backend test suite and relevant frontend/build checks after
  making the changes.
- Do not delete or rewrite historical references already stored in the database.

============================================================
1. PLATFORM-WIDE REFERENCE STANDARD: ARH
============================================================

The official platform reference prefix is now:

ARH

ARH means Amana RentalHub.

All NEW RentalHub-generated references/identifiers must use ARH as the
top-level platform prefix.

Examples of the desired convention:

ARH-APP-...             Recruitment application reference
ARH-CR-...              Recruitment access code
ARH_CR_...              Recruitment payment reference

ARH_REGPAY_...          Registration payment
ARH_SUB_...             Subscription payment
ARH_MULTI_PROP_SUB_...  Multiple-property subscription
ARH_UNLOCK_...          Property unlock
ARH_LIST_...            Listing payment
ARH_RENT_...            Rent payment
ARH_WALLET_...          Wallet funding
ARH_INSPECTION_...      Property inspection
ARH_LOC_...             Location access
ARH_LAWYERDIR_WALLET_... Lawyer wallet/direct transaction
ARH_REFUND_...          Refund
ARH_EVID_...            Evidence verification
ARH_ALERT_...           Property alert
ARH_LPB_...             Landlord property billing
ARH_TRANSPORT_...       Transportation payment

Payout references:

ARH_AGW_<withdrawalId>_<...>     Agent withdrawal
ARH_WLW_<withdrawalId>_<...>     User wallet withdrawal
ARH_SAW_<withdrawalId>_<...>     State/admin withdrawal

Retry references should follow the same convention, e.g.:

ARH_AGW_<id>_R1
ARH_WLW_<id>_R1
ARH_SAW_<id>_R1

Payment retry references should also be ARH-prefixed, for example:

ARH_RETRY_RENT_...
ARH_RETRY_SUB_...
ARH_RETRY_UNLOCK_...
ARH_RETRY_WALLET_...
ARH_RETRY_LIST_...
ARH_RETRY_INSPECTION_...

Receipt/document identifiers should use ARH too:

ARH-RCPT-000123
ARH-WDR-000184
ARH-AG-PAY-000091
ARH-SAW-PAY-000037

Do a repository-wide audit for every place that creates, validates, parses,
compares, displays, searches, or routes using a reference.

Do NOT limit the search to literal "RH". Search all reference generators such as:

transaction_reference
payment_reference
paystack_transfer_reference
reference
reference_number
receiptNumber
payoutNumber
retryReference
Date.now()
randomBytes()
startsWith()
regex validators
Paystack webhook routing
Paystack verification
receipt generation
frontend payment verification
mobile/API contracts
tests

============================================================
2. BACKWARD COMPATIBILITY IS MANDATORY
============================================================

DO NOT update historical database references from RH to ARH.

A Paystack transaction already created under an old reference must not continue
to reconcile under that exact old reference as the next payment should carry the new ref.

Existing references may include:

RH-APP-...
RH-CR-...
RH_CR_...
AGW_...
WLW_...
SAW_...
RENT_...
WALLET_...
REGPAY_...
etc.

Existing records and old Paystack transactions MUST continue working.

Therefore:

NEW references -> generate ARH format.
OLD references -> continue accepting/verifying/processing them.

For example, webhook routing must support BOTH:

ARH_AGW_
and legacy AGW_

ARH_WLW_
and legacy WLW_

ARH_SAW_
and legacy SAW_

Recruitment validation must accept both:

ARH-APP-...
RH-APP-...

but generate ONLY:

ARH-APP-...

Do the same anywhere a reference prefix is parsed or validated.

Never change a persisted reference merely for branding because Paystack and
our database must continue to agree on the original reference.

============================================================
3. CENTRALIZE REFERENCE GENERATION
============================================================

Do not continue scattering hard-coded reference prefixes throughout the
codebase.

Create an appropriate shared reference utility if you cannot harmonize what i alread have, for example:

config/utils/referenceGenerator.js

or another suitable existing utility location.

It should provide safe helpers/constants for creating Amana RentalHub references.

The canonical platform prefix should be defined once:

ARH

Use cryptographically secure randomness where a reference is security
sensitive.

Do not weaken the existing recruitment application reference entropy.

Refactor new reference generation to use this shared utility where practical if you create one.

Do NOT create unnecessary database migrations just to rename old references.

============================================================
4. FIX PAYMENT/PAYOUT RECEIPT IMPLEMENTATION
============================================================

Audit:

config/utils/paymentReceipt.js
config/utils/emailService.js
routes/payments.js
client/src/pages/PaymentHistory.jsx

and every call site of:

sendAdminPayoutReceipt
sendAgentPayoutReceipt
sendUserPayoutReceipt
sendReceiptForPayment

There is currently a problem in paymentReceipt.js:

sendPayoutReceiptEmail() calls sendEmail() and esc(), but paymentReceipt.js
does not properly define/import them.

check if it has been fixed else Fix this correctly.

Do not merely suppress the ReferenceError.

Use the existing mailer/shared HTML escaping mechanism or create a clean
shared HTML escape helper if it is needed.

Payout receipt delivery must actually execute successfully.

============================================================
5. FIX RECEIPT BRANDING TYPO
============================================================

Search the entire repository for:

Amana Amana RentalHub NG

Replace incorrect duplicated branding with:

Amana RentalHub NG

This includes email subjects, email bodies, PDF footers, image alt text,
receipt UI and any other user-facing occurrence.

Do not change the legitimate standalone Amana wordmark followed separately
by "Amana RentalHub NG".

============================================================
6. UNIQUE PAYOUT RECEIPT NUMBERS
============================================================

Current payout receipt numbers are based on user/admin IDs, which means the
same person can receive the same receipt number for multiple withdrawals.

This is unacceptable.

Receipt numbers must identify the TRANSACTION/WITHDRAWAL, not merely the
recipient.

Modify the payout receipt functions and their call sites to pass the actual
withdrawal ID.

Examples:

ARH-WDR-000184
ARH-AG-PAY-000091
ARH-SAW-PAY-000037

where the numeric component is the relevant withdrawal record ID.

Never use only userId, agentUserId or adminId as the unique receipt number.

Ensure repeated delivery of the SAME payout generates the SAME receipt
number rather than a new number.

============================================================
7. PROFESSIONAL RECEIPT STANDARD
============================================================

Standardize all financial receipts so they share a common professional
RentalHub appearance.

This includes:

- ordinary payment receipt
- rent payment receipt
- wallet funding receipt
- registration receipt
- listing receipt
- subscription receipt
- savings contribution receipt
- tenant/landlord withdrawal receipt
- agent payout receipt
- admin payout receipt

Use a consistent header:

Amana wordmark
Amana RentalHub NG
rentalhub.com.ng
support@rentalhub.com.ng

Then document type, for example:

OFFICIAL PAYMENT RECEIPT
OFFICIAL RENT PAYMENT RECEIPT
OFFICIAL PAYOUT RECEIPT
RENT SAVINGS CONTRIBUTION RECEIPT

Display the ARH receipt number prominently.

Maintain the existing professional blue/maroon Amana styling rather than
redesigning the entire application.

============================================================
8. PROFESSIONAL PAYMENT DETAILS
============================================================

Normal payment receipts should include where available:

Receipt number
Paid by
Email
Date/time
Transaction reference
Payment status
Payment method
Payment channel
Description/line items
Total paid
Currency

Diaspora receipts should retain:

USD quote
FX rate
FX markup
NGN amount actually charged

Do not remove the existing diaspora information.
============================================================
9. RENT PAYMENT RECEIPT — REQUIRED DETAILED FORMAT
============================================================

For every payment where:

payment_type = 'rent_payment'

do NOT generate only a generic payment receipt.

Generate a detailed RENT PAYMENT RECEIPT using the actual RentalHub
database relationships.

The receipt should contain the following information whenever it exists:

OFFICIAL RENT PAYMENT RECEIPT

Receipt Number:       ARH-RCPT-000123
Payment For:          Annual Rent
Property:             3-Bedroom Apartment
Property Address:     Gwarinpa, Abuja
Tenant:               John Doe
Landlord:             Jane Doe
Rental Period:        18 Oct 2026 – 17 Oct 2027

Rent Amount:          ₦750,000
Platform/Service Fee: ₦X,XXX       [only if applicable]
Other Charges:        ₦X,XXX       [only if applicable]
Total Paid:           ₦XXX,XXX

Payment Reference:    ARH_RENT_...
Payment Method:       Paystack — Card
Payment Status:       PAID
Payment Date:         18 October 2026, 12:27 PM WAT

The exact values above are examples only.

NEVER hard-code:
- property names
- addresses
- tenant names
- landlord names
- rental periods
- amounts
- fees
- payment references

Load them from the correct existing RentalHub records.

------------------------------------------------------------
DATA REQUIREMENTS
------------------------------------------------------------

Determine the correct relationships between:

payments
properties
users
rental applications/requests
tenancy/agreement records
wallet transactions
and any relevant rental/lease tables

before implementing this.

Use the real source of truth already present in the codebase.

Tenant:
Use the tenant associated with the rent payment/tenancy.

Landlord:
Use the actual owner/landlord of that property.

Property:
Use the property's actual title/name.

Property Address:
Build it from the appropriate existing property location/address fields.
Do not invent missing address components.

Rental Period:
Use the actual tenancy/agreement start and end dates if available.

For example:

18 October 2026 – 17 October 2027

If no authoritative rental-period record exists for an older transaction,
omit the Rental Period field rather than guessing.

------------------------------------------------------------
PAYMENT REFERENCE
------------------------------------------------------------

ALL newly generated rent payment references MUST use:

ARH_RENT_...

Example:

ARH_RENT_184_1792312345678

Never generate a new:

RH_...
RH_RENT_...
RENT_...

reference.

However, historical receipts MUST display their ORIGINAL stored reference.

Therefore an old receipt may legitimately show:

RENT_184_...

or another legacy reference if that is the exact reference originally used
for the transaction.

DO NOT rewrite a historical payment reference merely to make it display ARH.

New transaction = ARH reference.
Historical transaction = original persisted reference.

------------------------------------------------------------
RECEIPT NUMBER
------------------------------------------------------------

The receipt's document number must be:

ARH-RCPT-XXXXXX

using the immutable payment ID or another existing immutable unique
transaction identifier.

Example:

payment.id = 184

Receipt Number:
ARH-RCPT-000184

The SAME payment must have the SAME receipt number in:

- Payment History
- receipt modal
- printed receipt
- PDF receipt
- emailed receipt

Do not generate receipt numbers from Date.now() when rendering the receipt.

------------------------------------------------------------
RENT DESCRIPTION
------------------------------------------------------------

Do not always hard-code:

Payment For: Annual Rent

Determine the actual rental/payment context.

Examples could include:

Annual Rent
Monthly Rent
Quarterly Rent
Rent Payment

Use the actual tenancy/payment data where the billing period is known.

If the system cannot reliably determine the billing period, use:

Rent Payment

Do not guess "Annual Rent".

------------------------------------------------------------
FINANCIAL BREAKDOWN
------------------------------------------------------------

The rent receipt must clearly distinguish:

Rent Amount
Platform/Service Fee
Other applicable charges
Total Paid

Only display a fee if that fee was actually charged for that transaction.

Do NOT calculate or invent historical fees from today's fee configuration.

Use the actual transaction/payment/wallet records.

The displayed figures must reconcile:

Rent Amount
+ applicable charged fees
+ other charged items
= Total Paid

where that is the actual payment model.

If a fee was deducted from the recipient rather than charged on top of the
tenant's payment, clearly label it separately so the receipt does not
misrepresent what the tenant paid.

------------------------------------------------------------
STATUS
------------------------------------------------------------

Do not display raw database values.

Examples:

completed -> PAID
pending   -> PENDING
failed    -> FAILED
reversed  -> REVERSED
refunded  -> REFUNDED

Use the actual status mapping appropriate to RentalHub.

A receipt must NEVER say PAID unless the underlying transaction has actually
reached the completed/settled state required by the existing payment logic.

------------------------------------------------------------
PAYMENT METHOD
------------------------------------------------------------

Display a professional human-readable value.

Examples:

Paystack — Card
Paystack — Bank Transfer
Paystack — USSD
Paystack — Mobile Money
Wallet
Bank Transfer

Do not display:

paystack — card
bank_transfer
mobile_money

directly to the customer.

------------------------------------------------------------
PRIVACY AND AUTHORIZATION
------------------------------------------------------------

The receipt endpoint must continue verifying that the authenticated user is
authorized to view that receipt.

Do not create an IDOR vulnerability by joining additional tenant, landlord,
property or tenancy information.

A user must not be able to change paymentId and retrieve another customer's
financial receipt.

------------------------------------------------------------
EMAIL + PDF + WEB CONSISTENCY
------------------------------------------------------------

Do not implement these details only in the PDF.

The same core receipt data should be generated from ONE shared receipt-data
builder and reused by:

1. email receipt
2. downloadable PDF
3. Payment History receipt modal/print view

Avoid three independent implementations that can disagree.

For the same transaction, all three should show the same:

ARH receipt number
payment reference
tenant
landlord
property
property address
rental period
financial breakdown
payment method
status
date

where applicable.

------------------------------------------------------------
GRACEFUL FALLBACK
------------------------------------------------------------

Historical transactions may not have every rental detail.

Receipt generation must NOT fail because optional historical information is
missing.

For example, if property address exists but tenancy dates do not:

SHOW:
Property Address: Gwarinpa, Abuja

OMIT:
Rental Period

Do not display:

Rental Period: undefined
Landlord: null
Property: N/A

unless N/A is genuinely the desired UI convention.

Prefer omitting unavailable optional fields.

------------------------------------------------------------
TESTS
------------------------------------------------------------

Add tests for detailed rent receipts.

At minimum verify:

1. Rent receipt contains ARH-RCPT receipt number.
2. New rent payment reference starts ARH_RENT_.
3. Historical legacy rent reference remains unchanged on historical receipt.
4. Correct tenant is displayed.
5. Correct landlord is displayed.
6. Correct property is displayed.
7. Correct property address is displayed.
8. Correct tenancy/rental period is displayed when available.
9. Missing tenancy period does not break receipt generation.
10. Correct rent amount is displayed.
11. Actual applicable fees are displayed.
12. Total reconciles with actual transaction data.
13. Payment method/channel is humanized.
14. Completed payment displays PAID.
15. Non-completed payment cannot incorrectly display PAID.
16. Unauthorized user cannot access another user's rent receipt.
17. Email/PDF/web use the same core receipt data.

============================================================
10. STATUS AND PAYMENT METHOD FORMATTING
============================================================

Do not display raw database values to users where avoidable.

For example:

completed -> Completed
pending -> Pending
failed -> Failed
reversed -> Reversed
processed -> Processed

Likewise:

paystack -> Paystack
bank_transfer -> Bank Transfer
mobile_money -> Mobile Money
apple_pay -> Apple Pay

Create/reuse centralized humanization helpers rather than duplicating this
logic unnecessarily.

============================================================
11. NIGERIAN DATE/TIME
============================================================

Financial receipts should use explicit Nigerian time:

Africa/Lagos

Do not depend on the VPS/server timezone.

Use a clear professional format such as:

18 October 2026, 12:27 PM WAT

Apply this consistently to email, PDF and web receipt displays where
appropriate.

============================================================
12. MASK BANK ACCOUNT NUMBERS
============================================================

Do not expose full bank account numbers in emailed payout receipts.

Display something such as:

Access Bank ••••••7890

The full bank account can remain securely stored internally as required for
processing, but user-facing payout emails/PDFs should use a masked form
unless there is a strong existing business requirement otherwise.

Create a reusable account-number masking helper.

============================================================
13. COMPUTER-GENERATED RECEIPT NOTICE
============================================================

Keep a professional notice such as:

"This is a computer-generated receipt and does not require a signature."

Use it consistently on downloadable financial receipt PDFs.

Do not falsely claim the document is a tax invoice unless RentalHub has
explicitly implemented tax-invoice requirements.

============================================================
14. PAYMENT HISTORY RECEIPT
============================================================

Update PaymentHistory.jsx so the on-screen receipt agrees with the backend
PDF/email receipt:

- ARH receipt number
- Amana RentalHub NG branding
- humanized status
- humanized payment method/channel
- Nigerian date/time
- itemized breakdown
- total
- rental-specific details where available

Download PDF and Print must continue working.

Do not create inconsistent receipt numbering between web, email and PDF.

The same transaction should show the same receipt number everywhere.

============================================================
15. TESTS — IMPORTANT
============================================================

Strengthen receipt tests.

The existing payout receipt test mostly checks that the function does not
throw. That is insufficient because sendPayoutReceiptEmail catches errors
internally.

Mock/spy on the mailer and assert that the mailer was ACTUALLY CALLED.

Add tests verifying:

1. Payment receipt email is actually sent.
2. User payout receipt email is actually sent.
3. Agent payout receipt email is actually sent.
4. Admin payout receipt email is actually sent.
5. Receipt number uses withdrawal ID, not user ID.
6. Receipt numbers have ARH prefix.
7. New payment references have ARH prefix.
8. New payout references have ARH prefix.
9. New recruitment references use ARH.
10. Legacy RH recruitment references remain accepted.
11. Legacy AGW_/WLW_/SAW_ webhooks remain accepted.
12. ARH_AGW_/ARH_WLW_/ARH_SAW_ webhooks work.
13. Old persisted references are not rewritten.
14. Bank account number is masked in receipt output.
15. Status/payment method is humanized.
16. Receipt date is rendered in Africa/Lagos timezone.
17. "Amana Amana RentalHub NG" does not remain in user-facing receipt code.
18. Existing combined-payment receipt grouping still works.
19. Existing diaspora receipt information still works.
20. Rent receipt gracefully handles missing optional rental/property fields.

Also update existing tests that intentionally contain old RH references:
keep explicit LEGACY compatibility tests, but use ARH references for tests
representing newly created transactions.

============================================================
16. DO NOT BREAK PAYOUT SAFETY WORK
============================================================

Do not undo the recent payout retry/reconciliation safety fixes.

Changing:

AGW_ -> ARH_AGW_
WLW_ -> ARH_WLW_
SAW_ -> ARH_SAW_

must be done carefully.

Update:

- initial transfer generation
- retry reference generation
- webhook prefix detection
- verification by reference
- reconciliation
- tests

The exact reference persisted before calling Paystack must still be the exact
reference used for verification/reconciliation.

Do NOT introduce reference fallback/guessing.

Historical AGW_/WLW_/SAW_ references must continue working.

Leave:

PAYOUT_RETRY_ENABLED=false

============================================================
17. FINAL REPOSITORY-WIDE AUDIT
============================================================

After implementation, search the entire repository again.

There should be no NEW reference generator still creating unprefixed
RentalHub references such as:

RH_
RH-
REGPAY_
RENT_
WALLET_
LIST_
UNLOCK_
AGW_
WLW_
SAW_
RCPT-

New generation must use ARH.

However, legacy constants/patterns may remain ONLY where deliberately needed
for backward compatibility.

Clearly comment those cases as LEGACY compatibility.

Do not blindly replace unrelated uses of the letters "RH".
Do not change:
- rentalhub.com.ng
- RentalHub product name
- database column names
- third-party identifiers
- CSS/classes
- unrelated abbreviations
just because they contain "rh".

============================================================
18. VALIDATION BEFORE FINISHING
============================================================

Run:

- syntax checks
- complete backend test suite
- payout safety tests
- receipt tests
- recruitment tests
- Paystack webhook tests
- frontend production build
- mobile/API contract checks where the submodule is available

Do not report success if relevant tests fail.

At the end give me:

1. exact files changed
2. old reference format -> new reference format mapping
3. legacy compatibility retained
4. receipt changes made
5. tests added/updated
6. test results
7. any remaining risks

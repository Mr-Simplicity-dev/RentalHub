# Automatic bank-transfer accounts (virtual accounts)

The manual bank-transfer flow (screenshot capture + Super Admin approval,
migration `169`) stays available as the fallback rail. This feature adds a
provider-confirmed path on top of it:

| Payment | Account | Confirmation |
| --- | --- | --- |
| Registration fee | one-time transfer account, short expiry | provider webhook, then reconciliation |
| Wallet funding | dedicated virtual account (DVA) owned by the user | provider webhook |
| Anything else / provider unavailable / no NIN | manual platform account + captured screen | Super Admin approves |

Paystack is unchanged and remains the card/USSD checkout.

## What ships switched off

Nothing is created until **both** conditions hold:

1. `VIRTUAL_ACCOUNTS_ENABLED=true`
2. the selected provider has its credentials configured

When either is missing, `GET /api/virtual-accounts/config` returns
`{ "enabled": false }`, the client uses the manual flow, and no provider code
runs. `GET /api/virtual-accounts/wallet` also returns
`{ available: false }` with a `reason` instead of an error.

## Provider selection

`VIRTUAL_ACCOUNT_PROVIDER` accepts `monnify` (default) or `palmpay`.

### Monnify (recommended)

Reserved accounts are real Moniepoint/Wema/Sterling NUBANs. Creating one
requires the customer's NIN (or BVN). The one-time account is created through
the merchant `init-transaction` + `init-payment` endpoints (40-minute default
validity).

```dotenv
VIRTUAL_ACCOUNTS_ENABLED=true
VIRTUAL_ACCOUNT_PROVIDER=monnify
MONNIFY_API_KEY=
MONNIFY_SECRET_KEY=
MONNIFY_CONTRACT_CODE=
# MONNIFY_BASE_URL=            # override only if Monnify instructs you to
MONNIFY_SANDBOX=false
MONNIFY_TRANSFER_ACCOUNT_TTL_SECONDS=2400
```

Set the webhook URL in the Monnify dashboard to:

```
https://rentalhub.com.ng/api/virtual-accounts/webhook/monnify
```

The handler verifies the `monnify-signature` header (HMAC-SHA512 of the raw
body using the secret key) before doing anything else.

### PalmPay

PalmPay creates the account after NIN/BVN verification, and settles credits into
the merchant's PalmPay balance (their VA product has no balance of its own). The
production host is confirmed during onboarding — set `PALMPAY_BASE_URL` if it
differs from the default.

```dotenv
VIRTUAL_ACCOUNTS_ENABLED=true
VIRTUAL_ACCOUNT_PROVIDER=palmpay
PALMPAY_APP_ID=
PALMPAY_PRIVATE_KEY=
PALMPAY_BASE_URL=
PALMPAY_SANDBOX=false
PALMPAY_WEBHOOK_SECRET=
PALMPAY_VA_VERSION=V2.0
PALMPAY_TRANSFER_ACCOUNT_TTL_SECONDS=2400
```

Callback URL:

```
https://rentalhub.com.ng/api/virtual-accounts/webhook/palmpay
```

If `PALMPAY_WEBHOOK_SECRET` is not set, the callback cannot be
signature-verified, so the route fails closed unless
`VIRTUAL_ACCOUNT_WEBHOOK_TOKEN` is configured and PalmPay appends it as
`?token=...`. Never enable this with neither guard in production.

## Identity data

The account is opened in the name returned by the identity provider, not the
name typed at registration. That value is stored in `users.identity_verified_name`
and copied into the registration payload at payment initialisation.

The NIN is decrypted only immediately before it is sent to the partner bank
(`services/virtualAccountService.js` → `readNIN`). Users without a NIN
(foreign passport registrations, or NIN disabled by feature flag) fall back to
the manual flow; they cannot be issued a DVA.

The privacy policy and the registration consent line state that the partner bank
receives the verified name and, where it requires it, the NIN, solely to open
and operate that account. Update those statements if the purpose or recipients
change.

## Money movement

Webhook events are written to `virtual_account_events` with a unique
`(provider, event_id)` (SHA-256 of the raw body). A repeated delivery returns
`200` without moving money again. Unprocessed rows stay visible in
Super Admin → Automatic Transfers.

* **Wallet credit** inserts a `payments` row with
  `transaction_reference = VA-<provider>-<provider transaction reference>`.
  That column is unique, so a second credit attempt cannot post to the ledger.
  The wallet, commission and receipt then follow the same helpers as Paystack.
* **Registration** claims the one-time account (`status: active → paid`) before
  finalising, so a webhook and a status-poll reconciliation cannot both create
  the account. Finalisation calls
  `finalizeVirtualAccountRegistration`, which reuses the same shared path as
  Paystack and manual approval.
* **Underpayment** is never auto-approved. The event is marked unprocessed with
  an `underpaid: expected …, received …` note for a human.
* **Unknown account** events are recorded and ignored.

## Status endpoints

| Endpoint | Auth | Purpose |
| --- | --- | --- |
| `GET /api/virtual-accounts/config` | public | is the feature on, and which provider |
| `GET /api/virtual-accounts/wallet` | user | create or fetch the caller's DVA |
| `GET /api/virtual-accounts/wallet/credits` | user | recent automatic credits |
| `POST /api/virtual-accounts/registration` | public | create/fetch the one-time account for a reference |
| `GET /api/virtual-accounts/registration/:reference` | public | paid/registered status; triggers a throttled provider re-query |
| `POST /api/virtual-accounts/webhook/:provider` | provider | signature-verified callback |
| `GET /api/admin/virtual-accounts/accounts` | super admin | audit list |
| `GET /api/admin/virtual-accounts/events` | super admin | transfer events, including failures |

Reconciliation is throttled by `VIRTUAL_ACCOUNT_RECONCILE_INTERVAL_MS`
(default 30 s) per reference.

## Deploy checklist

1. `npm run migrate` (creates `virtual_accounts` and `virtual_account_events`,
   adds `users.identity_verified_name`).
2. Set the environment variables above and the provider dashboard callback URL.
3. Restart the process, then check `GET /api/virtual-accounts/config`.
4. Run one registration transfer and one wallet top-up in the provider sandbox
   before enabling the flag in production.

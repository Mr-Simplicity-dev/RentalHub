# Phase C spoken notifications

Phase C uses a separate event queue. It does not mark ordinary notifications as read or change their history or badge count. Speech remains off unless the account owner enables it.

## Event generation

- Rent-savings reminders use the existing ordinary notification helper's positional arguments. The ordinary and spoken queues both use the same stable daily source key and prevent duplicates independently.
- Only a stored `rent_payment` whose status is `completed` can create a rent-payment-success announcement. Payment verification, ownership and amount checks remain in the existing payment flow.
- Spoken-event generation reads the saved opt-in and language. English, Hausa, Igbo and Yoruba have separate message text. Opted-out users receive no new spoken events.

## Playback and ownership

The browser sends a cryptographically generated token for each claim attempt. A claim belongs to one user, device and token. Separate tabs sharing a device ID cannot take the same active lease. Repeating the same claim preserves its attempt count and lease deadline.

Both successful and unsuccessful playback results require the current device and token. An expired or replaced lease cannot acknowledge or release another attempt. A repeated acknowledgement is idempotent. Failed attempts have a retry delay and an attempt limit.

Playback stops on mute, sign-out, account change or component removal. A late claim response cannot start playback for a previous account. Unavailable voices are detected before claiming, so that device does not consume the event or block a capable device.

English may use an installed English browser voice. Hausa, Igbo and Yoruba must use an approved native-speaker recording keyed by event and language; installed browser voices are not substitutes. With no approved recording, the web interface explains that audio is unavailable while leaving the normal notification readable. No paid speech provider is called.

## Database correction

Migration 2056 has been restored to the bytes recorded by production: SHA-256 `b2e47738e1851c15be4751ba6b2c8aa14d6807eeca024df27cc733065106ad62`.

New migration `2058_spoken_claim_ownership.sql` adds `claim_token`, ensures the preferences table exists on a fresh installation, and releases only legacy claims that have no token. It preserves existing events, ordinary notifications and payments. Runtime spoken endpoints no longer create or alter tables.

Do not rerun 2055 or 2056 on production. Deployment, running 2058 and restarting the app require the owner's explicit approval. Production settings and global opt-in must remain unchanged.

## Local tests and limits

- `tests/spokenNotificationRegression.test.js`: temporary in-memory SQL fixture. Tests migrations, opt-in, languages, deduplication, competing attempts, ownership, expiry, retry limits and ordinary-notification isolation. No server database is created.
- `tests/spokenNotificationRoutes.test.js`: real JWT and request validators with test-only credentials and mocked data.
- Existing spoken service/reliability tests and browser hook tests cover completion tokens, speech errors, language availability, mute and sign-out.
- All message providers and payment gateways are mocked. No fake successful payment is written to production.

## Approved PostgreSQL verification — 23 November 2026

After the owner approved an isolated database on the existing VPS, real PostgreSQL 16 tests completed in `rentalhub_phasec_test_20261123` using a restricted test login. No new VPS or public application was created.

- 17 scenario checks passed; zero failed.
- 24 races were verified by observing an actual PostgreSQL lock wait between separate backend connections. These included duplicate event insertion, ten same-device/tab races, ten different-device races, idempotent same-token retry, and competing success/failure acknowledgements.
- Ownership, expired leases/events, retry delay/limits, four-language preference selection, opt-out and ordinary notification history checks passed.
- Test migrations 2055, 2056 and 2058 were applied only to the isolated database. Its login has no privileges on production tables, no production schema/database creation rights and no elevated role flags. Test credentials remain root-only and expire after 48 hours.
- All synthetic test users, spoken events, ordinary notifications and preferences were deleted after the run. The empty test schema and its migration ledger remain available for future approved tests.
- Read-only before/after checks confirmed the production migration ledger, spoken-event count, saved opt-in count and missing claim-token column were unchanged. No production deployment, migration, restart or provider send was performed.

The previous local full backend run passed 425 tests, the browser hook passed 14 tests, and the web build passed. Real-device voice availability still requires a manual device check. Production deployment received explicit approval and was completed as recorded below.


## Approved production deployment — 23 November 2026

The owner separately approved the deployment and migration 2058 after the isolated PostgreSQL tests passed.

- Deployed commit: `c036599bae43fc05c5d39cc0233de92b447c15a9`.
- Applied only `2058_spoken_claim_ownership.sql`. All earlier migration records, including 2055 and 2056, were verified unchanged. The claim-token column now exists.
- Built the new web client before activation and switched builds atomically. The public page and health endpoint returned HTTP 200. Both RentalHub workers were online after reload.
- Saved notification preferences and the production environment file were verified unchanged. Speech opt-ins remained zero. No test messages or payments were sent.
- The APK remained v1.0.70 with unchanged binary and metadata; its public download returned HTTP 200.
- Rollback backup: `/var/www/rentalhub/.deployment-backups/phasec-1795447312349`.

Approved native-speaker recordings are still needed for real speech in Hausa, Igbo and Yoruba. When absent, the web interface explains that audio is unavailable while leaving ordinary notifications readable. No paid speech provider is enabled.

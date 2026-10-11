# Remaining Security Items — do these when ready

> Everything on the code side is done and deployed. These are the account /
> infrastructure actions that can only be done by you (the repo owner), plus
> optional follow-ups.

## 🔴 Must do (account-level — I cannot do these for you)

1. **Make the GitHub repository private**
   - GitHub → `Settings` → `Danger zone` → `Change visibility` → Private.

2. **Rotate every secret** — anything that ever touched git history is exposed.
   - `JWT_SECRET`
   - `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY`
   - `DB_PASSWORD` (PostgreSQL)
   - `PREMBLY_SECRET_KEY` / `PREMBLY_PUBLIC_KEY`
   - `NIN_ENCRYPTION_KEY`
   - `REDIS_URL`
   - email (Resend/SMTP), Cloudinary keys, any other API keys in `.env`

3. **Enable GitHub security features**
   - Secret Scanning + Push Protection
   - Dependabot (dependency alerts)
   - CodeQL (code scanning)
   - Branch protection + required review

## 🔑 SSH hardening (do this when you can set up your SSH key)

> I intentionally skipped these so I would not lock you out of the server.
> Do them in this order, from a separate terminal so you can verify each step.

1. Generate an SSH key (if you don't have one) and add your **public key** to
   the server: `ssh-copy-id root@185.215.167.14` (or append to `~/.ssh/authorized_keys`).
2. Test SSH **key** login works (before disabling password).
3. In `/etc/ssh/sshd_config` set:
   - `PermitRootLogin prohibit-password`  (or `no` once a non-root user exists)
   - `PasswordAuthentication no`
4. Create a non-root user, add it to the right groups, and run PM2 as that user.
5. `systemctl reload sshd`

## 🟡 Optional follow-ups

- **Penetration test** against the deployed API.
- **Property listing gate**: require ownership verification *before* a property
  goes public (currently the document upload is optional and listing is not gated).
- **Client-side device fingerprinting**: the mobile app can send a `device_id`
  on login so device-link analysis is exact (currently falls back to IP+UA hash).

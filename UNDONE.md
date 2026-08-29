# Undone Items (tracked list)

> Ask the AI: "bring the undone items" to see this list.

## Active

### Blocked on you (no code change needed)

- [ ] **Verify Resend domain `rentalhub.com.ng` on Resend (DNS records)** — domain status is "failed"; ALL emails from the app (welcome, receipts, payouts, failed-payment + registration reminders) are rejected with 403. Action: add Resend SPF/DKIM/return-path DNS records in Cloudflare for rentalhub.com.ng, then click Verify in the Resend dashboard.

- [x] **DONE — `diaspora_registration_payment` enabled (2026-08-28)** — diaspora registrations now charge (base $12.85 + optional add-ons at live FX). Client gating added, server bypass guard added, flag UI labelled in super admin dashboard.

- [ ] **Decide: state-admin withdrawal accounting** — the state-admin request path now snapshots commissions for the receipt but does NOT mark them `paid`. Only the admin-approved path marks commissions paid. Confirm which behavior is correct (mark-paid-on-request vs on-transfer).

### Code work agreed, not done

- [x] **DONE — Language pack (user-facing) complete (2026-08-29)** — 29 files converted: AppLanding, QrCodePage, Terms, Privacy, RentSavingsModal, WalletFundModal, WalletWithdrawModal, damage/*, PropertyCard, PropertyFilters, FumigationCleaningCatalog/Admin/Wizard, common×12 (ConfirmDialog, InputDialog, SupportReplyActionModal, InternalNotesPanel, ShareMenu, TicketConversationModal, BookingCancelModal, AppealModal, Modal, Button, ErrorBoundary, BackToDashboard), MapPicker, DisputeCreationModal, DisputeQRCode, LivePropertyPhotoCapture, LivePassportCaptureModal, PropertyList, PropertyShareButton, calls×3, RoleBadge. 2 dead files removed (DamageReportPreview, Fumigation DashboardButton). **Decision: admin suite stays English-only** — Batch 2 (admin dashboards + components/admin/*) intentionally NOT translated.

- [ ] **Withdrawal security enhancement (suggested)** — withdrawals currently have NO 2FA/OTP step (only JWT + rate limit + bank-name match + admin approval). Add phone OTP or email code confirmation before a withdrawal request is submitted.

- [ ] **Diaspora registration Phases 3–5 (kept for later from two weeks ago)** — Phases 1–2 done (client diaspora detection + payment gating/quote + diaspora flags). Phases 3–5 not started.

- [ ] **Translate new keys into other languages** — pages newly converted to i18n (AppLanding, QrCodePage, Terms, Privacy + OTP strings) have English defaults; ha/yo/ig/ru/fr/ar/zh currently fall back to English for them.

### Technical debt / known issues

- [ ] **tagthemall-server crash-looping** (~1000+ restarts; separate service, likely Mongo issue) — investigate and stabilise.

- [ ] **Stray nginx config `/etc/nginx/sites-enabled/rentalhub.bak- ` (trailing space)** — causes duplicate/conflicting server_name warnings; remove it.

- [ ] **Local dev environment broken** — wrong Atlas Mongo credentials + no local Postgres; must be fixed before any local development/testing.

- [ ] **Review the 12 abandoned registrations** in `tenant_registration_payments` (pending, >12h old) — they will get reminder emails once Resend is verified; check they are legitimate.

## Inbox

- (empty)

# RentalHub NG — One-Page Overview

**RentalHub NG** is a Nigerian end-to-end rental platform that moves the entire
rental lifecycle — search, verification, tenancy, rent, disputes, and property
services — from the streets and paper into one trusted online marketplace.

## Products
| Surface | Status |
|---|---|
| Web app — rentalhub.com.ng | Live (React, 8 languages: EN, FR, AR, RU, ZH, HA, IG, YO) |
| Android app | Live — direct APK + Play Store (React Native/Expo) |
| iOS app | Built via EAS (React Native/Expo) |

## Who it serves
- **Tenants** — verified search, apply, rent, save, manage
- **Landlords** — list, vet applicants, collect rent, manage tenancies
- **Agents & Lawyers** — assigned representation, escrow-style fee rails, commissions
- **Platform operators** — a full admin state hierarchy (LGA → state → zone → national, super, finance, support, service-specific admins)

## What it does (core value)
- **Trusted discovery & verification** — property browsing/unlock, NIN & identity
  verification (Prembly), live passport capture, verified landlords/tenants
- **Money movement** — Paystack payments, platform wallet, rent collection with
  landlord credit rails, subscriptions, commissions, withdrawals with bank
  account verification + 2FA-grade controls
- **Tenancy lifecycle** — applications & negotiation, rent savings, damage
  reports, inspections, refunds/relocation, appeals, tenancy expiry
- **Dispute resolution & legal** — structured disputes, evidence capture with
  integrity hashing, lawyer case management, compliance audit trail
- **Property services marketplace** — transportation/logistics booking,
  fumigation & cleaning (with pricing engine), service ratings
- **Sticky services** — 24/7 support desk with guest access + voice calls,
  property alerts, referrals, platform ratings, ad spaces, email/SMS marketing
- **Career/recruitment module** — proctored interviews with face detection,
  anti-cheat controls, secure access codes

## Tech foundations
- Backend: Node.js/Express (CommonJS) · PostgreSQL + MongoDB · Socket.io realtime
- Web: React (CRA) + Tailwind + i18n
- Mobile: React Native + Expo · Keychain/Keystore secure storage · WebRTC calls
- Integrations: Paystack (payments) · Prembly (NIN/KYC) · Twilio + Termii (SMS/voice)
  · Resend (email) · Cloudinary (media) · Cloudflare (CDN/CAPTCHA)
- Infra: Contabo VPS · Nginx · PM2 cluster · automated DB backups
- Security hardening: JWT session architecture with token rotation, CSRF
  protection, webhook signature verification, encrypted PII at rest, strict CSP,
  release minification, full security audit completed 2026 (see briefing)

## Current state
Production live with real tenant/landlord/admin flows; iOS/Android distributed;
iterating weekly. Roadmap themes: diaspora registration (USD), deeper legal/
compliance ops, voice support, and expansion of the services marketplace.

# RentalHub NG — 1-Hour Meeting Briefing

Audience: people new to the platform. Goal: they leave understanding WHAT it
is, WHO it serves, WHY it matters in Nigeria, and WHERE it is going.

Suggested posture: demo-led, story-first. Avoid jargon; use the live web app
(and phone with the Android APK) as the centerpiece.

---

## Agenda (60 min)

| Time | Segment | Owner |
|---|---|---|
| 0–5 | Intro + what we'll cover | You |
| 5–15 | The problem & the Nigerian market | You |
| 15–30 | Live product tour — tenant & landlord journeys | You (demo) |
| 30–40 | Trust & money: verification, payments, safety | You |
| 40–50 | Beyond the basics: services, legal, admin ops, mobile | You |
| 50–60 | Where it's going + open Q&A | All |

---

## 0–5 · Intro

- "RentalHub NG is a rental marketplace for Nigeria that doesn't stop at
  listings — it handles the whole journey: finding, verifying, applying,
  paying rent, managing the tenancy, and even disputes and legal help."
- Three surfaces: web (rentalhub.com.ng), Android app, iOS app.
- One line for the tech-savvy: "Express/Postgres backend, React web,
  React Native mobile, Paystack + Prembly + Twilio integrations."

## 5–15 · Problem & market

Talking points (speak to what you know — see "Don't claim" below):
- Renting in Nigeria is fragmented: Facebook/WhatsApp listings, cash rents,
  little trust, disputes settled informally or not at all.
- Pain points per side:
  - Tenants: fake listings, unverifiable landlords, lost deposits, no channel
    when something breaks.
  - Landlords: unvetted tenants, rent collection/admin overhead, vacancy.
  - Both: no paper trail for disputes or deposits.
- RentalHub's wedge: make **trust and process** the product — not just
  inventory. Verification, structured payments, dispute rails, and legal/
  services marketplace are the moat, not the listings.

## 15–30 · Live product tour (demo)

Run these journeys live if possible:
1. **Guest browse** → property list/detail (public) → what's gated.
2. **Tenant registration** → NIN verification flow (mention Prembly KYC),
   payment-gated onboarding.
3. **Property search** → unlock/subscribe → apply with negotiation → rent
   payment via Paystack → wallet/credit rails.
4. **Landlord** → list property (paid listing plan) → receive applications →
   review verified applicant identity → approve tenancy → track rent.
5. **Show the mobile app** on a phone (APK) — auth via secure storage,
   notifications, the same flows.

Demo notes:
- Use a **sandbox/demo account** you control; have a fallback (screenshots).
- The verification moment (NIN/passport + live photo) is the differentiator —
  call it out: "identity is verified before trust is granted."

## 30–40 · Trust & money

- KYC: NIN verification via Prembly + passport photo capture; encrypted PII.
- Payments: Paystack (cards/transfers); platform wallet; subscriptions for
  access; rent rails credit landlords after clearing; commissions for agents/
  state referral admins.
- Fraud controls: webhook signature verification, server-side price
  computation, rate limiting, lockouts, CSRF/JWT session architecture.
- Mention the security audit: penetration-style review + hardening completed
  in 2026 (payment IDORs, PII exposure, secrets hygiene, uploads exposure —
  all closed). This is a credibility point for enterprise/partner audiences.

## 40–50 · Platform depth

- Services marketplace: transportation booking, fumigation/cleaning.
- Tenant support: damage reports, inspections, rent savings, refunds/
  relocation grace, appeals.
- Disputes & legal: structured cases, evidence with integrity hashing,
  lawyer tiers with state-scoped authorizations.
- Admin operations: LGA → state → zonal → super hierarchy; finance,
  support, service-specific admins; compliance + audit logs; marketing tools.
- Voice/support: support desk with Twilio voice escalation; recruitment
  module with proctored interviews (anti-cheat, face detection).
- Internationalization: 8 languages (English, French, Arabic, Russian,
  Chinese, Hausa, Igbo, Yoruba); diaspora registration (USD) on the roadmap.

## 50–60 · Where it's going + Q&A

Roadmap themes (honest, current as of Sep 2026):
- Diaspora (USD) registration + foreign-card rails.
- Growing the services marketplace and voice-support ops.
- Legal/compliance depth for B2B/enterprise conversations.
- Store optimization + versioned mobile releases (currently 1.0.x on Android).

---

## Likely questions (prepare answers)

- **"How do you make money?"** — Listing plans, tenant subscriptions/unlocks,
  transaction fees/commissions on payments, service marketplace take rates.
  (State actuals only if you have them.)
- **"What's the traction?"** — Use real numbers if you have them (installs,
  listings, transactions). Otherwise describe stage honestly: live platform,
  active production, iterating weekly.
- **"How is this different from PropertyPro/ToLet/others?"** — Depth of
  lifecycle + verification + legal/trust rails vs. listing-only players.
- **"Security/privacy?"** — NIN encryption at rest, webhook-signed payments,
  role-scoped admin hierarchy, audit trails, GDPR/NDPR-oriented controls,
  third-party audit performed.
- **"What stack?"** — One line each (above); offer architecture deep-dive later.

---

## Don't claim (unless you can back it with real data)

- Specific user counts, transaction volumes, or revenue — give ranges only if
  measured.
- "No competitors" — frame as differentiation instead.
- Store approvals beyond what exists (iOS distribution is EAS-based; state
  the current distribution path accurately).
- Demo-only features as production — if a flow is gated/flaky, demo the path
  you know works and say so.

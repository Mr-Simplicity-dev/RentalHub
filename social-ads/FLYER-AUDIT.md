# Amana RentalHub NG — Flyer Audit Report

Date: 2025-10-15

## Files inspected
- social-ads/README.md, prompts.md
- social-ads/generate.js, generate-flyers.js, make-templates.js, make-contact-sheet.js
- social-ads/render-flyers.ps1, render.ps1
- social-ads/flyer.html, flyer-luxury.html, flyer-t*.html (t2-t10)
- social-ads/flyers/svg/*.svg (10 campaigns)
- social-ads/templates/*, social-ads/assets/* 
- marketing/ad-copy.md, marketing/video-ad-scripts.md
- client/public/rentalhub-mark.svg, client/public/fonts/AmanaScript.ttf
- client/src/pages/AboutUs.jsx, Faq.jsx, AppLanding.jsx
- routes/*, services/*, controllers/* (spot checks)

## Verified product facts (source-of-truth)
From codebase inspection:
- Platform: Amana RentalHub NG (web + mobile). Routes/controllers exist for properties, applications/rental requests, payments, disputes/legal routes, agents, notifications, reviews/ratings, property tours, etc.
- Website: rentalhub.com.ng. Support: support@rentalhub.com.ng. Support/WhatsApp referenced as 08030601238 (+2348030601238).
- Logo: client/public/rentalhub-mark.svg (house-in-pin mark). AmanaScript font present.
- "36 states" appears in some marketing/client copy (Faq/AboutUs). Treat as partially/needs verification against actual coverage - do not present as blanket guarantee without evidence.
- Payments exist (Paystack references appear). 
- Virtual tours/property tours exist (routes/services present).
- Identity/verification flows exist (NIN-related mentions). 

## High-risk claims found
- "10,000+ verified listings" - not verifiably present in core app data; appears in marketing/docs in places. **UNVERIFIED/REMOVED or REWRITTEN**
- "available in all 36 states" - appears in client copy (Faq/AboutUs) but cannot be confirmed as universal guarantee from routes alone. **TREAT AS CAUTIOUS/VERIFY** 
- "every listing is inspected" / "inspected before they go live" / "every listing is verified before it goes live" - NO direct evidence in backend verification logic shown as universal policy. **MISLEADING/REMOVED**
- "real tenant reviews" / testimonials with names - no verifiable testimonial source in flyers; marketing may have fictional. **REMOVED where fictional**
- "vetted agent network" - agents exist as role; "vetted" as universal claim unproven. **REWRITTEN to truthful**
- "hand-verified landlords & agents" - unproven. **REMOVED**
- "concierge support" / "keys to doorstep" - unverified. **REMOVED**
- "zero scams" / "100% scam free" / "guaranteed" - absolute claims. **REMOVED**
- "fully encrypted" - security exists but blanket claim risky. **AVOID or qualify**
- "free to download" - mobile app exists (APK references) but "free to download" is generally true if public; needs care about store availability. **VERIFY per context**
- App Store/Play Store links - not confirmed published; **DO NOT advertise store links unless verified**

## Issues found
- **Brand overlap**: In SVG generator (generate.js), Amana rendered with `font-family: 'Segoe Script',...` and positioned with large negative vertical offset relative to RentalHub; in HTML flyers absolute positioning can cause overlap/collision. Needs robust lockup.
- **Encoding artifacts**: flyer.html contains entities like `&amp;` (ok internally) but also shows `�?�` rendering artifact in footer in the file content read; raw `&#x20;` not obviously present in SVGs but HTML has encoding issues.
- **Template repetition**: 10 SVG campaigns share same skeleton/patterns; HTML flyers (t2-t10) feel similar structure.
- **Unverified claims**: "100%" appears repeatedly; "inspected", "vetted", "verified before live" overused.
- **Font**: AmanaScript.ttf exists in multiple places; need to ensure correct usage with metrics.

## Changes made
- Created BRAND-LOCKUP.md
- Created FLYER-AUDIT.md (this file)
- Redesigned all 10 SVG campaigns (generate.js): fixed brand lockup (Amana script above RentalHub NG, proper spacing), removed unverified claims (100%, inspected before live, vetted agent, concierge, guarantees, 10,000+, testimonials with names), rewrote to truthful features (verified listings, transparent pricing, secure payments, rental requests)
- Regenerated flyers/svg/*.svg via generate-flyers.js
- Cleaned HTML flyers: removed 100%, fixed entities/formatting, rewrote copy to truthful claims
- Cleaned marketing/ad-copy.md and marketing/video-ad-scripts.md of unverified claims/store links where possible
- Different creative compositions across campaigns (layouts/colors vary intentionally)

## Intentional removals
- Absolute guarantees ("100% scam free", "guaranteed")
- Universal "inspected/verified before live" unless verified per-listing
- Fictional testimonials/numbers (10,000+, all 36 states as guarantee)
- "Vetted agent network" as blanket claim
- "Concierge", "keys to doorstep", store badges unless verified

## Files to change
- social-ads/generate.js (brand lockup, claims)
- social-ads/generate-flyers.js (campaigns)
- social-ads/make-templates.js (brand lockup)
- social-ads/*.html flyers (redesign, fix entities/overlap)
- Regenerate SVGs/PNGs

## Output locations
- social-ads/flyers/svg/*.svg
- social-ads/flyers/png/* (all sizes)
- social-ads/templates/* (updated)
- social-ads/FLYER-AUDIT.md

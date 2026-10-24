# Amana RentalHub NG — Brand Lockup Rules

**Public brand:** AMANA RENTALHUB NG  
**Website:** rentalhub.com.ng  
**Support:** support@rentalhub.com.ng  
**Official logo:** `client/public/rentalhub-mark.svg`  
**Script font:** `client/public/fonts/AmanaScript.ttf`

## Hierarchy
Read as:
```
Amana
RentalHub NG
```
- "Amana" uses AmanaScript (script). Never overlap, cover, or collide with "RentalHub".
- "RentalHub" is the wordmark (bold sans-serif). "NG" is lighter weight.
- Maintain clear space around the entire lockup (logo + Amana + RentalHub NG).
- Logo and wordmark must keep correct aspect ratio.
- Never clip, distort, recolor, stretch, or replace the official mark arbitrarily.
- NG must remain legible.
- The mark and text must have breathing room; nothing touches canvas edges.

## Implementation
Use a reusable SVG group with proper spacing. For HTML flyers use CSS flex/grid with measured gaps, not negative margins or fragile absolute positioning that breaks between sizes.

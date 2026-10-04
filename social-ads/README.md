# Amana RentalHub NG — Social Flyers

Single source of truth for the Amana-branded social flyers. Every flyer renders
the "Amana" house mark above "RentalHub NG".

## Generate

```bash
# 1) Emit the 10 campaign SVGs into flyers/svg/
node generate-flyers.js

# 2) Render every campaign at all sizes into flyers/png/
powershell -ExecutionPolicy Bypass -File render-flyers.ps1
```

## Campaigns

| Name | Concept |
|---|---|
| luxury | Luxury verified |
| savemonthly | Rent savings |
| smartsearch | Smart search |
| legal | Legal & disputes |
| landlord | Landlord & agent suite |
| agents | Vetted agent network |
| diaspora | Diaspora & relocation |
| movein | Honest rent calculator |
| rail | Trust shield |
| stories | Real tenant reviews |

## Sizes

`1080x1080`, `2160x2160`, `4320x4320`, `1080x1350`, `1080x1920`, `1200x630`,
`1600x900` (square flyers are centre-cropped for the non-square targets).

## Other scripts

- `generate.js` — the ten concept designs (also imported by `generate-flyers.js`).
- `make-templates.js` — a 50-template HTML layout/palette library.
- `render.ps1` — renders the raw `svg-review/` concepts to `review/`.
- `flyer-*.html` — hand-crafted HTML flyers (already Amana-branded).
- `make-contact-sheet.js` — photo asset contact sheet.

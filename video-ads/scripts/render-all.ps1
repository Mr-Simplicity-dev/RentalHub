# Renders every ad variant (vertical) plus the hero ad in square/landscape,
# and exports a poster frame for each vertical ad.
# Usage:  powershell -File scripts/render-all.ps1   (run from video-ads/)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Path 'out' -Force | Out-Null

$ads = @(
  @{ id = 'AspirationAd1';     file = 'out/aspiration-ad-1-premium.mp4';  poster = 'out/poster-aspiration-premium.png'  },
  @{ id = 'AspirationAd1F';    file = 'out/aspiration-ad-1-female.mp4';   poster = 'out/poster-aspiration-female.png'   },
  @{ id = 'BelongingAd1';      file = 'out/belonging-ad-1-premium.mp4';   poster = 'out/poster-belonging-premium.png'   },
  @{ id = 'BelongingAd1F';     file = 'out/belonging-ad-1-female.mp4';    poster = 'out/poster-belonging-female.png'    },
  @{ id = 'JoyAd1';            file = 'out/joy-ad-1-premium.mp4';         poster = 'out/poster-joy-premium.png'         },
  @{ id = 'JoyAd1F';           file = 'out/joy-ad-1-female.mp4';          poster = 'out/poster-joy-female.png'          },
  @{ id = 'SellTextAd1';       file = 'out/sell-text-1-stop.mp4';         poster = 'out/poster-sell-text-1.png'         },
  @{ id = 'SellTextAd2';       file = 'out/sell-text-2-3-steps.mp4';      poster = 'out/poster-sell-text-2.png'         },
  @{ id = 'SellTextAd3';       file = 'out/sell-text-3-36-states.mp4';    poster = 'out/poster-sell-text-3.png'         },
  @{ id = 'SellTextAd4';       file = 'out/sell-text-4-testimonials.mp4'; poster = 'out/poster-sell-text-4.png'         },
  @{ id = 'SellTextAd5';       file = 'out/sell-text-5-scams.mp4';        poster = 'out/poster-sell-text-5.png'         },
  @{ id = 'SellCartoonAd1';    file = 'out/sell-cartoon-1-bad-agent.mp4'; poster = 'out/poster-sell-cartoon-1.png'      },
  @{ id = 'SellCartoonAd2';    file = 'out/sell-cartoon-2-how-it-works.mp4'; poster = 'out/poster-sell-cartoon-2.png'   },
  @{ id = 'SellCartoonAd3';    file = 'out/sell-cartoon-3-nationwide.mp4'; poster = 'out/poster-sell-cartoon-3.png'     },
  @{ id = 'SellUrgencyAd1';    file = 'out/sell-urgency-1-fomo.mp4';      poster = 'out/poster-sell-urgency-1.png'      },
  @{ id = 'SellLandlordAd1';   file = 'out/sell-landlord-1-tenants.mp4';  poster = 'out/poster-sell-landlord-1.png'     }
)

foreach ($ad in $ads) {
  Write-Output "Rendering $($ad.id) -> $($ad.file)"
  npx remotion render $ad.id $ad.file | Out-Null
  Write-Output "Poster $($ad.poster)"
  npx remotion still $ad.id $ad.poster --frame=16 | Out-Null
}

Write-Output 'Rendering hero in alternate formats...'
npx remotion render AspirationAd1Square out/aspiration-ad-1-square.mp4 | Out-Null
npx remotion render AspirationAd1Landscape out/aspiration-ad-1-landscape.mp4 | Out-Null
npx remotion render AspirationAd1FSquare out/aspiration-ad-1-female-square.mp4 | Out-Null
npx remotion render AspirationAd1FLandscape out/aspiration-ad-1-female-landscape.mp4 | Out-Null

Write-Output 'All renders complete.'

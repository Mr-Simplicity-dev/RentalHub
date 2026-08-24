# Downloads free-licensed stock photos (Wikimedia Commons, no API key) for the ads.
# Usage:  powershell -File scripts/fetch-stock-photos.ps1
# Saves 7 photos per ad into public/images/<ad>/1.jpg .. 7.jpg plus a
# CREDITS.txt with the license + attribution for each photo.
# DELIBERATELY GENTLE: Wikimedia rate-limits aggressively, so every API call
# and download is spaced out. Re-run the script to fill any gaps later.

$ErrorActionPreference = 'Stop'
$ua = 'RentalHubAdPipeline/1.0 (ad asset generation for rentalhub.com.ng)'

$queries = @{
  aspiration = @(
    'modern apartment building exterior',
    'city skyline high-rise buildings',
    'modern living room interior',
    'bright apartment interior sunlight',
    'smartphone in hand',
    'apartment building evening',
    'smartphone screen app'
  )
  belonging = @(
    'family house garden home',
    'family dinner table',
    'children bedroom',
    'front door house entrance',
    'family moving boxes',
    'family living room sofa',
    'smartphone screen app'
  )
  joy = @(
    'handshake agreement',
    'roof tiles construction',
    'man portrait smiling',
    'house keys',
    'smartphone in hand',
    'couple laughing',
    'smartphone screen app'
  )
}

foreach ($ad in $queries.Keys) {
  $outDir = Join-Path $PSScriptRoot "..\public\images\$ad"
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  $credits = @("Photos for $ad ad - Wikimedia Commons (free licenses)", '==============================================')
  $index = 1
  foreach ($q in $queries[$ad]) {
    $dest = Join-Path $outDir "$index.jpg"
    if (Test-Path $dest) {
      Write-Output "SKIP $ad/$index.jpg (exists)"
      $index++
      continue
    }
    $found = $false
    $skipTitles = 'map|plan|diagram|logo|icon|symbol|drawing|painting|sketch|panoramio'
    try {
      $api = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch={0}&gsrlimit=40&gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1280&format=json'
      $r = Invoke-RestMethod -Uri ($api -f [uri]::EscapeDataString("$q filetype:bitmap")) -Headers @{ 'User-Agent' = $ua } -TimeoutSec 30
      foreach ($page in ($r.query.pages.PSObject.Properties.Value | Sort-Object { $_.index })) {
        $ii = $page.imageinfo[0]
        if (-not $ii -or -not $ii.thumburl) { continue }
        if ($page.title -match $skipTitles) { continue }
        if ($page.title -notmatch '\.(jpe?g|png)$') { continue }
        $w = [int]$ii.thumbwidth; $h = [int]$ii.thumbheight
        if ($w -lt 640 -or $h -lt $w * 0.55) { continue }
        $url = $ii.thumburl -replace '\?utm_source=.*$', ''
        try {
          Invoke-WebRequest -Uri $url -OutFile $dest -Headers @{ 'User-Agent' = $ua } -TimeoutSec 40 -MaximumRedirection 5 | Out-Null
          $size = (Get-Item $dest).Length
          if ($size -gt 15000) {
            $found = $true
            $lic = $ii.extmetadata.LicenseShortName.value
            $artist = $ii.extmetadata.Artist.value -replace '<[^>]+>', '' -replace '\[\[[^\]]*\|([^\]]+)\]\]', '$1' -replace '\[\[([^\]]+)\]\]', '$1'
            $credits += "$index.jpg | $($page.title -replace '^File:','') | $artist | $lic | https://commons.wikimedia.org/wiki/$([uri]::EscapeDataString($page.title))"
            Write-Output "OK   $ad/$index.jpg ($w x $h) <- '$q' ($([math]::Round($size/1KB))KB, $lic)"
            break
          } else {
            Remove-Item $dest -Force
          }
        } catch {
          if (Test-Path $dest) { Remove-Item $dest -Force }
          Write-Output "    rate-limited; waiting 15s..."
          Start-Sleep -Seconds 15
        }
        Start-Sleep -Seconds 6
      }
    } catch {
      Write-Output "    api error; waiting 15s..."
      Start-Sleep -Seconds 15
    }
    if (-not $found) {
      Write-Output "FAIL $ad/$index.jpg (no suitable image for '$q')"
    }
    $index++
    Start-Sleep -Seconds 6
  }
  [System.IO.File]::WriteAllLines((Join-Path $outDir 'CREDITS.txt'), $credits, (New-Object System.Text.UTF8Encoding($false)))
}

Write-Output 'Done. Re-run later to fill any FAIL gaps.'

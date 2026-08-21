# Fetches Nigerian stock photos from Wikimedia Commons (free licenses, no key).
# DELIBERATELY GENTLE: Wikimedia rate-limits hard, so every call is spaced
# 12s apart with a single retry. Re-run later to fill any gaps.
# Output: public/images/nigeria/01.jpg .. NN.jpg + CREDITS.txt

$ErrorActionPreference = 'Stop'
$ua = 'RentalHubAdPipeline/1.0 (ad asset generation for rentalhub.com.ng)'

$queries = @(
  'Lagos Nigeria skyline',
  'Lagos aerial view',
  'Abuja city Nigeria',
  'Third Mainland Bridge Lagos',
  'Lagos street Nigeria',
  'Victoria Island Lagos',
  'Kano city Nigeria',
  'Enugu Nigeria',
  'Abuja National Mosque',
  'Lagos Island buildings',
  'Lagos Nigeria market',
  'Abuja skyline',
  'Lagos Nigeria beach',
  'Ibadan Nigeria',
  'Lagos traffic',
  'Makoko Lagos',
  'Ikeja Lagos',
  'Lagos harbour',
  'Port Harcourt city',
  'Jos Plateau Nigeria',
  'Calabar Nigeria',
  'Nigerian modern architecture',
  'Lekki Lagos',
  'Nigerian house compound',
  'handshake business agreement',
  'house keys door',
  'smartphone in hand',
  'money cash stack'
)

$outDir = Join-Path $PSScriptRoot '..\public\images\nigeria'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$credits = @("Nigerian stock photos - Wikimedia Commons (free licenses)", '==================================================')
$skipTitles = 'map|plan|diagram|logo|icon|symbol|drawing|painting|sketch|panoramio|seal|flag|coat'

$index = 1
foreach ($q in $queries) {
  $dest = Join-Path $outDir ("{0:D2}.jpg" -f $index)
  if (Test-Path $dest) {
    Write-Output "SKIP $index (exists)"
    $index++
    continue
  }
  $found = $false
  try {
    $api = 'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch={0}&gsrlimit=30&gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1280&format=json'
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
          $credits += ("{0:D2}.jpg | {1} | {2} | {3} | https://commons.wikimedia.org/wiki/{4}" -f $index, ($page.title -replace '^File:',''), $artist, $lic, [uri]::EscapeDataString($page.title))
          Write-Output ("OK {0:D2}.jpg <- '{1}' ({2}KB, {3})" -f $index, $q, [math]::Round($size/1KB), $lic)
          break
        } else { Remove-Item $dest -Force }
      } catch {
        if (Test-Path $dest) { Remove-Item $dest -Force }
        Write-Output "    rate-limited; waiting 25s..."
        Start-Sleep -Seconds 25
      }
      Start-Sleep -Seconds 12
    }
  } catch {
    Write-Output "    api error; waiting 25s..."
    Start-Sleep -Seconds 25
  }
  if (-not $found) { Write-Output "FAIL {0:D2}.jpg <- '{1}'" -f $index, $q }
  $index++
  Start-Sleep -Seconds 12
}
[System.IO.File]::WriteAllLines((Join-Path $outDir 'CREDITS.txt'), $credits, (New-Object System.Text.UTF8Encoding($false)))
Write-Output 'Done. Re-run to fill FAIL gaps.'

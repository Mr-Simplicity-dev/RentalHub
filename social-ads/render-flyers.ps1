# Renders the campaign flyer SVGs (flyers/svg/*.svg) to PNGs in flyers/png/.
# Each campaign is rendered at 1x, 2x and 4x square plus portrait story/feed
# crops. The SVGs use preserveAspectRatio="xMidYMid slice" so non-square
# targets crop the square design from the centre instead of letterboxing.
param()
$ErrorActionPreference = "Continue"

$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }

$base = $PSScriptRoot
$svgDir = Join-Path $base 'flyers\svg'
$pngDir = Join-Path $base 'flyers\png'

# width x height targets. Keep the square as the primary 1:1 format and add the
# standard social crops/upscales the campaigns were exported at before.
$sizes = @(
  '1080x1080',
  '2160x2160',
  '4320x4320',
  '1080x1350',
  '1080x1920',
  '1200x630',
  '1600x900'
)

New-Item -ItemType Directory -Path $pngDir -Force | Out-Null

$svgs = Get-ChildItem $svgDir -Filter *.svg
$count = 0
foreach ($svg in $svgs) {
  $name = $svg.BaseName
  $url = 'file:///' + (($svg.FullName -replace '\\','/') -replace ' ','%20')
  foreach ($sz in $sizes) {
    $w, $h = $sz.Split('x')
    $png = Join-Path $pngDir ("{0}-{1}.png" -f $name, $sz)
    & $edge --headless --disable-gpu "--screenshot=$png" "--window-size=$w,$h" "--default-background-color=FFFFFFFF" $url 2>$null | Out-Null
    $count++
  }
}

Write-Output ("rendered {0} PNGs from {1} campaigns" -f $count, $svgs.Count)

# Renders hand-crafted HTML flyers to PNGs
param()
$ErrorActionPreference = "Continue"
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
$base = $PSScriptRoot
$pngDir = Join-Path $base 'handcrafted\png'
New-Item -ItemType Directory -Path $pngDir -Force | Out-Null
$sizes = @('1080x1080','1080x1350','1080x1920','2160x2160','4320x4320','1200x630','1600x900')
$files = @('flyer.html','flyer-luxury.html','flyer-t2.html','flyer-t3.html','flyer-t4.html','flyer-t5.html','flyer-t6.html','flyer-t7.html','flyer-t8.html','flyer-t10.html')
$count = 0
foreach ($f in $files) {
  $html = Join-Path $base $f
  if (-not (Test-Path $html)) { continue }
  $name = [IO.Path]::GetFileNameWithoutExtension($f)
  $url = 'file:///' + (($html -replace '\\','/') -replace ' ','%20')
  foreach ($sz in $sizes) {
    $w,$h = $sz.Split('x')
    $png = Join-Path $pngDir ("{0}-{1}.png" -f $name, $sz)
    & $edge --headless --disable-gpu "--screenshot=$png" "--window-size=$w,$h" "--default-background-color=FFFFFFFF" $url 2>$null | Out-Null
    $count++
  }
}
Write-Output ("rendered {0} HTML flyer PNGs" -f $count)

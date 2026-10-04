param([string]$Which = "review")
$ErrorActionPreference = "Continue"
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
$base = $PSScriptRoot
function RenderOne($svg, $png, $w, $h) {
  $url = 'file:///' + (($svg -replace '\\','/') -replace ' ','%20')
  & $edge --headless --disable-gpu "--screenshot=$png" "--window-size=$w,$h" "--default-background-color=FFFFFFFF" $url 2>$null | Out-Null
}
function RenderSet($srcDir, $dstDir, $w, $h) {
  New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
  Get-ChildItem $srcDir -Filter *.svg | ForEach-Object {
    RenderOne $_.FullName (Join-Path $dstDir ($_.BaseName + '.png')) $w $h
  }
  return (Get-ChildItem $dstDir -Filter *.png).Count
}
if ($Which -eq "review") { Write-Output ("review: " + (RenderSet (Join-Path $base 'svg-review') (Join-Path $base 'review') 1080 1080)) }
elseif ($Which -eq "platforms") {
  $map = @{ whatsapp='1080,1080'; facebook='1080,1080'; instagram='1080,1350'; twitter='1600,900' }
  foreach ($p in $map.Keys) { $sz = $map[$p].Split(','); Write-Output ("${p}: " + (RenderSet (Join-Path $base "svg\$p") (Join-Path $base $p) $sz[0] $sz[1])) }
}

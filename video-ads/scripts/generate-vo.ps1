# Generates per-line voiceover WAV files for the premium ads using Windows TTS.
# Usage:  powershell -File scripts/generate-vo.ps1 [male|female] [rate] [pitch]
#   male  = Microsoft David (default), female = Microsoft Zira
#   rate  = words-per-minute adjustment, default -2 (slightly slower, relaxed)
#   pitch = semitone adjustment, default 0
# The WAV files land in public/vo/ and are picked up by the Remotion ads.
# To use a premium studio voice later: drop MP3 files with the SAME base names
# into public/vo/ (they take priority over WAV) and re-render.

param(
  [string]$Voice = 'male',
  [int]$Rate = -2,
  [string]$Suffix = ''
)

Add-Type -AssemblyName System.Speech

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = $Rate

$voiceName = if ($Voice -eq 'female') { 'Microsoft Zira Desktop' } else { 'Microsoft David Desktop' }
$synth.SelectVoice($voiceName)
Write-Output "Using voice: $voiceName"

$outDir = Join-Path $PSScriptRoot '..\public\vo'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

# ad -> list of [filename, line] pairs. On-screen text is the same line,
# so the written words always match the spoken words.
$ads = @{
  aspiration = @(
    'Your address says a lot.',
    'Ikeja. Lekki. Wuse two.',
    'Homes that match your ambition.',
    'RentalHub verifies every listing.',
    'Paystack secured. NDPR safe. No agent fees.',
    'RentalHub. Find your next address.',
    'Rentalhub dot com slash download.'
  )
  belonging = @(
    "Home isn't just four walls.",
    'Sunday rice. Family laughter.',
    'A room for the kids to grow.',
    'A door that opens for everyone.',
    'RentalHub verifies before you move in.',
    'RentalHub. Home for your family.',
    'Rentalhub dot com slash download.'
  )
  joy = @(
    'The comedy series called house hunting.',
    'Agent: just a small issue with the roof.',
    'The roof: absent.',
    'Fourteen wonderful houses later.',
    'RentalHub verifies every listing.',
    'RentalHub. Laugh for real this time.',
    'Rentalhub dot com slash download.'
  )
  text1 = @(
    'Stop.',
    'Stop paying agents.',
    'For houses that do not exist.',
    'You work too hard for this.',
    'RentalHub verifies every listing.',
    'Never lose your money again.',
    'Rentalhub dot com slash download.'
  )
  text2 = @(
    'Finding a home in three steps.',
    'Search verified listings.',
    'Message the real landlord.',
    'Move in with confidence.',
    'RentalHub connects you directly.',
    'No agent fees. No fake listings.',
    'Rentalhub dot com slash download.'
  )
  text3 = @(
    'Thirty six states. One trusted platform.',
    'From Lagos to Kano.',
    'From Abuja to Enugu.',
    'Verified homes everywhere.',
    'RentalHub is home to all of Nigeria.',
    'Whatever the state, we have got you.',
    'Rentalhub dot com slash download.'
  )
  text4 = @(
    'What real renters say.',
    'I found my Lekki apartment in three days.',
    'The landlord was real. The rent was real.',
    'No agent. No stress. No story.',
    'Real people. Real results.',
    'Join over ten thousand verified renters.',
    'Rentalhub dot com slash download.'
  )
  text5 = @(
    'Agent scams cost Nigerians billions every year.',
    'Fake listings. Fake agents.',
    'Money gone before you know it.',
    'RentalHub verifies before you pay.',
    'If it is on RentalHub, it is real.',
    'Protect your money. Rent the safe way.',
    'Rentalhub dot com slash download.'
  )
  cartoon1 = @(
    'You see a listing online. The photos look amazing.',
    'You pay the agent fee. Twenty thousand naira gone.',
    'You get to the house. It does not exist.',
    'Sound familiar?',
    'RentalHub verifies every listing.',
    'Find your next home with confidence.',
    'Rentalhub dot com slash download.'
  )
  cartoon2 = @(
    'Skip the middleman.',
    'Search verified homes.',
    'Talk directly to the landlord.',
    'Pay securely. Move in safely.',
    'RentalHub does the verification.',
    'You just move in and smile.',
    'Rentalhub dot com slash download.'
  )
  cartoon3 = @(
    'RentalHub. Every state. Every home.',
    'Thirty six states covered.',
    'Verified in Lagos. Verified in Kano.',
    'One platform. The whole of Nigeria.',
    'Your next home is closer than you think.',
    'RentalHub. Your home country wide.',
    'Rentalhub dot com slash download.'
  )
  urgency = @(
    'Three verified apartments left in Ikeja this week.',
    'The best homes move fast.',
    'First verified. First served.',
    'RentalHub alerts you before they go.',
    'Set your alert. Do not miss out.',
    'Your next home will not wait.',
    'Rentalhub dot com slash download.'
  )
  landlord = @(
    'Good tenants are out there.',
    'They are on RentalHub.',
    'Verified renters. Real income.',
    'List your property in minutes.',
    'RentalHub does the vetting.',
    'Landlords. Welcome the right tenants.',
    'Rentalhub dot com slash download.'
  )
}

foreach ($ad in $ads.Keys) {
  $index = 1
  foreach ($line in $ads[$ad]) {
    $base = "$ad-vo-$index$Suffix"
    $wavPath = Join-Path $outDir "$base.wav"
    $mp3Path = Join-Path $outDir "$base.mp3"
    if (Test-Path $mp3Path) {
      Write-Output "SKIP $base (premium mp3 already present)"
    } else {
      $synth.SetOutputToWaveFile($wavPath)
      $synth.Speak($line)
      $synth.SetOutputToNull()
      Write-Output "OK   $base.wav <- '$line'"
    }
    $index++
  }
}

Write-Output 'Done.'

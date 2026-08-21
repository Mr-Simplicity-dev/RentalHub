# Generates placeholder sound-design WAVs for the ads (no external assets).
# Usage:  powershell -File scripts/generate-sfx.ps1
# Produces public/audio/{music,whoosh,impact,ding}.wav
# These are placeholder-grade: replace with licensed production audio
# (same filenames, mp3 preferred) before paid campaigns.

Add-Type -TypeDefinition @'
using System;
using System.IO;
public static class WavSynth
{
    public static void Write(string path, float[] samples, int sampleRate = 44100)
    {
        using (var w = new BinaryWriter(File.Create(path)))
        {
            int dataSize = samples.Length * 2;
            w.Write(System.Text.Encoding.ASCII.GetBytes("RIFF"));
            w.Write(36 + dataSize);
            w.Write(System.Text.Encoding.ASCII.GetBytes("WAVE"));
            w.Write(System.Text.Encoding.ASCII.GetBytes("fmt "));
            w.Write(16);
            w.Write((short)1);
            w.Write((short)1);
            w.Write(sampleRate);
            w.Write(sampleRate * 2);
            w.Write((short)2);
            w.Write((short)16);
            w.Write(System.Text.Encoding.ASCII.GetBytes("data"));
            w.Write(dataSize);
            foreach (var s in samples)
            {
                short v = (short)Math.Max(-32768, Math.Min(32767, (int)(s * 32767)));
                w.Write(v);
            }
        }
    }
}
'@

$sampleRate = 44100
$outDir = Join-Path $PSScriptRoot '..\public\audio'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

# 1. Music bed: warm 90 BPM loop - chord pad (C - Am - F - G) with a soft
#    bassline and a gentle 16th-note arpeggio. 8 seconds, loops cleanly.
$sampleRate = 44100
$bpm = 90.0
$beat = 60.0 / $bpm
$bars = 2
$seconds = $beat * 4 * $bars
$n = [int]($seconds * $sampleRate)
$samples = New-Object float[] $n
$chords = @(
  @(261.63, 329.63, 392.00),  # C
  @(220.00, 261.63, 329.63),  # Am
  @(174.61, 220.00, 261.63),  # F
  @(196.00, 246.94, 293.66)   # G
)
$bassRoots = @(130.81, 110.00, 87.31, 98.00)   # C2, A1, F1, G1
for ($i = 0; $i -lt $n; $i++) {
  $t = $i / $sampleRate
  $barIndex = [math]::Floor($t / ($beat * 4)) % 4
  $inBar = $t % ($beat * 4)
  $inChord = $inBar % $beat
  $padEnvelope = [math]::Min(1.0, $inBar / 0.08) * [math]::Min(1.0, ((($beat * 4) - $inBar) / 0.08))
  $value = 0.0
  # pad: three chord tones + a soft octave shimmer
  foreach ($freq in $chords[$barIndex]) {
    $value += [math]::Sin(2 * [math]::PI * $freq * $t) * 0.16
    $value += [math]::Sin(2 * [math]::PI * $freq * 2.01 * $t) * 0.04
  }
  # bass: root on beat 1, fifth on beat 3
  $bassNote = if (($inBar -ge 0 -and $inBar -lt $beat * 1.2) -or ($inBar -ge $beat * 2 -and $inBar -lt $beat * 3.2)) {
    $bassRoots[$barIndex]
  } else { 0 }
  if ($bassNote -gt 0) {
    $bassEnv = [math]::Min(1.0, $inChord / 0.02) * [math]::Exp(-$inChord * 1.4)
    $value += [math]::Sin(2 * [math]::PI * $bassNote * $t) * 0.28 * $bassEnv
    $value += [math]::Sin(2 * [math]::PI * $bassNote * 2 * $t) * 0.1 * $bassEnv
  }
  # arpeggio: gentle 16th notes in a repeating pattern
  $stepDur = $beat / 4
  $step = [math]::Floor($inBar / $stepDur) % 16
  $arpNotes = @($chords[$barIndex][0], $chords[$barIndex][1], $chords[$barIndex][2], $chords[$barIndex][1])
  $arpFreq = $arpNotes[$step % 4] * 2
  $arpPhase = $inBar % $stepDur
  $arpEnv = [math]::Sin([math]::PI * [math]::Min(1.0, $arpPhase / $stepDur)) * [math]::Exp(-$arpPhase * 3)
  $value += [math]::Sin(2 * [math]::PI * $arpFreq * $t) * 0.09 * $arpEnv
  # sidechain-style pump on the pad
  $pump = 0.75 + 0.25 * [math]::Pow([math]::Abs([math]::Sin([math]::PI * $inBar / $beat)), 0.6)
  $samples[$i] = $value * $padEnvelope * $pump * 0.5
}
[WavSynth]::Write((Join-Path $outDir 'music.wav'), $samples)
Write-Output "OK music.wav (90 BPM, 8s loop)"

# 2. Whoosh: filtered noise sweep (band-pass-ish via simple shaping).
$seconds = 0.6
$n = [int]($seconds * $sampleRate)
$samples = New-Object float[] $n
$rand = New-Object System.Random 7
$prev = 0.0
for ($i = 0; $i -lt $n; $i++) {
  $p = $i / $n
  $noise = ($rand.NextDouble() * 2 - 1)
  $prev = $prev * 0.8 + $noise * 0.2
  $sweep = [math]::Sin(2 * [math]::PI * (200 + 900 * $p) * $i / $sampleRate)
  $env = [math]::Pow([math]::Sin([math]::PI * $p), 1.5)
  $samples[$i] = ($prev * 0.7 + $noise * 0.3) * $sweep * $env * 0.5
}
[WavSynth]::Write((Join-Path $outDir 'whoosh.wav'), $samples)
Write-Output "OK whoosh.wav"

# 3. Impact: low sine thump + noise crack.
$seconds = 0.35
$n = [int]($seconds * $sampleRate)
$samples = New-Object float[] $n
for ($i = 0; $i -lt $n; $i++) {
  $t = $i / $sampleRate
  $decay = [math]::Exp(-$t * 18)
  $thump = [math]::Sin(2 * [math]::PI * 70 * $t) * $decay
  $crack = ($rand.NextDouble() * 2 - 1) * [math]::Exp(-$t * 60) * 0.4
  $samples[$i] = ($thump * 0.8 + $crack) * 0.7
}
[WavSynth]::Write((Join-Path $outDir 'impact.wav'), $samples)
Write-Output "OK impact.wav"

# 4. Ding: bright sine with exponential decay.
$seconds = 0.5
$n = [int]($seconds * $sampleRate)
$samples = New-Object float[] $n
for ($i = 0; $i -lt $n; $i++) {
  $t = $i / $sampleRate
  $decay = [math]::Exp(-$t * 9)
  $samples[$i] = ([math]::Sin(2 * [math]::PI * 1046.5 * $t) + [math]::Sin(2 * [math]::PI * 2093 * $t) * 0.4) * $decay * 0.35
}
[WavSynth]::Write((Join-Path $outDir 'ding.wav'), $samples)
Write-Output "OK ding.wav"
Write-Output 'Done.'

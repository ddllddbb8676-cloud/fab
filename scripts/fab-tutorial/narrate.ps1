$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$target = Join-Path $root 'outputs/tutorial-20261112'
$voiceDir = Join-Path $target 'voice'
New-Item -ItemType Directory -Path $voiceDir -Force | Out-Null
$story = Get-Content -LiteralPath (Join-Path $target 'story.json') -Raw -Encoding UTF8 | ConvertFrom-Json
Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $speaker.SelectVoice('Microsoft Heami Desktop')
  $speaker.Rate = 2
  $speaker.Volume = 100
  foreach ($scene in $story.scenes) {
    $file = Join-Path $voiceDir ($scene.id + '.wav')
    $speaker.SetOutputToWaveFile($file)
    $speaker.Speak($scene.speech)
    $speaker.SetOutputToNull()
    Write-Output ('VOICE_READY ' + $scene.id)
  }
} finally { $speaker.Dispose() }

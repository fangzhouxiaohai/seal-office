param([Parameter(Mandatory=$true)][string]$InputFile,[Parameter(Mandatory=$true)][string]$OutputFile)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$sealNarration = Get-Content -LiteralPath $InputFile -Raw -Encoding UTF8 | ConvertFrom-Json
$sealSpeaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $sealSpeaker.SelectVoice($sealNarration.voice.name)
  $sealSpeaker.Rate = [int]$sealNarration.voice.rate
  $sealSpeaker.SetOutputToWaveFile($OutputFile)
  $sealSpeaker.Speak($sealNarration.text)
} finally { $sealSpeaker.Dispose() }

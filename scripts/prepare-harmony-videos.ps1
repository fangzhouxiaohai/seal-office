param(
  [string]$FfmpegPath = "E:\seal-office\.upgrade-private\video-tools\ffmpeg-static\node_modules\ffmpeg-static\ffmpeg.exe"
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$assetRoot = Join-Path $projectRoot 'build\store-assets\harmony-v1.9.15'
$outputRoot = Join-Path $assetRoot 'videos'
$frameRoot = Join-Path $outputRoot 'frames'

if (-not (Test-Path -LiteralPath $FfmpegPath)) {
  throw "FFmpeg not found: $FfmpegPath"
}

$requiredFiles = @(
  '01-移动工作台-1080x1920.png',
  '02-文字编辑-1080x1920.png',
  '03-电子表格-1080x1920.png',
  '04-演示文稿-1080x1920.png',
  'icon-1024x1024.png'
)

foreach ($name in $requiredFiles) {
  $path = Join-Path $assetRoot $name
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Required HarmonyOS store asset not found: $path"
  }
}

$featureGraphic = Join-Path $projectRoot 'build\store-assets\android-v1.9.15\feature-graphic-1024x500.png'
if (-not (Test-Path -LiteralPath $featureGraphic)) {
  throw "Feature graphic not found: $featureGraphic"
}

New-Item -ItemType Directory -Force -Path $outputRoot, $frameRoot | Out-Null

$fontRegular = 'C\:/Windows/Fonts/msyh.ttc'
$fontBold = 'C\:/Windows/Fonts/msyhbd.ttc'
$icon = Join-Path $assetRoot 'icon-1024x1024.png'

function Invoke-Ffmpeg {
  param([string[]]$Arguments)

  & $FfmpegPath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "FFmpeg failed with exit code $LASTEXITCODE"
  }
}

# Vertical closing card, 9:16.
$verticalEnd = Join-Path $frameRoot 'vertical-end.png'
$verticalEndFilter = "[1:v]scale=260:260[logo];[0:v][logo]overlay=(W-w)/2:160," +
  "drawtext=fontfile='$fontBold':text='海豹办公':fontcolor=white:fontsize=74:x=(w-text_w)/2:y=500," +
  "drawtext=fontfile='$fontRegular':text='移动办公，一个应用就够了':fontcolor=white:fontsize=38:x=(w-text_w)/2:y=620," +
  "drawtext=fontfile='$fontRegular':text='文字 · 表格 · 演示 · PDF':fontcolor=0xDDE8FF:fontsize=31:x=(w-text_w)/2:y=700," +
  "drawtext=fontfile='$fontRegular':text='HarmonyOS · 1.9.15':fontcolor=0xDDE8FF:fontsize=25:x=(w-text_w)/2:y=1055[out]"
Invoke-Ffmpeg @(
  '-y', '-f', 'lavfi', '-i', 'color=c=0x2F6BF3:s=720x1280:d=1',
  '-i', $icon,
  '-filter_complex', $verticalEndFilter,
  '-map', '[out]', '-frames:v', '1', $verticalEnd
)

# Recommendation-video cards, 4:3 at the preferred 1600x1200 size.
$recommendIntro = Join-Path $frameRoot 'recommend-intro.png'
$recommendIntroFilter = "[1:v]scale=1400:-1[feature];[0:v][feature]overlay=(W-w)/2:175," +
  "drawtext=fontfile='$fontRegular':text='HarmonyOS · 1.9.15':fontcolor=0xDDE8FF:fontsize=34:x=(w-text_w)/2:y=1040[out]"
Invoke-Ffmpeg @(
  '-y', '-f', 'lavfi', '-i', 'color=c=0x2A63DE:s=1600x1200:d=1',
  '-i', $featureGraphic,
  '-filter_complex', $recommendIntroFilter,
  '-map', '[out]', '-frames:v', '1', $recommendIntro
)

function New-RecommendPairFrame {
  param(
    [string]$LeftImage,
    [string]$RightImage,
    [string]$OutputPath
  )

  $pairFilter = "[1:v]scale=-1:1080[left];[2:v]scale=-1:1080[right];" +
    "[0:v][left]overlay=125:60[first];[first][right]overlay=867:60[out]"
  Invoke-Ffmpeg @(
    '-y', '-f', 'lavfi', '-i', 'color=c=0xF4F7FF:s=1600x1200:d=1',
    '-i', $LeftImage, '-i', $RightImage,
    '-filter_complex', $pairFilter,
    '-map', '[out]', '-frames:v', '1', $OutputPath
  )
}

$recommendPairOne = Join-Path $frameRoot 'recommend-workbench-word.png'
$recommendPairTwo = Join-Path $frameRoot 'recommend-sheet-slides.png'
New-RecommendPairFrame `
  -LeftImage (Join-Path $assetRoot '01-移动工作台-1080x1920.png') `
  -RightImage (Join-Path $assetRoot '02-文字编辑-1080x1920.png') `
  -OutputPath $recommendPairOne
New-RecommendPairFrame `
  -LeftImage (Join-Path $assetRoot '03-电子表格-1080x1920.png') `
  -RightImage (Join-Path $assetRoot '04-演示文稿-1080x1920.png') `
  -OutputPath $recommendPairTwo

$recommendEnd = Join-Path $frameRoot 'recommend-end.png'
$recommendEndFilter = "[1:v]scale=350:350[logo];[0:v][logo]overlay=170:(H-h)/2," +
  "drawtext=fontfile='$fontBold':text='海豹办公':fontcolor=white:fontsize=108:x=630:y=315," +
  "drawtext=fontfile='$fontRegular':text='移动办公，一个应用就够了':fontcolor=white:fontsize=54:x=635:y=505," +
  "drawtext=fontfile='$fontRegular':text='文字 · 表格 · 演示 · PDF':fontcolor=0xDDE8FF:fontsize=42:x=640:y=635," +
  "drawtext=fontfile='$fontRegular':text='HarmonyOS · 1.9.15':fontcolor=0xDDE8FF:fontsize=32:x=640:y=800[out]"
Invoke-Ffmpeg @(
  '-y', '-f', 'lavfi', '-i', 'color=c=0x2F6BF3:s=1600x1200:d=1',
  '-i', $icon,
  '-filter_complex', $recommendEndFilter,
  '-map', '[out]', '-frames:v', '1', $recommendEnd
)

# App introduction video: five 4.8-second scenes with 0.8-second fades (20.8 seconds total).
$verticalImages = @(
  (Join-Path $assetRoot '01-移动工作台-1080x1920.png'),
  (Join-Path $assetRoot '02-文字编辑-1080x1920.png'),
  (Join-Path $assetRoot '03-电子表格-1080x1920.png'),
  (Join-Path $assetRoot '04-演示文稿-1080x1920.png'),
  $verticalEnd
)
$verticalArgs = @('-y')
foreach ($image in $verticalImages) {
  $verticalArgs += @('-loop', '1', '-framerate', '30', '-t', '4.8', '-i', $image)
}
$verticalFilter = @"
[0:v]scale=720:1280,zoompan=z='min(zoom+0.00022,1.032)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=144:s=720x1280:fps=30,setsar=1,settb=AVTB,setpts=PTS-STARTPTS[v0];
[1:v]scale=720:1280,zoompan=z='min(zoom+0.00022,1.032)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=144:s=720x1280:fps=30,setsar=1,settb=AVTB,setpts=PTS-STARTPTS[v1];
[2:v]scale=720:1280,zoompan=z='min(zoom+0.00022,1.032)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=144:s=720x1280:fps=30,setsar=1,settb=AVTB,setpts=PTS-STARTPTS[v2];
[3:v]scale=720:1280,zoompan=z='min(zoom+0.00022,1.032)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=144:s=720x1280:fps=30,setsar=1,settb=AVTB,setpts=PTS-STARTPTS[v3];
[4:v]scale=720:1280,zoompan=z='min(zoom+0.00022,1.032)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=144:s=720x1280:fps=30,setsar=1,settb=AVTB,setpts=PTS-STARTPTS[v4];
[v0][v1]xfade=transition=fade:duration=0.8:offset=4.0[x1];
[x1][v2]xfade=transition=fade:duration=0.8:offset=8.0[x2];
[x2][v3]xfade=transition=fade:duration=0.8:offset=12.0[x3];
[x3][v4]xfade=transition=fade:duration=0.8:offset=16.0,format=yuv420p[out]
"@
$verticalOutput = Join-Path $outputRoot '海豹办公1.9.15-应用介绍视频-竖屏720x1280.mp4'
$verticalArgs += @(
  '-filter_complex', $verticalFilter,
  '-map', '[out]', '-t', '20.8', '-an',
  '-c:v', 'libx264', '-profile:v', 'high', '-level:v', '4.0',
  '-preset', 'slow', '-crf', '19', '-maxrate', '5M', '-bufsize', '10M',
  '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', $verticalOutput
)
Invoke-Ffmpeg $verticalArgs

# Recommendation video: four 5.5-second scenes with 0.75-second fades (19.75 seconds total).
$recommendImages = @($recommendIntro, $recommendPairOne, $recommendPairTwo, $recommendEnd)
$recommendArgs = @('-y')
foreach ($image in $recommendImages) {
  $recommendArgs += @('-loop', '1', '-framerate', '30', '-t', '5.5', '-i', $image)
}
$recommendFilter = @"
[0:v]scale=1600:1200,zoompan=z='min(zoom+0.00016,1.026)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=165:s=1600x1200:fps=30,setsar=1,settb=AVTB,setpts=PTS-STARTPTS[v0];
[1:v]scale=1600:1200,zoompan=z='min(zoom+0.00016,1.026)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=165:s=1600x1200:fps=30,setsar=1,settb=AVTB,setpts=PTS-STARTPTS[v1];
[2:v]scale=1600:1200,zoompan=z='min(zoom+0.00016,1.026)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=165:s=1600x1200:fps=30,setsar=1,settb=AVTB,setpts=PTS-STARTPTS[v2];
[3:v]scale=1600:1200,zoompan=z='min(zoom+0.00016,1.026)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=165:s=1600x1200:fps=30,setsar=1,settb=AVTB,setpts=PTS-STARTPTS[v3];
[v0][v1]xfade=transition=fade:duration=0.75:offset=4.75[x1];
[x1][v2]xfade=transition=fade:duration=0.75:offset=9.5[x2];
[x2][v3]xfade=transition=fade:duration=0.75:offset=14.25,format=yuv420p[out]
"@
$recommendOutput = Join-Path $outputRoot '海豹办公1.9.15-推荐视频-横屏1600x1200.mp4'
$recommendArgs += @(
  '-filter_complex', $recommendFilter,
  '-map', '[out]', '-t', '19.75', '-an',
  '-c:v', 'libx264', '-profile:v', 'high', '-level:v', '5.1',
  '-preset', 'slow', '-crf', '19', '-maxrate', '8M', '-bufsize', '16M',
  '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', $recommendOutput
)
Invoke-Ffmpeg $recommendArgs

Get-Item -LiteralPath $verticalOutput, $recommendOutput | Select-Object FullName, Length, LastWriteTime

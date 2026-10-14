param(
  [string]$Version = '1.9.15'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$project = Split-Path -Parent $PSScriptRoot
$output = Join-Path $project "build\store-assets\android-v$Version"
$iconSource = Join-Path $project 'build\store-assets\待上传\鸿蒙应用图标-1024x1024.png'
New-Item -ItemType Directory -Force -Path $output | Out-Null

function Save-ResizedPng([string]$source, [string]$destination, [int]$width, [int]$height) {
  $inputImage = [System.Drawing.Image]::FromFile($source)
  try {
    $canvas = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($canvas)
      try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.DrawImage($inputImage, 0, 0, $width, $height)
      } finally { $graphics.Dispose() }
      $canvas.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $canvas.Dispose() }
  } finally { $inputImage.Dispose() }
}

function New-RoundedPath([System.Drawing.RectangleF]$rectangle, [float]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $radius * 2
  $path.AddArc($rectangle.X, $rectangle.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($rectangle.Right - $diameter, $rectangle.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($rectangle.Right - $diameter, $rectangle.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($rectangle.X, $rectangle.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

Save-ResizedPng $iconSource (Join-Path $output 'icon-512x512.png') 512 512
Save-ResizedPng $iconSource (Join-Path $output 'icon-114x114.png') 114 114

$feature = New-Object System.Drawing.Bitmap(1024, 500, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
try {
  $graphics = [System.Drawing.Graphics]::FromImage($feature)
  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $background = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      (New-Object System.Drawing.Rectangle(0, 0, 1024, 500)),
      ([System.Drawing.Color]::FromArgb(255, 31, 82, 190)),
      ([System.Drawing.Color]::FromArgb(255, 83, 137, 255)),
      0
    )
    try { $graphics.FillRectangle($background, 0, 0, 1024, 500) } finally { $background.Dispose() }

    $cardRectangle = New-Object System.Drawing.RectangleF(62, 70, 360, 360)
    $cardPath = New-RoundedPath $cardRectangle 42
    $cardBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 255, 255, 255))
    try { $graphics.FillPath($cardBrush, $cardPath) } finally { $cardBrush.Dispose(); $cardPath.Dispose() }

    $icon = [System.Drawing.Image]::FromFile($iconSource)
    try { $graphics.DrawImage($icon, 82, 90, 320, 320) } finally { $icon.Dispose() }

    $titleFont = New-Object System.Drawing.Font('Microsoft YaHei UI', 56, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $subtitleFont = New-Object System.Drawing.Font('Microsoft YaHei UI', 27, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $softWhite = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(225, 255, 255, 255))
    try {
      $graphics.DrawString('海豹办公', $titleFont, $white, 478, 155)
      $graphics.DrawString('文字 · 表格 · 演示 · PDF', $subtitleFont, $softWhite, 480, 245)
      $graphics.DrawString('移动办公，一个应用就够了', $subtitleFont, $softWhite, 480, 300)
    } finally { $titleFont.Dispose(); $subtitleFont.Dispose(); $white.Dispose(); $softWhite.Dispose() }
  } finally { $graphics.Dispose() }
  $feature.Save((Join-Path $output 'feature-graphic-1024x500.png'), [System.Drawing.Imaging.ImageFormat]::Png)
} finally { $feature.Dispose() }

if (-not (Test-Path -LiteralPath (Join-Path $project 'node_modules\electron'))) { throw '缺少 Electron；请先安装根目录依赖' }
& node (Join-Path $project 'scripts\capture-android-store-screenshots.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Android 商店截图生成失败' }

Write-Output "Android 商店素材已生成：$output"

param(
  [string]$Version = '1.9.15'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$project = Split-Path -Parent $PSScriptRoot
$androidAssets = Join-Path $project "build\store-assets\android-v$Version"
$output = Join-Path $project "build\store-assets\harmony-v$Version"
$iconSource = Join-Path $project 'build\store-assets\待上传\鸿蒙应用图标-1024x1024.png'
New-Item -ItemType Directory -Force -Path $output | Out-Null

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

function Save-ResizedPng([string]$source, [string]$destination, [int]$width, [int]$height) {
  $inputImage = [System.Drawing.Image]::FromFile($source)
  try {
    $canvas = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($canvas)
      try {
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.DrawImage($inputImage, 0, 0, $width, $height)
      } finally { $graphics.Dispose() }
      $canvas.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $canvas.Dispose() }
  } finally { $inputImage.Dispose() }
}

function New-HarmonyScreenshot(
  [string]$source,
  [string]$destination,
  [string]$headline,
  [string]$subheading,
  [System.Drawing.Color]$accent
) {
  $width = 1080
  $height = 1920
  $canvas = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    try {
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

      $background = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Rectangle(0, 0, $width, $height)),
        ([System.Drawing.Color]::FromArgb(255, 241, 246, 255)),
        ([System.Drawing.Color]::White),
        90
      )
      try { $graphics.FillRectangle($background, 0, 0, $width, $height) } finally { $background.Dispose() }

      $orbBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(22, $accent.R, $accent.G, $accent.B))
      try {
        $graphics.FillEllipse($orbBrush, 720, -80, 460, 460)
        $graphics.FillEllipse($orbBrush, -160, 1450, 500, 500)
      } finally { $orbBrush.Dispose() }

      $icon = [System.Drawing.Image]::FromFile($iconSource)
      try { $graphics.DrawImage($icon, 72, 62, 92, 92) } finally { $icon.Dispose() }

      $brandFont = New-Object System.Drawing.Font('Microsoft YaHei UI', 34, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
      $headlineFont = New-Object System.Drawing.Font('Microsoft YaHei UI', 61, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
      $subheadingFont = New-Object System.Drawing.Font('Microsoft YaHei UI', 30, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
      $brandBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 20, 29, 48))
      $headlineBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 20, 29, 48))
      $subheadingBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 85, 99, 124))
      $accentBrush = New-Object System.Drawing.SolidBrush($accent)
      try {
        $graphics.DrawString('海豹办公', $brandFont, $brandBrush, 184, 86)
        $graphics.FillRectangle($accentBrush, 72, 202, 76, 8)
        $graphics.DrawString($headline, $headlineFont, $headlineBrush, (New-Object System.Drawing.RectangleF(72, 236, 936, 165)))
        $graphics.DrawString($subheading, $subheadingFont, $subheadingBrush, (New-Object System.Drawing.RectangleF(74, 402, 930, 88)))
      } finally {
        $brandFont.Dispose(); $headlineFont.Dispose(); $subheadingFont.Dispose()
        $brandBrush.Dispose(); $headlineBrush.Dispose(); $subheadingBrush.Dispose(); $accentBrush.Dispose()
      }

      $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(30, 25, 48, 91))
      $phoneBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 21, 27, 39))
      try {
        $shadowPath = New-RoundedPath (New-Object System.Drawing.RectangleF(204, 506, 672, 1374)) 64
        try { $graphics.FillPath($shadowBrush, $shadowPath) } finally { $shadowPath.Dispose() }
        $phonePath = New-RoundedPath (New-Object System.Drawing.RectangleF(219, 490, 642, 1374)) 58
        try { $graphics.FillPath($phoneBrush, $phonePath) } finally { $phonePath.Dispose() }
      } finally { $shadowBrush.Dispose(); $phoneBrush.Dispose() }

      $screenRectangle = New-Object System.Drawing.RectangleF(247, 538, 586, 1268)
      $screenPath = New-RoundedPath $screenRectangle 31
      $screenshot = [System.Drawing.Image]::FromFile($source)
      try {
        $state = $graphics.Save()
        try {
          $graphics.SetClip($screenPath)
          $graphics.DrawImage($screenshot, $screenRectangle)
        } finally { $graphics.Restore($state) }
      } finally { $screenshot.Dispose(); $screenPath.Dispose() }

      $speakerBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 69, 76, 90))
      try {
        $speakerPath = New-RoundedPath (New-Object System.Drawing.RectangleF(452, 512, 176, 12)) 6
        try { $graphics.FillPath($speakerBrush, $speakerPath) } finally { $speakerPath.Dispose() }
      } finally { $speakerBrush.Dispose() }
    } finally { $graphics.Dispose() }
    $canvas.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $canvas.Dispose() }
}

if (-not (Test-Path -LiteralPath $iconSource)) { throw "找不到图标：$iconSource" }
Save-ResizedPng $iconSource (Join-Path $output 'icon-1024x1024.png') 1024 1024

$screens = @(
  @('01-home.png', '01-移动工作台-1080x1920.png', '常用办公文件，一处处理', '文字、表格、演示、PDF 与常用工具清晰归类', [System.Drawing.Color]::FromArgb(255, 47, 103, 241)),
  @('02-word.png', '02-文字编辑-1080x1920.png', '移动文字编辑，随时开始', '创建、编辑、保存和导出常用文字文档', [System.Drawing.Color]::FromArgb(255, 33, 96, 224)),
  @('03-spreadsheet.png', '03-电子表格-1080x1920.png', '表格与数据，轻松整理', '支持工作表编辑、公式输入与常用数据处理', [System.Drawing.Color]::FromArgb(255, 19, 153, 102)),
  @('04-presentation.png', '04-演示文稿-1080x1920.png', '演示文稿，也能移动编辑', '编辑页面内容并进入全屏放映', [System.Drawing.Color]::FromArgb(255, 244, 103, 36))
)

foreach ($screen in $screens) {
  $source = Join-Path $androidAssets $screen[0]
  if (-not (Test-Path -LiteralPath $source)) { throw "找不到截图源文件：$source" }
  New-HarmonyScreenshot $source (Join-Path $output $screen[1]) $screen[2] $screen[3] $screen[4]
}

Write-Output "HarmonyOS 商店素材已生成：$output"

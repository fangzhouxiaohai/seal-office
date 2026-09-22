# 生成海豹办公的应用图标（ICO 与 PNG）。
# 造型与 renderer/src/components/SealLogo.tsx 保持一致，按 64x64 设计稿等比缩放。
# 用法：pwsh -File build/make-icon.ps1

Add-Type -AssemblyName System.Drawing

$输出目录 = Split-Path -Parent $MyInvocation.MyCommand.Path
$基础色 = [System.Drawing.Color]::FromArgb(255, 76, 134, 255)
$深色 = [System.Drawing.Color]::FromArgb(255, 43, 108, 246)
$白 = [System.Drawing.Color]::White
$墨色 = [System.Drawing.Color]::FromArgb(255, 26, 29, 36)

function 绘制海豹 {
  param([int]$尺寸)

  $缩放 = $尺寸 / 64.0
  $图 = New-Object System.Drawing.Bitmap($尺寸, $尺寸)
  $画布 = [System.Drawing.Graphics]::FromImage($图)
  $画布.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $画布.Clear([System.Drawing.Color]::Transparent)

  $矩形 = New-Object System.Drawing.RectangleF(0, 0, [float]$尺寸, [float]$尺寸)
  $底刷 = New-Object System.Drawing.Drawing2D.LinearGradientBrush($矩形, $基础色, $深色, [float]90)
  $画布.FillEllipse($底刷, 0, 0, [float]$尺寸, [float]$尺寸)

  $白刷 = New-Object System.Drawing.SolidBrush($白)
  $墨刷 = New-Object System.Drawing.SolidBrush($墨色)

  # 两只小耳朵
  $画布.FillEllipse($白刷, [float](11 * $缩放), [float](19 * $缩放), [float](10 * $缩放), [float](10 * $缩放))
  $画布.FillEllipse($白刷, [float](43 * $缩放), [float](19 * $缩放), [float](10 * $缩放), [float](10 * $缩放))

  # 圆润的头部
  $画布.FillEllipse($白刷, [float](13 * $缩放), [float](19 * $缩放), [float](38 * $缩放), [float](34 * $缩放))

  # 眼睛
  $画布.FillEllipse($墨刷, [float](21.1 * $缩放), [float](28.6 * $缩放), [float](6.8 * $缩放), [float](6.8 * $缩放))
  $画布.FillEllipse($墨刷, [float](36.1 * $缩放), [float](28.6 * $缩放), [float](6.8 * $缩放), [float](6.8 * $缩放))

  # 眼神高光
  $画布.FillEllipse($白刷, [float](24.4 * $缩放), [float](29.6 * $缩放), [float](2.4 * $缩放), [float](2.4 * $缩放))
  $画布.FillEllipse($白刷, [float](39.4 * $缩放), [float](29.6 * $缩放), [float](2.4 * $缩放), [float](2.4 * $缩放))

  # 鼻子
  $画布.FillEllipse($墨刷, [float](29.2 * $缩放), [float](37.5 * $缩放), [float](5.6 * $缩放), [float](4.2 * $缩放))

  # 微笑与胡须
  $笔 = New-Object System.Drawing.Pen($墨色, [float](1.4 * $缩放))
  $笔.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $笔.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $画布.DrawArc($笔, [float](27 * $缩放), [float](40 * $缩放), [float](10 * $缩放), [float](6 * $缩放), 20, 140)

  $胡须笔 = New-Object System.Drawing.Pen($墨色, [float](1.3 * $缩放))
  $胡须笔.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $胡须笔.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $画布.DrawLine($胡须笔, [float](14 * $缩放), [float](34 * $缩放), [float](6 * $缩放), [float](32.6 * $缩放))
  $画布.DrawLine($胡须笔, [float](14 * $缩放), [float](38 * $缩放), [float](6.5 * $缩放), [float](38.6 * $缩放))
  $画布.DrawLine($胡须笔, [float](50 * $缩放), [float](34 * $缩放), [float](58 * $缩放), [float](32.6 * $缩放))
  $画布.DrawLine($胡须笔, [float](50 * $缩放), [float](38 * $缩放), [float](57.5 * $缩放), [float](38.6 * $缩放))

  $画布.Dispose()
  $底刷.Dispose()
  $白刷.Dispose()
  $墨刷.Dispose()
  $笔.Dispose()
  $胡须笔.Dispose()

  return $图
}

# 生成多尺寸图像数据
$尺寸列表 = @(16, 32, 48, 64, 128, 256)
$图像列表 = @()
foreach ($尺寸 in $尺寸列表) {
  $位图 = 绘制海豹 -尺寸 $尺寸
  $流 = New-Object System.IO.MemoryStream
  $位图.Save($流, [System.Drawing.Imaging.ImageFormat]::Png)
  $图像列表 += , @($尺寸, $流.ToArray())
  $位图.Dispose()
  $流.Dispose()
}

# 组装 ICO
$输出流 = New-Object System.IO.MemoryStream
$写入器 = New-Object System.IO.BinaryWriter($输出流)
$写入器.Write([UInt16]0)
$写入器.Write([UInt16]1)
$写入器.Write([UInt16]$尺寸列表.Count)

$数据偏移 = 6 + 16 * $尺寸列表.Count
foreach ($项 in $图像列表) {
  $尺寸 = $项[0]
  $数据 = $项[1]
  $记录值 = if ($尺寸 -ge 256) { 0 } else { $尺寸 }
  $写入器.Write([Byte]$记录值)
  $写入器.Write([Byte]$记录值)
  $写入器.Write([Byte]0)
  $写入器.Write([Byte]0)
  $写入器.Write([UInt16]1)
  $写入器.Write([UInt16]32)
  $写入器.Write([UInt32]$数据.Length)
  $写入器.Write([UInt32]$数据偏移)
  $数据偏移 += $数据.Length
}
foreach ($项 in $图像列表) {
  $写入器.Write($项[1])
}
$写入器.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $输出目录 'icon.ico'), $输出流.ToArray())
$写入器.Dispose()
$输出流.Dispose()

# 另存一张 512 像素的展示图
$大图 = 绘制海豹 -尺寸 512
$大图.Save((Join-Path $输出目录 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$大图.Dispose()

Get-ChildItem $输出目录 -Filter 'icon.*' | ForEach-Object {
  "$($_.Name)  $([math]::Round($_.Length / 1KB, 1)) KB"
}

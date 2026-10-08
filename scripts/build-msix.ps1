<#
  用 makeappx 手工打 MSIX/APPX 包（不依赖 electron-builder 的 appx 目标联网下载示例资源）。

  为什么手工打包：electron-builder 的 AppxTarget 会从 GitHub 拉取示例磁贴资源，本机到该主机不通，
  构建中途 ECONNRESET 失败；而 makeappx 本身完全离线，磁贴资源我们用 build/appx 里自己生成的。

  提交到 Microsoft Store 前，身份三项必须与 Partner Center 的 MSIX 产品一致：
    -IdentityName   对应 包/标识/名称（Package/Identity/Name）
    -Publisher      对应 包/标识/发布者（Publisher，形如 CN=xxxxxxxx-xxxx-...）
  自测时可先用占位值，安装时需要自签名证书。
#>
param(
  [string]$IdentityName = 'Placeholder.SealOffice',
  [string]$Publisher = 'CN=00000000-0000-0000-0000-000000000000',
  [string]$PublisherDisplayName = '星马软件',
  [string]$DisplayName = '海豹办公',
  [string]$Description = '海豹办公 Seal Office — 本地办公套件',
  [string]$Version = '',
  [string]$MinVersion = '10.0.17763.0',
  [string]$MaxVersionTested = '10.0.22621.0',
  [string]$Source = '',
  [string]$Output = '',
  [string]$MakeAppx = 'E:\Temp\sdkbuildtools\bin\10.0.28000.0\x64\makeappx.exe',
  [string]$Assets = '',
  [switch]$Sign,
  [string]$CertSubject = ''
)
$ErrorActionPreference = 'Stop'
$根 = Split-Path -Parent $PSScriptRoot
$应用版本 = (Get-Content -LiteralPath (Join-Path $根 'package.json') -Raw | ConvertFrom-Json).version
if (-not $Version) { $Version = "$应用版本.0" }
if (-not $Source) { $Source = Join-Path $根 "release\v$应用版本\win-unpacked" }
if (-not $Output) { $Output = Join-Path $根 "release\v$应用版本\SealOffice $应用版本.msix" }
if (-not $Assets) { $Assets = Join-Path $根 'build\appx' }

if (-not (Test-Path -LiteralPath $Source)) { throw "找不到应用目录：$Source" }
if (-not (Test-Path -LiteralPath $MakeAppx)) { throw "找不到 makeappx：$MakeAppx" }
if (-not (Test-Path -LiteralPath (Join-Path $Source 'SealOffice.exe'))) { throw "应用目录里没有 SealOffice.exe：$Source" }

$布局 = [IO.Path]::GetFullPath((Join-Path $根 "release\msix-layout-$应用版本"))
$发布目录 = [IO.Path]::GetFullPath((Join-Path $根 'release')) + [IO.Path]::DirectorySeparatorChar
if (-not $布局.StartsWith($发布目录, [StringComparison]::OrdinalIgnoreCase)) { throw 'MSIX 临时目录必须位于项目发布目录内' }
if (Test-Path -LiteralPath $布局) { Remove-Item -LiteralPath $布局 -Recurse -Force }
New-Item -ItemType Directory -Path $布局 -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $布局 'Assets') -Force | Out-Null

Write-Host '=== 1) 复制应用文件 ==='
Copy-Item -Path (Join-Path $Source '*') -Destination $布局 -Recurse -Force
Write-Host ("  已复制 {0} 个顶层项" -f (Get-ChildItem $布局 | Measure-Object).Count)

Write-Host '=== 2) 复制磁贴资源 ==='
foreach ($名 in @('Square44x44Logo.png','Square150x150Logo.png','Square310x310Logo.png','Wide310x150Logo.png','StoreLogo.png','SplashScreen.png')) {
  $源 = Join-Path $Assets $名
  if (-not (Test-Path -LiteralPath $源)) { throw "缺少磁贴资源：$源" }
  Copy-Item -LiteralPath $源 -Destination (Join-Path $布局 "Assets\$名") -Force
}
Write-Host '  已复制 6 个磁贴资源'

Write-Host '=== 3) 生成 AppxManifest.xml ==='
$清单 = @"
<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities">
  <Identity Name="$IdentityName" Publisher="$Publisher" Version="$Version" ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>$DisplayName</DisplayName>
    <PublisherDisplayName>$PublisherDisplayName</PublisherDisplayName>
    <Description>$Description</Description>
    <Logo>Assets\StoreLogo.png</Logo>
  </Properties>
  <Resources>
    <Resource Language="zh-CN" />
  </Resources>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="$MinVersion" MaxVersionTested="$MaxVersionTested" />
  </Dependencies>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
  <Applications>
    <Application Id="SealOffice" Executable="SealOffice.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="$DisplayName"
        Description="$Description"
        BackgroundColor="#2b6cf6"
        Square150x150Logo="Assets\Square150x150Logo.png"
        Square44x44Logo="Assets\Square44x44Logo.png">
        <uap:DefaultTile Wide310x150Logo="Assets\Wide310x150Logo.png" Square310x310Logo="Assets\Square310x310Logo.png" />
        <uap:SplashScreen Image="Assets\SplashScreen.png" />
      </uap:VisualElements>
    </Application>
  </Applications>
</Package>
"@
$清单路径 = Join-Path $布局 'AppxManifest.xml'
[System.IO.File]::WriteAllText($清单路径, $清单, [System.Text.UTF8Encoding]::new($false))
Write-Host "  已写入（身份：$IdentityName / $Publisher / 版本 $Version）"

Write-Host '=== 4) 用 makeappx 打包 ==='
if (Test-Path -LiteralPath $Output) { Remove-Item -LiteralPath $Output -Force }
$输出 = & $MakeAppx pack /o /d $布局 /p $Output 2>&1
$输出 | Select-Object -Last 5 | ForEach-Object { "  $_" }
if (-not (Test-Path -LiteralPath $Output)) { throw 'makeappx 未产出包文件' }
$包 = Get-Item -LiteralPath $Output
Write-Host ("  已生成：{0}（{1:N0} 字节，{2:N1} MB）" -f $包.Name, $包.Length, ($包.Length / 1MB))
Write-Host ("  SHA-256：{0}" -f (Get-FileHash -LiteralPath $Output -Algorithm SHA256).Hash)

if ($Sign) {
  Write-Host '=== 5) 自签名（仅供本机试用；提交商店不需要，商店会代签）==='
  # SignTool 要求证书主题与清单里的 Publisher 完全一致，否则报 SignerSign() failed(0x8007000B)
  if (-not $CertSubject) { $CertSubject = $Publisher }
  $证书 = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq $CertSubject } | Select-Object -First 1
  if (-not $证书) {
    $证书 = New-SelfSignedCertificate -Type Custom -Subject $CertSubject -KeyUsage DigitalSignature `
      -FriendlyName 'SealOffice 本机测试' -CertStoreLocation 'Cert:\CurrentUser\My' `
      -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
    Write-Host "  已创建自签名证书：$($证书.Thumbprint)（主题 $CertSubject）"
  }
  # 信任该证书，Add-AppxPackage 才允许安装自签名包
  $已信任 = Get-ChildItem Cert:\CurrentUser\TrustedPeople | Where-Object { $_.Thumbprint -eq $证书.Thumbprint }
  if (-not $已信任) {
    Export-Certificate -Cert $证书 -FilePath (Join-Path $env:TEMP 'sealoffice-msix-test.cer') | Out-Null
    Import-Certificate -FilePath (Join-Path $env:TEMP 'sealoffice-msix-test.cer') -CertStoreLocation 'Cert:\CurrentUser\TrustedPeople' | Out-Null
    Write-Host '  已将证书导入本机“受信任人”'
  }
  $密码 = ConvertTo-SecureString -String 'sealoffice' -Force -AsPlainText
  $pfx = Join-Path $env:TEMP 'sealoffice-msix-test.pfx'
  Export-PfxCertificate -Cert $证书 -FilePath $pfx -Password $密码 | Out-Null
  $signtool = Join-Path (Split-Path $MakeAppx -Parent) 'signtool.exe'
  & $signtool sign /fd SHA256 /f $pfx /p 'sealoffice' $Output 2>&1 | Select-Object -Last 3 | ForEach-Object { "  $_" }
  $签名结果 = Get-AuthenticodeSignature -LiteralPath $Output
  Write-Host ("  包签名状态：{0}" -f $签名结果.Status)
}
Write-Host '完成'

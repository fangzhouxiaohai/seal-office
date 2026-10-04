param([Parameter(Mandatory)][string]$Icons)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
if (-not ('SealFileIconProbe' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SealFileIconProbe {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Info {
    public IntPtr Icon; public int Index; public uint Attributes;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=260)] public string Name;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=80)] public string Type;
  }
  [DllImport("shell32.dll", CharSet=CharSet.Unicode)]
  public static extern IntPtr SHGetFileInfo(string path, uint attributes, ref Info info, uint size, uint flags);
  [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr icon);
  [DllImport("shell32.dll")] public static extern void SHChangeNotify(uint e, uint f, IntPtr a, IntPtr b);
}
'@
}
$taskProbeId = [guid]::NewGuid().ToString('N')
$taskBase = [Microsoft.Win32.Registry]::CurrentUser
$taskKeys = [Collections.Generic.List[string]]::new()
$taskResults = [Collections.Generic.List[object]]::new()
try {
  foreach ($taskType in @('word','table','ppt','pdf')) {
    $taskFile = Join-Path $Icons ($taskType + '.ico')
    if (-not (Test-Path -LiteralPath $taskFile -PathType Leaf)) { throw "图标不存在：$taskType" }
    $taskExt = '.sealicontest-' + $taskProbeId + '-' + $taskType
    $taskClass = 'SealOffice.IconTests.' + $taskProbeId + '.' + $taskType
    foreach ($taskKeyName in @($taskExt, $taskClass)) { $taskKeys.Add('Software\Classes\' + $taskKeyName) }
    $taskKey = $taskBase.CreateSubKey('Software\Classes\' + $taskExt)
    try { $taskKey.SetValue('', $taskClass) } finally { $taskKey.Dispose() }
    $taskKey = $taskBase.CreateSubKey('Software\Classes\' + $taskClass + '\DefaultIcon')
    try { $taskKey.SetValue('', ('"' + $taskFile + '",0')) } finally { $taskKey.Dispose() }
    [SealFileIconProbe]::SHChangeNotify(0x08000000, 0x1000, [IntPtr]::Zero, [IntPtr]::Zero)
    foreach ($taskSmall in @($false,$true)) {
      $taskInfo = [SealFileIconProbe+Info]::new()
      $taskFlags = [uint32](0x100 -bor 0x10)
      if ($taskSmall) { $taskFlags = $taskFlags -bor 1 }
      $taskCode = [SealFileIconProbe]::SHGetFileInfo(('测试' + $taskExt), 0x80, [ref]$taskInfo, [Runtime.InteropServices.Marshal]::SizeOf($taskInfo), $taskFlags)
      if ($taskCode -eq [IntPtr]::Zero -or $taskInfo.Icon -eq [IntPtr]::Zero) { throw "Windows 无法解析 $taskType 文件关联图标" }
      $taskImage = $null; $taskBitmap = $null; $taskStream = [IO.MemoryStream]::new(); $taskHasher = [Security.Cryptography.SHA256]::Create()
      try {
        $taskImage = [Drawing.Icon]::FromHandle($taskInfo.Icon)
        $taskBitmap = $taskImage.ToBitmap()
        $taskBitmap.Save($taskStream, [Drawing.Imaging.ImageFormat]::Png)
        $taskHash = [BitConverter]::ToString($taskHasher.ComputeHash($taskStream.ToArray())).Replace('-','').ToLowerInvariant()
        $taskResults.Add([pscustomobject]@{类型=$taskType;小图=$taskSmall;宽=$taskBitmap.Width;高=$taskBitmap.Height;SHA256=$taskHash})
      } finally {
        if ($taskBitmap) { $taskBitmap.Dispose() }; if ($taskImage) { $taskImage.Dispose() }
        $taskStream.Dispose(); $taskHasher.Dispose()
        [void][SealFileIconProbe]::DestroyIcon($taskInfo.Icon)
      }
    }
  }
  foreach ($taskSmall in @($false,$true)) {
    if (@($taskResults | Where-Object { $_.小图 -eq $taskSmall } | Select-Object -ExpandProperty SHA256 -Unique).Count -ne 4) { throw 'Windows 解析出的文件类型图标未有效区分' }
  }
  [pscustomobject]@{结果='通过';数量=$taskResults.Count;核验=$taskResults} | ConvertTo-Json -Depth 4
} finally {
  foreach ($taskKeyName in $taskKeys) {
    if ($taskKeyName -notmatch ('^Software\\Classes\\(\.sealicontest-' + $taskProbeId + '-(word|table|ppt|pdf)|SealOffice\.IconTests\.' + $taskProbeId + '\.(word|table|ppt|pdf))$')) { throw '原生图标测试注册表清理位置越界' }
    $taskBase.DeleteSubKeyTree($taskKeyName, $false)
  }
  [SealFileIconProbe]::SHChangeNotify(0x08000000, 0x1000, [IntPtr]::Zero, [IntPtr]::Zero)
}

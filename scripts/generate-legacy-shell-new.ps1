#requires -Version 7.0
# 仅维护者重新生成旧式模板时需要本机 Microsoft Office，普通构建使用仓库内已有模板。
$ErrorActionPreference = 'Stop'
$taskDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'build\shell-new'
New-Item -ItemType Directory -Path $taskDirectory -Force | Out-Null
$taskWord = $null; $taskExcel = $null; $taskPpt = $null
try {
  $taskWord = New-Object -ComObject Word.Application
  $taskWord.Visible = $false; $taskWord.DisplayAlerts = 0
  $taskDocument = $taskWord.Documents.Add()
  $taskWordFile = Join-Path $taskDirectory ('blank-' + [guid]::NewGuid().ToString('N') + '.doc')
  $taskDocument.SaveAs2($taskWordFile, 0)
  $taskDocument.Close(0)
  $taskWord.Quit(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskWord); $taskWord = $null
  Move-Item -LiteralPath $taskWordFile -Destination (Join-Path $taskDirectory 'blank.doc') -Force

  $taskExcel = New-Object -ComObject Excel.Application
  $taskExcel.Visible = $false; $taskExcel.DisplayAlerts = $false
  $taskWorkbook = $taskExcel.Workbooks.Add(-4167)
  $taskWorkbook.SaveAs((Join-Path $taskDirectory 'blank.xls'), 56)
  $taskWorkbook.Close($false)
  $taskExcel.Quit(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskExcel); $taskExcel = $null

  $taskPpt = New-Object -ComObject PowerPoint.Application
  $taskPresentation = $taskPpt.Presentations.Add(0)
  [void]$taskPresentation.Slides.Add(1, 12)
  $taskPresentation.SaveAs((Join-Path $taskDirectory 'blank.ppt'), 1)
  $taskPresentation.Close()
  $taskPpt.Quit(); [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($taskPpt); $taskPpt = $null
} finally {
  if ($taskWord) { $taskWord.Quit() }
  if ($taskExcel) { $taskExcel.Quit() }
  if ($taskPpt) { $taskPpt.Quit() }
}

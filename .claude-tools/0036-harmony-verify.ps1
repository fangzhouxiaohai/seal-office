$ErrorActionPreference = 'Continue'
Set-Location E:\seal-office
$app = Get-ChildItem mobile\unpackage\dist\build\app-harmony -Recurse -Filter *-release-signed.app -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $app) { Write-Output 'NO_APP'; exit 1 }
Write-Output ("APP=" + $app.FullName + " bytes=" + $app.Length + " time=" + $app.LastWriteTime)
$work = 'E:\seal-office\.claude-tools\harmony-check'
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue; New-Item -ItemType Directory $work | Out-Null
Copy-Item $app.FullName "$work\app.zip"
Expand-Archive "$work\app.zip" "$work\unzipped" -Force
Get-ChildItem "$work\unzipped" | ForEach-Object { Write-Output ("  inner " + $_.Name + " " + $_.Length) }
$hap = Get-ChildItem "$work\unzipped" -Filter *.hap | Select-Object -First 1
& npm.cmd --prefix mobile run check:hap -- $hap.FullName
Write-Output "check-hap-exit $LASTEXITCODE"
$jar = Get-ChildItem 'C:\Program Files\Huawei','D:\Program Files\Huawei','C:\Program Files','D:\','E:\Applications' -Recurse -Filter hap-sign-tool.jar -ErrorAction SilentlyContinue -Depth 8 | Select-Object -First 1
$java = Get-ChildItem 'C:\Program Files\Huawei','D:\Program Files\Huawei','D:\','C:\Program Files' -Recurse -Filter java.exe -ErrorAction SilentlyContinue -Depth 6 | Where-Object { $_.FullName -match 'jbr|DevEco' } | Select-Object -First 1
Write-Output ("JAR=" + $jar.FullName + " JAVA=" + $java.FullName)
if ($jar -and $java) {
  & $java.FullName -jar $jar.FullName verify-app -inFile $app.FullName -outCertChain "$work\app-cert.cer" -outProfile "$work\app-profile.p7b"
  Write-Output "verify-app-exit $LASTEXITCODE"
  & $java.FullName -jar $jar.FullName verify-app -inFile $hap.FullName -outCertChain "$work\hap-cert.cer" -outProfile "$work\hap-profile.p7b"
  Write-Output "verify-hap-exit $LASTEXITCODE"
}
$dest = 'release\v2.3.0\seal-office-2.3.0-harmony.app'
Copy-Item $app.FullName $dest -Force
Compress-Archive -Path $dest -DestinationPath "$dest.zip" -Force
Get-FileHash $dest, "$dest.zip" -Algorithm SHA256 | ForEach-Object { Write-Output ($_.Hash.ToLower() + '  ' + (Split-Path $_.Path -Leaf)) }

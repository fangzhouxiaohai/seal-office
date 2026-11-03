$ErrorActionPreference = 'Continue'
Set-Location E:\seal-office
$java = 'E:\DevEco Studio\jbr\bin\java.exe'
$jar = 'E:\DevEco Studio\sdk\default\openharmony\toolchains\lib\hap-sign-tool.jar'
$hap = Get-Item 'mobile\unpackage\dist\build\app-harmony\entry\build\release\outputs\default\entry-default-signed.hap'
Write-Output ("HAP=" + $hap.FullName + " bytes=" + $hap.Length + " time=" + $hap.LastWriteTime)
$work = 'E:\seal-office\.claude-tools\harmony-check'
& $java -jar $jar verify-app -inFile $hap.FullName -outCertChain "$work\signed-hap-cert.cer" -outProfile "$work\signed-hap-profile.p7b"
Write-Output "verify-signed-hap-exit $LASTEXITCODE"
$bytes = [IO.File]::ReadAllBytes("$work\signed-hap-profile.p7b")
$text = [Text.Encoding]::UTF8.GetString($bytes)
$i = $text.IndexOf('{"version-name"'); if ($i -lt 0) { $i = $text.IndexOf('{') }
$j = $text.LastIndexOf('}')
$json = $text.Substring($i, $j - $i + 1)
Write-Output "PROFILE-JSON:"
Write-Output ($json -replace '"(device-ids|udids)":\s*\[[^\]]*\]','"$1":[...]')
& npm.cmd --prefix mobile run check:hap -- $hap.FullName
Write-Output "check-hap-exit $LASTEXITCODE"
Copy-Item $hap.FullName 'release\v2.3.0\seal-office-2.3.0-harmony.hap' -Force
(Get-FileHash 'release\v2.3.0\seal-office-2.3.0-harmony.hap' -Algorithm SHA256).Hash.ToLower()

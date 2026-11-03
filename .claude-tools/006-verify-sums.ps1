$ErrorActionPreference = 'Continue'
Set-Location E:\seal-office
$java = 'E:\DevEco Studio\jbr\bin\java.exe'
$jar = 'E:\DevEco Studio\sdk\default\openharmony\toolchains\lib\hap-sign-tool.jar'
$work = 'E:\seal-office\.claude-tools\harmony-check'
Write-Output "java exists: $(Test-Path $java)"
& $java -jar $jar verify-app -inFile 'release\v2.3.0\seal-office-2.3.0-harmony.app' -outCertChain "$work\app-cert.cer" -outProfile "$work\app-profile.p7b"
Write-Output "verify-app-exit $LASTEXITCODE"
& $java -jar $jar verify-app -inFile "$work\unzipped\entry-default.hap" -outCertChain "$work\hap-cert.cer" -outProfile "$work\hap-profile.p7b"
Write-Output "verify-hap-exit $LASTEXITCODE"
foreach ($c in "$work\app-cert.cer","$work\hap-cert.cer") { if (Test-Path $c) { Write-Output "== $c"; certutil -dump $c | Select-String 'Subject:|Issuer:|NotAfter|CN=' | Select-Object -First 8 } }
$names = 'seal-office-setup-2.3.0.exe','seal-office-2.3.0-portable.exe','seal-office-2.3.0-microsoft-store-x64.msix','seal-office-2.3.0-amd64.deb','seal-office-2.3.0-android.apk','seal-office-2.3.0-harmony.app.zip','seal-office-2.3.0-android-cloud-source.zip','seal-office-2.3.0-harmony-cloud-source.zip'
$lines = foreach ($n in $names) { $p = "release\v2.3.0\$n"; if (Test-Path $p) { (Get-FileHash $p -Algorithm SHA256).Hash.ToLower() + '  ' + $n } }
[IO.File]::WriteAllLines((Resolve-Path 'release\v2.3.0').Path + '\SHA256SUMS.txt', $lines, (New-Object Text.UTF8Encoding $false))
Get-Content release\v2.3.0\SHA256SUMS.txt
Copy-Item E:\seal-office\.claude-tools\pub1.py scripts\publish-current-release.py -Force
New-Item -ItemType Directory docs\release-notes -Force | Out-Null
Copy-Item E:\seal-office\.claude-tools\notes-draft.md docs\release-notes\v2.3.0.md -Force
& python scripts\publish-current-release.py --check
Write-Output "check-exit $LASTEXITCODE"

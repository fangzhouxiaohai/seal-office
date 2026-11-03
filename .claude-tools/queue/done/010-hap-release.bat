@echo off
chcp 65001 >nul
cd /d E:\seal-office
git fetch E:\seal-office\.claude-tools\s7.bundle HEAD:refs/claude/s7
git cherry-pick refs/claude/s7
git log --oneline -3
git status --short -uno
git push github main
git push origin main
powershell -NoProfile -Command "$n='seal-office-2.3.0-setup'; $names='seal-office-setup-2.3.0.exe','seal-office-2.3.0-portable.exe','seal-office-2.3.0-microsoft-store-x64.msix','seal-office-2.3.0-amd64.deb','seal-office-2.3.0-android.apk','seal-office-2.3.0-harmony.hap','seal-office-2.3.0-harmony.app.zip','seal-office-2.3.0-android-cloud-source.zip','seal-office-2.3.0-harmony-cloud-source.zip'; $lines=foreach($x in $names){ (Get-FileHash ('release\v2.3.0\'+$x) -Algorithm SHA256).Hash.ToLower()+'  '+$x }; [IO.File]::WriteAllLines((Resolve-Path 'release\v2.3.0').Path+'\SHA256SUMS.txt',$lines,(New-Object Text.UTF8Encoding $false)); Get-Content release\v2.3.0\SHA256SUMS.txt"
echo === publish
python scripts\publish-current-release.py
echo publish-exit %ERRORLEVEL%

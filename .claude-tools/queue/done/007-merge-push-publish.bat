@echo off
chcp 65001 >nul
cd /d E:\seal-office
copy /y E:\seal-office\.claude-tools\readme2.txt release\v2.3.0\README.txt >nul
del /q scripts\publish-current-release.py docs\release-notes\v2.3.0.md
git fetch E:\seal-office\.claude-tools\s6.bundle HEAD:refs/claude/s6
git merge --ff-only refs/claude/s6
git log --oneline -3
git status --short -uno
git push github main
git push origin main
git ls-remote github refs/heads/main
git ls-remote origin refs/heads/main
echo === publish
python scripts\publish-current-release.py
echo publish-exit %ERRORLEVEL%

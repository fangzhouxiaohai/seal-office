@echo off
chcp 65001 >nul
cd /d E:\seal-office
git cherry-pick refs/claude/s6
git log --oneline -3
git status --short -uno
git push github main
git push origin main
git ls-remote github refs/heads/main
git ls-remote origin refs/heads/main
echo === publish
python scripts\publish-current-release.py
echo publish-exit %ERRORLEVEL%

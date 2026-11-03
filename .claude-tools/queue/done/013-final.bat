@echo off
chcp 65001 >nul
cd /d E:\seal-office
git fetch E:\seal-office\.claude-tools\s8.bundle HEAD:refs/claude/s8
git cherry-pick refs/claude/s8
git push github main
git push origin main
git log --oneline -4
git status --short -uno
echo stop > E:\seal-office\.claude-tools\queue\stop.flag

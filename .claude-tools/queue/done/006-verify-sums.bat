@echo off
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File E:\seal-office\.claude-tools\006-verify-sums.ps1

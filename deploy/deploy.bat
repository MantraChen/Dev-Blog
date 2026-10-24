@echo off
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" %*
exit /b %errorlevel%

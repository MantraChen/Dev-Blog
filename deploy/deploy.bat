@echo off
setlocal enabledelayedexpansion
REM Auto-deploy script for dev-blog
REM Called by webhook.js after receiving a GitHub push event

echo [%date% %time%] Starting deploy...

REM Pull latest code (retry up to 3 times)
set PULL_OK=0
for /L %%i in (1,1,3) do (
    if !PULL_OK! == 0 (
        echo [%date% %time%] git pull attempt %%i...
        git pull origin main
        if !errorlevel! == 0 (
            set PULL_OK=1
        ) else (
            echo [%date% %time%] git pull failed, retrying in 5s...
            timeout /t 5 /nobreak >nul
        )
    )
)
if %PULL_OK% == 0 (
    echo [%date% %time%] git pull failed after 3 attempts
    exit /b 1
)

REM Install dependencies (in case package.json changed)
call npm install --production=false
if errorlevel 1 (
    echo [%date% %time%] npm install failed
    exit /b 1
)

REM Build
call npm run build
if errorlevel 1 (
    echo [%date% %time%] build failed
    exit /b 1
)

REM Restart the blog service
nssm restart dev-blog
if errorlevel 1 (
    echo [%date% %time%] nssm restart failed
    exit /b 1
)

echo [%date% %time%] Deploy complete!

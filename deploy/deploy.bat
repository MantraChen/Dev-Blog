@echo off
chcp 65001 >nul
REM Auto-deploy script for dev-blog

echo [%date% %time%] Starting deploy...

REM Pull latest code (retry up to 3 times)
git pull origin main
if %errorlevel% neq 0 (
    echo [%date% %time%] git pull attempt 1 failed, retrying...
    timeout /t 5 /nobreak >nul
    git pull origin main
    if %errorlevel% neq 0 (
        echo [%date% %time%] git pull attempt 2 failed, retrying...
        timeout /t 5 /nobreak >nul
        git pull origin main
        if %errorlevel% neq 0 (
            echo [%date% %time%] git pull failed after 3 attempts
            exit /b 1
        )
    )
)
echo [%date% %time%] git pull success

REM Install dependencies (in case package.json changed)
call npm install --omit=none
if %errorlevel% neq 0 (
    echo [%date% %time%] npm install failed
    exit /b 1
)

REM Build
call npm run build
if %errorlevel% neq 0 (
    echo [%date% %time%] build failed
    exit /b 1
)

REM Push DB schema changes
call npx drizzle-kit push --force
if %errorlevel% neq 0 (
    echo [%date% %time%] drizzle-kit push failed
    exit /b 1
)

REM Restart the blog service
nssm restart dev-blog
if %errorlevel% neq 0 (
    echo [%date% %time%] nssm restart failed
    exit /b 1
)

echo [%date% %time%] Deploy complete!

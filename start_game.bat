@echo off
cd /d "%~dp0"
title Alien Invasion Launcher
echo ============================================
echo      Starting Alien Invasion Server
echo ============================================
echo.
echo Launching local web server via npx...
echo The game should open in your default browser automatically.
echo.
echo If it asks to install http-server, press 'y' and Enter.
echo.

call npx http-server -c-1 -o

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] npx failed to run. attempting python fallback...
    python -m http.server 8080
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo [ERROR] Could not start server. Please ensure Node.js or Python is installed.
        pause
    )
)
pause

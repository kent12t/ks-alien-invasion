@echo off
cd /d "%~dp0"
title Alien Invasion Launcher

echo ============================================
echo      Starting Alien Invasion Server
echo ============================================
echo.

:: Install ws dependency if missing (first run only)
if not exist "node_modules\ws" (
    echo [INFO] Installing dependencies...
    call npm install
    echo.
)

echo [INFO] Starting server...
echo [INFO] Game URL : http://localhost:8080
echo [INFO] UDP port : 41234
echo.
echo To trigger the game via UDP, run: send_udp_start.bat
echo.
echo Press Ctrl+C to stop the server.
echo.

:: Open browser after a short delay (1 second)
start "" cmd /c "timeout /t 1 /nobreak >nul && start http://localhost:8080"

node server.js

echo.
echo [INFO] Server stopped.
pause

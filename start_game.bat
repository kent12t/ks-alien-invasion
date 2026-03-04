@echo off
cd /d "%~dp0"
title Alien Invasion Launcher

echo ============================================
echo      Starting Alien Invasion Server
echo ============================================
echo.

:: Wait for network to be ready
echo [INFO] Waiting for network...
timeout /t 3 /nobreak >nul

:: Pull latest updates from GitHub
echo [INFO] Checking for updates...
git pull origin main
echo.

@echo off
start "" /min "C:\Users\Off the Beaten Track\Documents\GitHub\ks-alien-invasion\LidarCalibSoftware\multitouch\server.exe" "C:\Users\Off the Beaten Track\Documents\GitHub\ks-alien-invasion\LidarCalibSoftware\multitouch\kidstop.otxml"

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
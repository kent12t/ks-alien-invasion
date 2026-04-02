@echo off
cd /d "%~dp0"
title Alien Invasion Launcher

echo ============================================
echo      Starting Alien Invasion Server
echo      (Kiosk Mode Enabled)
echo ============================================
echo.

:: Wait for network to be ready
echo [INFO] Waiting for network...
timeout /t 3 /nobreak >nul

:: Pull latest updates from GitHub
echo [INFO] Checking for updates...
git pull origin main
echo.

:: Detect Edge Path (handles both 64-bit and 32-bit Program Files)
set "EDGE_PATH="
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" set "EDGE_PATH=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE_PATH if exist "C:\Program Files\Microsoft\Edge\Application\msedge.exe" set "EDGE_PATH=C:\Program Files\Microsoft\Edge\Application\msedge.exe"

if not defined EDGE_PATH (
    echo [ERROR] Could not find Microsoft Edge. 
    echo Please ensure Edge is installed.
    pause
    exit /b
)

:: Clean up existing Edge processes to ensure a clean kiosk session
echo [INFO] Cleaning up existing Edge processes...
taskkill /F /IM msedge.exe >nul 2>&1
timeout /t 1 /nobreak >nul

:: Start Lidar system (using portable relative paths)
echo [INFO] Starting Lidar software...
start "" /min "%~dp0LidarCalibSoftware\multitouch\server.exe" "%~dp0LidarCalibSoftware\multitouch\kidstop.otxml"

:: Install ws dependency if missing (first run only)
if not exist "node_modules\ws" (
    echo [INFO] Installing dependencies...
    call npm install
    echo.
)

:: Launch Edge in kiosk mode
echo [INFO] Launching Edge at: %EDGE_PATH%
start "" "%EDGE_PATH%" ^
  --start-fullscreen ^
  --force-device-scale-factor=0.65 ^
  --disable-pinch ^
  --overscroll-history-navigation=0 ^
  --disable-features=TouchpadOverscrollHistoryNavigation,Windows10TabSearch,TabHoverCards,SpatialNavigation,TranslateUI,VizDisplayCompositor ^
  --disable-threaded-scrolling ^
  --disable-gesture-editing ^
  --disable-gesture-typing ^
  --disable-touchpad-three-finger-click ^
  --disable-touch-adjustment ^
  --disable-touchpad-smooth-scrolling ^
  --disable-touch-feedback-for-pinch ^
  --disable-touch-feedback-for-scroll ^
  --disable-background-mode ^
  --disable-web-security ^
  --no-first-run ^
  --kiosk "http://localhost:3000"

:: Simulate startup clicks to improve browser audio unlock reliability
echo [INFO] Scheduling startup click for audio unlock...
start "" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SimulateStartupClick.ps1"

echo [INFO] Starting Node.js server...
echo [INFO] Game URL : http://localhost:3000
echo.
echo To trigger the game via UDP, run: send_udp_start.bat
echo.
echo Press Ctrl+C to stop the server.
echo.

:: Run the server
node server.js

echo.
echo [INFO] Server stopped.
pause

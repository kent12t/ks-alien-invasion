@echo off
:: Sends a UDP "start" packet to the Alien Invasion server
:: Usage: double-click to send from THIS machine, or adjust HOST for remote testing
::
:: Game PC static IP : 192.168.1.123
:: UDP Port          : 41234

:: Change HOST to 192.168.1.123 if running this bat from a different machine on the LAN
set HOST=127.0.0.1
set PORT=41234

echo Sending UDP "start" to %HOST%:%PORT% ...
node -e "const s=require('dgram').createSocket('udp4');s.send('start',%PORT%,'%HOST%',()=>{ console.log('Sent!'); s.close(); });"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Could not send UDP packet. Is Node.js installed?
    pause
)

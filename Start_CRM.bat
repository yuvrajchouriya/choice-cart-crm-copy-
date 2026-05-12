@echo off
echo ===================================================
echo     CHOICE CART CRM - VISIBLE STARTUP
echo ===================================================
echo.
echo Please wait... Starting Dashboard and WA Bot...
echo.

:: Start Dashboard
start cmd /k "title CRM Dashboard & npm run dev"

:: Wait 3 seconds
timeout /t 3 /nobreak >nul

:: Start WhatsApp Bridge (Needs QR scan)
start cmd /k "title WhatsApp Bridge & cd wa-bridge & node index.js"

echo.
echo All systems started! Opening browser...
timeout /t 3 /nobreak >nul

:: Open browser
start http://localhost:8080

exit

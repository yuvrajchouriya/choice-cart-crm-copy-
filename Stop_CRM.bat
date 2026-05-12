@echo off
echo Stopping all CRM and WhatsApp background processes...
taskkill /F /IM node.exe
echo Done!
timeout /t 2 >nul

@echo off
title Kiosk Hisobot Adminka
cd /d "%~dp0"
echo ==========================================================
echo O'zbekiston Temir Yo'llari - Kiosk Hisobot Dasturi
echo Dastur ishga tushmoqda, iltimos kuting...
echo ==========================================================

REM Rabochiy stolga Avtomatik Yarlik yaratish
set DESKTOP_SHORTCUT=%USERPROFILE%\Desktop\Kiosk Hisobot Adminka.lnk
if not exist "%DESKTOP_SHORTCUT%" (
    call "%~dp0Rabochiy_Stolga_Yaratish_Windows.bat" >nul 2>&1
)

start "" "http://127.0.0.1:5050"
python app.py
pause

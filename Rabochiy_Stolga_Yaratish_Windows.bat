@echo off
title Rabochiy Stolga Yarlik Yaratish
cd /d "%~dp0"
echo ==========================================================
echo Rabochiy stolga (Desktop) Kiosk iconkasi bilan yarlik yaratilmoqda...
echo ==========================================================

set TARGET_BAT=%~dp0ishga_tushirish.bat
set ICON_FILE=%~dp0kiosk_icon.ico
set DESKTOP_DIR=%USERPROFILE%\Desktop
set SHORTCUT_PATH=%DESKTOP_DIR%\Kiosk Hisobot Adminka.lnk
set VBS_SCRIPT=%TEMP%\CreateKioskShortcut.vbs

echo Set oWS = WScript.CreateObject("WScript.Shell") > "%VBS_SCRIPT%"
echo sLinkFile = "%SHORTCUT_PATH%" >> "%VBS_SCRIPT%"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%VBS_SCRIPT%"
echo oLink.TargetPath = "%TARGET_BAT%" >> "%VBS_SCRIPT%"
echo oLink.WorkingDirectory = "%~dp0" >> "%VBS_SCRIPT%"
echo oLink.IconLocation = "%ICON_FILE%" >> "%VBS_SCRIPT%"
echo oLink.Description = "O'zbekiston Temir Yo'llari - Kiosk Hisobot Dasturi" >> "%VBS_SCRIPT%"
echo oLink.Save >> "%VBS_SCRIPT%"

cscript /nologo "%VBS_SCRIPT%"
del "%VBS_SCRIPT%"

echo.
echo MUVAFFAQIYATLI! Rabochiy stolingizda go'zal Kiosk iconkasi bilan "Kiosk Hisobot Adminka" yarligi yaratildi!
echo ==========================================================
pause

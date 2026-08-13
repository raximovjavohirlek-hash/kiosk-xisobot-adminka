@echo off
chcp 65001 > nul
title Kiosk Analytics - Direktorga Havola Yuborish
echo ==========================================================
echo  O'zbekiston Temir Yo'llari - Kiosk Analytics Sharing
echo  Direktorga yuborish uchun public havola yaratilmoqda...
echo ==========================================================
echo.
echo Diqqat: Ushbu oyna ochiq turganda havola ishlaydi.
echo.
ssh -o ServerAliveInterval=30 -o StrictHostKeyChecking=no -R 80:localhost:5050 nokey@localhost.run
pause

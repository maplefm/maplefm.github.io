@echo off
cd /d "%~dp0"
title Club FM Watcher
call findpy.bat
if not defined PY (
  echo.
  echo Python is not installed yet.
  echo Close this window, double click install.bat, wait until it says Done,
  echo then double click start.bat again.
  echo.
  pause
  exit /b
)
"%PY%" launcher.py
pause

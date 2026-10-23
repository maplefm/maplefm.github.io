@echo off
cd /d "%~dp0"
call findpy.bat
if not defined PY (
  echo Python is not installed yet. Double click install.bat first.
  pause
  exit /b
)
"%PY%" watcher.py --export
pause

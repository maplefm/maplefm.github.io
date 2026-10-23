@echo off
rem Finds Python 3 for Club FM Watcher and puts its path in PY.
set "PY="
for %%P in ("%LOCALAPPDATA%\Programs\Python\Python312\python.exe" "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" "%ProgramFiles%\Python312\python.exe" "%ProgramFiles%\Python313\python.exe" "%ProgramFiles%\Python311\python.exe" "C:\Python312\python.exe") do (
  if not defined PY if exist %%P set "PY=%%~P"
)
if not defined PY (
  for /f "delims=" %%i in ('py -3 -c "import sys;print(sys.executable)" 2^>nul') do if not defined PY set "PY=%%i"
)
if not defined PY (
  for /f "delims=" %%i in ('where python 2^>nul ^| findstr /v /i "WindowsApps"') do if not defined PY set "PY=%%i"
)

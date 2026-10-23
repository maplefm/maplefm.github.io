@echo off
cd /d "%~dp0"
title Club FM Watcher setup
echo This installs Python, the Tesseract text reader, and a few Python packages.
echo It can take a few minutes. If Windows asks for permission, click Yes.
echo.

call findpy.bat
if defined PY goto havepy
echo Installing Python...
winget install -e --id Python.Python.3.12 --scope user --accept-package-agreements --accept-source-agreements
call findpy.bat
if defined PY goto havepy
echo Downloading Python from python.org...
curl -L -o "%TEMP%\python-setup.exe" https://www.python.org/ftp/python/3.12.7/python-3.12.7-amd64.exe
"%TEMP%\python-setup.exe" /quiet InstallAllUsers=0 PrependPath=1 Include_launcher=1
call findpy.bat
if defined PY goto havepy
echo.
echo Python could not be installed automatically.
echo Install it from https://www.python.org/downloads/ and tick "Add python.exe to PATH",
echo then run install.bat again.
pause
exit /b

:havepy
echo Python found: %PY%
echo.

if exist "%ProgramFiles%\Tesseract-OCR\tesseract.exe" goto havetess
echo Installing Tesseract...
winget install -e --id UB-Mannheim.TesseractOCR --accept-package-agreements --accept-source-agreements
if exist "%ProgramFiles%\Tesseract-OCR\tesseract.exe" goto havetess
echo Downloading Tesseract...
curl -L -o "%TEMP%\tesseract-setup.exe" https://github.com/UB-Mannheim/tesseract/releases/download/v5.4.0.20240606/tesseract-ocr-w64-setup-5.4.0.20240606.exe
"%TEMP%\tesseract-setup.exe" /S
if exist "%ProgramFiles%\Tesseract-OCR\tesseract.exe" goto havetess
echo.
echo Tesseract could not be installed automatically. Run this file again, and click Yes if Windows asks.
pause
exit /b

:havetess
echo Tesseract found.
echo.
echo Installing Python packages...
"%PY%" -m pip install --upgrade pip
"%PY%" -m pip install pillow mss numpy rapidocr-onnxruntime
echo.
echo Done. Close this window, then double click start.bat
pause

@echo off
cd /d "%~dp0"
echo Downloading YES24 IT bestseller excel...
python download_yes24.py
echo.
echo Done. Press any key to close.
pause >nul

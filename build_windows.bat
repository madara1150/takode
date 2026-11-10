@echo off
rem Builds dist\Takode-Windows-Setup.exe and dist\Takode-Windows-Portable.zip
cd /d "%~dp0"
call npm install || exit /b 1
call npm run dist:win || exit /b 1
dir dist\Takode-Windows-*

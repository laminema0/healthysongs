@echo off
rem Starts MoodPath Live on http://localhost:8123 and opens your browser.
rem The camera only works on localhost, not when live.html is double-clicked directly.
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  node serve.js
) else (
  echo Node.js not found, trying Python...
  start "" http://localhost:8123/live.html
  python -m http.server 8123
)
pause

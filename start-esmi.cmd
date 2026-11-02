@echo off
title ESMI website (localhost:5174)
cd /d "%~dp0"
echo Starting the ESMI website at http://localhost:5174/
echo Close this window to stop it.
start "" http://localhost:5174/
node server.mjs
pause

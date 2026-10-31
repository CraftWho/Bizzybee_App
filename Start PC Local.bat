@echo off
REM Oct 31 2026 (Craft): double-click to open BizzyBee PC LOCAL (fake test account).
REM Runs tools\pc-local-server.mjs. Needs Node.js. Close this window to stop.
title BizzyBee PC Local
cd /d "%~dp0"
node tools\pc-local-server.mjs
pause

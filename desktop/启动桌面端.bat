@echo off
chcp 65001 >nul
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"
echo 🚀 正在启动计序...
call npm run dev
pause

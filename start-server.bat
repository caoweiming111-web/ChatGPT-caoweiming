@echo off
title MakeX Collaboration Server
cd /d "C:\Users\51155\Documents\Codex\2026-06-11\new-chat-2\outputs"
echo ========================================
echo   MakeX Server
echo   http://localhost:3456
echo   Press Ctrl+C to stop
echo ========================================
echo.
D:\node.exe server.js
if errorlevel 1 (
    echo.
    echo Server error. Check that node_modules/ws exists.
    echo Run: npm install
    pause
)

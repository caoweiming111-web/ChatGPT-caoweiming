@echo off
cd /d "C:\Users\51155\Documents\Codex\2026-06-13\https-caoweiming111-web-github-io-makex"
start "MakeX Server" /min D:\node.exe server.js
timeout /t 1 /nobreak >nul
start "" "http://localhost:3456"
exit

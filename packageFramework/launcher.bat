@echo off
chcp 65001 >nul 2>&1
title 自动化小说创作系统
color 0A

cd /d "%~dp0"

:: 打包版本
if exist "Novel Creator.exe" (
    powershell -Command "Start-Process -FilePath 'Novel Creator.exe' -NoNewWindow -Wait"
    goto :eof
)

if exist "novel-creator.exe" (
    powershell -Command "Start-Process -FilePath 'novel-creator.exe' -NoNewWindow -Wait"
    goto :eof
)

:: 开发版本 - 使用 node 直接调用 electron
node node_modules\electron\cli.js .

:eof
exit

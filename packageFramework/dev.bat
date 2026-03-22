@echo off
chcp 65001 >nul 2>&1
title 自动化小说创作系统 - 开发模式
color 0B

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║  自动化小说创作系统 - 开发模式                               ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

:: 检查 Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 未找到 Node.js
    echo [INFO] 请先安装 Node.js: https://nodejs.org/
    pause
    exit /b 1
)

echo [INFO] Node.js:
node --version
echo.

:: 安装依赖
if not exist "node_modules" (
    echo [INFO] 安装依赖中...
    call npm install
    echo.
)

echo [INFO] 启动 Electron...
echo.
call npx electron .

pause

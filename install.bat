@echo off
echo =====================================
echo  Playwright MCP Server Installation
echo =====================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [OK] Node.js is installed
node --version
echo.

REM Check if npm is available
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm is not available!
    echo Please ensure npm is in your PATH
    pause
    exit /b 1
)

echo [OK] npm is installed
npm --version
echo.

echo Installing dependencies...
echo.
call npm install

if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo Building TypeScript files...
echo.
call npm run build

if %errorlevel% neq 0 (
    echo [WARNING] Build failed - will use TypeScript directly
    echo.
)

echo.
echo =====================================
echo  Testing MCP Server Connection
echo =====================================
echo.

node test-mcp-connection.js

echo.
echo =====================================
echo  Installation Complete!
echo =====================================
echo.
echo Next steps:
echo 1. Copy the configuration from chatgpt-desktop-config.json
echo 2. Add it to your ChatGPT Desktop settings
echo 3. Restart ChatGPT Desktop
echo.
echo To start the server manually:
echo   npm run serve
echo.
pause
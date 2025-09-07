@echo off
REM Playwright MCP Server Setup Script for Windows
REM This script installs dependencies, builds the project, and runs tests

echo 🚀 Setting up Playwright MCP Server...
echo.

REM Check Node.js version
echo 📋 Checking Node.js version...
node --version
if errorlevel 1 (
    echo ❌ Node.js not found. Please install Node.js 18+ from https://nodejs.org
    exit /b 1
)

REM Install dependencies
echo.
echo 📦 Installing dependencies...
npm install
if errorlevel 1 (
    echo ❌ Failed to install dependencies
    exit /b 1
)

REM Install Playwright browsers
echo.
echo 🌐 Installing Playwright browsers...
npx playwright install
if errorlevel 1 (
    echo ❌ Failed to install Playwright browsers
    exit /b 1
)

REM Build the project
echo.
echo 🔨 Building TypeScript project...
npm run build
if errorlevel 1 (
    echo ❌ Failed to build project
    exit /b 1
)

REM Run basic test
echo.
echo 🧪 Running basic server test...
node test-server.js
if errorlevel 1 (
    echo ❌ Server test failed
    exit /b 1
)

echo.
echo ✅ Setup completed successfully!
echo.
echo 🎯 Next steps:
echo    • Start the server: npm start
echo    • Development mode: npm run dev
echo    • Run full tests: npm test
echo    • Check the README.md for usage examples
echo.
echo 🔗 Integration with ChatGPT Desktop:
echo    Add to your MCP config:
echo    {
echo      "mcpServers": {
echo        "playwright": {
echo          "command": "node",
echo          "args": ["%CD%\\dist\\server.js"],
echo          "cwd": "%CD%"
echo        }
echo      }
echo    }

pause
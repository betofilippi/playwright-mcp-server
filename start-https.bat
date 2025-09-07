@echo off
echo 🔒 Starting HTTPS MCP Server for ChatGPT Desktop...

rem Kill any existing node processes on port 3001
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3001 ^| findstr LISTENING') do (
    echo Killing process %%a using port 3001
    taskkill /PID %%a /F >nul 2>&1
)

rem Set environment variables
set HTTPS=true
set USE_HTTPS=true
set PORT=3443

cd /d "%~dp0"
echo 📋 Starting server with HTTPS=true on port 3443...

rem Start the server
npx tsx src/http-server.ts
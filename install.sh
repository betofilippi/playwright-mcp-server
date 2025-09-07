#!/bin/bash

echo "====================================="
echo " Playwright MCP Server Installation"
echo "====================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR]${NC} Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo -e "${GREEN}[OK]${NC} Node.js is installed"
node --version
echo ""

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo -e "${RED}[ERROR]${NC} npm is not available!"
    echo "Please ensure npm is in your PATH"
    exit 1
fi

echo -e "${GREEN}[OK]${NC} npm is installed"
npm --version
echo ""

echo "Installing dependencies..."
echo ""
npm install

if [ $? -ne 0 ]; then
    echo -e "${RED}[ERROR]${NC} Failed to install dependencies"
    exit 1
fi

echo ""
echo "Building TypeScript files..."
echo ""
npm run build

if [ $? -ne 0 ]; then
    echo -e "${YELLOW}[WARNING]${NC} Build failed - will use TypeScript directly"
    echo ""
fi

echo ""
echo "====================================="
echo " Testing MCP Server Connection"
echo "====================================="
echo ""

node test-mcp-connection.js

echo ""
echo "====================================="
echo " Installation Complete!"
echo "====================================="
echo ""
echo "Next steps:"
echo "1. Copy the configuration from chatgpt-desktop-config.json"
echo "2. Add it to your ChatGPT Desktop settings"
echo "3. Restart ChatGPT Desktop"
echo ""
echo "To start the server manually:"
echo "  npm run serve"
echo ""

# Make the script executable
chmod +x install.sh 2>/dev/null
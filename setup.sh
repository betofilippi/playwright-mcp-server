#!/bin/bash

# Playwright MCP Server Setup Script
# This script installs dependencies, builds the project, and runs tests

set -e

echo "🚀 Setting up Playwright MCP Server..."
echo

# Check Node.js version
echo "📋 Checking Node.js version..."
NODE_VERSION=$(node --version)
echo "   Node.js: $NODE_VERSION"

if ! node -e "process.exit(process.version.startsWith('v18.') || process.version.startsWith('v19.') || process.version.startsWith('v20.') || process.version.startsWith('v21.') ? 0 : 1)"; then
    echo "❌ Node.js 18+ required. Please upgrade Node.js"
    exit 1
fi

# Install dependencies
echo
echo "📦 Installing dependencies..."
npm install

# Install Playwright browsers
echo
echo "🌐 Installing Playwright browsers..."
npx playwright install

# Build the project
echo
echo "🔨 Building TypeScript project..."
npm run build

# Run basic test
echo
echo "🧪 Running basic server test..."
node test-server.js

echo
echo "✅ Setup completed successfully!"
echo
echo "🎯 Next steps:"
echo "   • Start the server: npm start"
echo "   • Development mode: npm run dev"
echo "   • Run full tests: npm test"
echo "   • Check the README.md for usage examples"
echo
echo "🔗 Integration with ChatGPT Desktop:"
echo '   Add to your MCP config:'
echo '   {'
echo '     "mcpServers": {'
echo '       "playwright": {'
echo '         "command": "node",'
echo "         \"args\": [\"$(pwd)/dist/server.js\"],"
echo "         \"cwd\": \"$(pwd)\""
echo '       }'
echo '     }'
echo '   }'
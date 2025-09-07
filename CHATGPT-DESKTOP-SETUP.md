# 🚀 ChatGPT Desktop Setup Guide for Playwright MCP Server

## ✅ Prerequisites

1. **Node.js 18+** installed ([Download Node.js](https://nodejs.org/))
2. **ChatGPT Desktop App** installed
3. **Git** (optional, for cloning the repository)
4. **Windows/macOS/Linux** supported

## 📦 Installation Steps

### Step 1: Install the MCP Server

```bash
# Navigate to the server directory
cd C:\Users\Beto\.claude\agents\playwright-mcp-server

# Install dependencies
npm install

# (Optional) Build for production
npm run build
```

### Step 2: Configure ChatGPT Desktop

#### Method 1: Using npm run (Recommended)

Add this configuration to your ChatGPT Desktop settings:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npm",
      "args": ["run", "serve"],
      "cwd": "C:/Users/Beto/.claude/agents/playwright-mcp-server"
    }
  }
}
```

#### Method 2: Using npx tsx (Development)

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["tsx", "src/server.ts"],
      "cwd": "C:/Users/Beto/.claude/agents/playwright-mcp-server"
    }
  }
}
```

#### Method 3: Using compiled JavaScript (Production)

```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": ["dist/server.js"],
      "cwd": "C:/Users/Beto/.claude/agents/playwright-mcp-server"
    }
  }
}
```

### Step 3: Access ChatGPT Desktop Settings

1. Open ChatGPT Desktop
2. Go to **Settings** → **Developer** → **MCP Servers**
3. Click **Add Server** or **Edit Configuration**
4. Paste the configuration from Step 2
5. Save and restart ChatGPT Desktop

## 🧪 Testing the Connection

### Quick Test
1. In ChatGPT Desktop, type: "List available Playwright tools"
2. You should see the 137+ available tools

### Test Browser Automation
```
"Launch a Chrome browser and go to example.com"
"Take a screenshot of the current page"
"Find all links on the page"
```

## 🛠️ Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `serve` | `npm run serve` | Run the MCP server (development) |
| `serve:prod` | `npm run serve:prod` | Run the compiled server (production) |
| `build` | `npm run build` | Compile TypeScript to JavaScript |
| `mcp` | `npm run mcp` | Alternative server start command |
| `dev` | `npm run dev` | Run with auto-reload (development only) |

## 🔧 Troubleshooting

### Server Not Starting

**Problem**: ChatGPT Desktop shows "Server failed to start"

**Solutions**:
1. Check Node.js is installed: `node --version`
2. Ensure dependencies are installed: `npm install`
3. Check the path is correct in the configuration
4. Try using absolute paths for the command

### Permission Denied

**Problem**: "EACCES" or "Permission denied" error

**Solutions**:
1. Run ChatGPT Desktop as administrator (Windows)
2. Check folder permissions
3. Ensure the user has read/write access to the directory

### Module Not Found

**Problem**: "Cannot find module" errors

**Solutions**:
1. Run `npm install` in the project directory
2. If using TypeScript, run `npm run build` first
3. Check that all dependencies are listed in package.json

### STDIO Issues

**Problem**: "Invalid JSON-RPC message" or communication errors

**Solutions**:
1. Ensure the server only writes MCP protocol messages to stdout
2. Check that console.log() is not used in the server code
3. Verify the transport is set to "stdio" in the server

## 🌐 Windows-Specific Configuration

### Using Full Paths (if npm/npx not in PATH)

```json
{
  "mcpServers": {
    "playwright": {
      "command": "C:\\Program Files\\nodejs\\npm.cmd",
      "args": ["run", "serve"],
      "cwd": "C:\\Users\\Beto\\.claude\\agents\\playwright-mcp-server"
    }
  }
}
```

### PowerShell Alternative

```json
{
  "mcpServers": {
    "playwright": {
      "command": "powershell",
      "args": ["-Command", "cd 'C:\\Users\\Beto\\.claude\\agents\\playwright-mcp-server'; npm run serve"],
      "cwd": "C:\\Users\\Beto\\.claude\\agents\\playwright-mcp-server"
    }
  }
}
```

## 🚀 Advanced Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
MCP_LOG_LEVEL=info
PLAYWRIGHT_BROWSERS_PATH=./browsers
MAX_BROWSER_INSTANCES=3
DEFAULT_TIMEOUT=30000
```

### Custom Browser Download Path

```bash
# Download browsers to custom location
PLAYWRIGHT_BROWSERS_PATH=./browsers npx playwright install
```

### Running Multiple Instances

For multiple instances with different configurations:

```json
{
  "mcpServers": {
    "playwright-dev": {
      "command": "npm",
      "args": ["run", "serve"],
      "cwd": "C:/path/to/dev/instance"
    },
    "playwright-prod": {
      "command": "npm",
      "args": ["run", "serve:prod"],
      "cwd": "C:/path/to/prod/instance"
    }
  }
}
```

## 📊 Server Capabilities

Once connected, you'll have access to:

- **55+ Browser & Page Management Tools**
- **58+ Element Interaction & Selection Tools**
- **24+ Network & API Tools**
- **Full Playwright API Coverage**
- **Enterprise Security Features**
- **Session Management**
- **Multi-browser Support** (Chrome, Firefox, Safari)

## 🔒 Security Notes

1. The server runs with the permissions of the ChatGPT Desktop app
2. Browser automation can access any website - use responsibly
3. Network interception features should be used carefully
4. Consider running in a sandboxed environment for production

## 📝 Support and Issues

If you encounter issues:

1. Check the [Troubleshooting](#-troubleshooting) section
2. Review the server logs (if logging is enabled)
3. Ensure all prerequisites are installed
4. Verify the configuration syntax is correct

## ✨ Quick Start Commands

```bash
# One-line setup (after navigating to the directory)
npm install && npm run build

# Start the server
npm run serve

# For production
npm run serve:prod
```

## 🎯 Ready to Use!

Your Playwright MCP Server is now configured for ChatGPT Desktop. Start automating browsers with natural language commands!
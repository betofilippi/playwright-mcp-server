# ⚡ Quick Start - Playwright MCP Server for ChatGPT Desktop

## 🚀 30-Second Setup

### 1️⃣ Install (One Time)
```bash
# Windows
install.bat

# macOS/Linux
chmod +x install.sh && ./install.sh
```

### 2️⃣ Add to ChatGPT Desktop

Copy this to your ChatGPT Desktop settings:

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

### 3️⃣ Restart ChatGPT Desktop

That's it! ✨

## 🧪 Test It Works

Ask ChatGPT:
- "Launch a Chrome browser and go to google.com"
- "Take a screenshot of the page"
- "Find all links on the page"

## 🔧 Manual Start

```bash
npm run serve
```

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| "Server not found" | Check the path in your config is correct |
| "npm not found" | Install Node.js from nodejs.org |
| "Module not found" | Run `npm install` in this directory |
| "Permission denied" | Windows: Run as admin / macOS: Use sudo |

## 📝 What You Get

- **137+ Automation Tools**
- **3 Browsers** (Chrome, Firefox, Safari)
- **Full Playwright API**
- **Network Interception**
- **API Testing**
- **And much more!**

---
💡 **Pro Tip**: The server needs to be running for ChatGPT Desktop to connect!
# Playwright MCP Server - Quick Start Guide

## ✅ Installation & Testing

### 1. Quick Setup
```bash
# Navigate to the project directory
cd playwright-mcp-server

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install

# Build the project
npm run build

# Test the server
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | node dist/server.js
```

### 2. Expected Output
```
Playwright MCP Server started - listening on STDIN
Registered 25 tools
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{"listChanged":false},"logging":{}},"serverInfo":{"name":"playwright-mcp-server","version":"1.0.0"}}}
```

## 🎯 Usage with ChatGPT Desktop

### MCP Configuration
Add to your `%APPDATA%\ChatGPT\config.json`:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": ["C:\\path\\to\\playwright-mcp-server\\dist\\server.js"],
      "cwd": "C:\\path\\to\\playwright-mcp-server"
    }
  }
}
```

### Available Tools (25 Total)

#### Browser Management (8 tools)
- `browser_launch_chromium` - Launch Chromium browser
- `browser_launch_firefox` - Launch Firefox browser  
- `browser_launch_webkit` - Launch WebKit browser
- `browser_close` - Close browser instance
- `browser_contexts_create` - Create browser context
- `browser_contexts_close` - Close browser context
- `browser_list_contexts` - List contexts in browser
- `browser_version` - Get browser info & stats

#### Page Navigation (11 tools)
- `page_goto` - Navigate to URL
- `page_go_back` - Navigate back in history
- `page_go_forward` - Navigate forward in history
- `page_reload` - Reload current page
- `page_close` - Close page/tab
- `page_title` - Get page title
- `page_url` - Get current URL
- `page_content` - Get HTML content
- `page_set_viewport` - Set viewport size
- `page_wait_for_load_state` - Wait for load state
- `page_screenshot` - Take page screenshot

#### Element Interaction (6 tools)
- `element_click` - Click on element
- `element_fill` - Fill input field
- `element_type` - Type text into element
- `element_hover` - Hover over element
- `element_screenshot` - Screenshot element
- `element_wait_for` - Wait for element state

## 🚀 Example Workflow

```bash
# 1. Launch browser
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"browser_launch_chromium","arguments":{"headless":false}}}

# 2. Create context
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"browser_contexts_create","arguments":{"browserId":"browser-uuid-here","viewport":{"width":1920,"height":1080}}}}

# 3. Navigate to page
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"page_goto","arguments":{"contextId":"context-uuid-here","url":"https://example.com"}}}

# 4. Fill form
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"element_fill","arguments":{"pageId":"page-uuid-here","selector":"#search","value":"playwright automation"}}}

# 5. Click button
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"element_click","arguments":{"pageId":"page-uuid-here","selector":"button[type='submit']"}}}

# 6. Take screenshot
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"page_screenshot","arguments":{"pageId":"page-uuid-here","fullPage":true}}}
```

## 🔧 Configuration

### Environment Variables
```bash
MAX_BROWSERS=5                    # Maximum concurrent browsers
MAX_CONTEXTS_PER_BROWSER=10      # Maximum contexts per browser
MAX_PAGES_PER_CONTEXT=20         # Maximum pages per context
SESSION_TIMEOUT=3600000          # Session timeout (1 hour)
CLEANUP_INTERVAL=300000          # Cleanup interval (5 minutes)
RATE_LIMIT_WINDOW=60000          # Rate limit window (1 minute)
RATE_LIMIT_MAX=100               # Max requests per window
```

## 🛠️ Development

### Scripts
- `npm run dev` - Development with auto-reload
- `npm run build` - Build TypeScript
- `npm test` - Run tests
- `npm start` - Start production server

### File Structure
```
src/
├── server.ts              # Main MCP server implementation
├── types.ts               # TypeScript type definitions
├── tools/
│   ├── browser.ts         # Browser management tools
│   ├── page.ts            # Page navigation tools
│   └── elements.ts        # Element interaction tools
├── services/
│   ├── session.ts         # Session management
│   └── playwright.ts      # Playwright wrapper service
└── utils/
    ├── validation.ts      # Input validation
    └── errors.ts          # Error handling
```

## ⚡ Performance Features

- **Session Management**: Automatic cleanup and resource management
- **Rate Limiting**: Configurable request throttling
- **Error Handling**: Comprehensive error recovery
- **Security**: Input validation and sanitization
- **Resource Limits**: Configurable browser/context/page limits
- **Memory Management**: Automatic cleanup of expired sessions

## 🎯 Production Ready

✅ **MCP Protocol v2024-11-05 Compliant**  
✅ **JSON-RPC 2.0 Support**  
✅ **STDIO Transport for ChatGPT Desktop**  
✅ **Comprehensive Error Handling**  
✅ **Input Validation & Security**  
✅ **Session Management**  
✅ **Rate Limiting**  
✅ **TypeScript Type Safety**  
✅ **25 Essential Tools**  
✅ **Automatic Resource Cleanup**  

This is a production-ready base implementation that provides 25 essential browser automation tools. The architecture supports extension to 150+ tools across 18 categories for enterprise use cases.

## 🆘 Troubleshooting

**Server won't start**: Check Node.js version (requires 18+)  
**Browser launch fails**: Run `npx playwright install`  
**Session errors**: Check that IDs are valid UUIDs  
**Rate limiting**: Reduce request frequency  

For detailed documentation, see [README.md](./README.md)
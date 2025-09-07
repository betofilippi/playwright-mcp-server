# Playwright MCP Server

A production-ready Model Context Protocol (MCP) server for Playwright browser automation. Provides 25 essential tools across browser management, page navigation, and element interaction capabilities.

## 🚀 Quick Start

### Installation

```bash
# Clone or create the project
mkdir playwright-mcp-server && cd playwright-mcp-server

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install

# Build the project
npm run build

# Start the server
npm start
```

### Basic Usage

The server communicates via STDIO using JSON-RPC 2.0 protocol. Here's a simple example:

```json
// Initialize the server
{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "test-client", "version": "1.0.0"}}}

// List available tools
{"jsonrpc": "2.0", "id": 2, "method": "tools/list"}

// Launch a browser
{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "browser_launch_chromium", "arguments": {"headless": true}}}

// Navigate to a page
{"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "page_goto", "arguments": {"contextId": "context-id-here", "url": "https://example.com"}}}
```

## 📋 Available Tools (25 Total)

### Browser Management (8 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `browser_launch_chromium` | Launch Chromium browser | `headless`, `viewport`, `timeout` |
| `browser_launch_firefox` | Launch Firefox browser | `headless`, `viewport`, `timeout` |
| `browser_launch_webkit` | Launch WebKit browser | `headless`, `viewport`, `timeout` |
| `browser_close` | Close browser instance | `browserId`, `force` |
| `browser_contexts_create` | Create browser context | `browserId`, `userAgent`, `viewport` |
| `browser_contexts_close` | Close browser context | `contextId` |
| `browser_list_contexts` | List contexts in browser | `browserId` |
| `browser_version` | Get browser info & stats | - |

### Page Navigation (11 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `page_goto` | Navigate to URL | `contextId`, `url`, `waitUntil` |
| `page_go_back` | Navigate back in history | `pageId`, `timeout` |
| `page_go_forward` | Navigate forward in history | `pageId`, `timeout` |
| `page_reload` | Reload current page | `pageId`, `timeout` |
| `page_close` | Close page/tab | `pageId` |
| `page_title` | Get page title | `pageId` |
| `page_url` | Get current URL | `pageId` |
| `page_content` | Get HTML content | `pageId` |
| `page_set_viewport` | Set viewport size | `pageId`, `width`, `height` |
| `page_wait_for_load_state` | Wait for load state | `pageId`, `state`, `timeout` |
| `page_screenshot` | Take page screenshot | `pageId`, `type`, `fullPage` |

### Element Interaction (6 tools)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `element_click` | Click on element | `pageId`, `selector`, `button` |
| `element_fill` | Fill input field | `pageId`, `selector`, `value` |
| `element_type` | Type text into element | `pageId`, `selector`, `text` |
| `element_hover` | Hover over element | `pageId`, `selector`, `position` |
| `element_screenshot` | Screenshot element | `pageId`, `selector`, `type` |
| `element_wait_for` | Wait for element state | `pageId`, `selector`, `state` |

## 🔧 Configuration

### Environment Variables

```bash
# Session Management
MAX_BROWSERS=5                    # Maximum concurrent browsers
MAX_CONTEXTS_PER_BROWSER=10      # Maximum contexts per browser
MAX_PAGES_PER_CONTEXT=20         # Maximum pages per context
SESSION_TIMEOUT=3600000          # Session timeout (1 hour)
CLEANUP_INTERVAL=300000          # Cleanup interval (5 minutes)

# Rate Limiting
RATE_LIMIT_WINDOW=60000          # Rate limit window (1 minute)
RATE_LIMIT_MAX=100               # Max requests per window

# Security
NODE_ENV=production              # Blocks local network access
```

### Session Hierarchy

```
Browser Session (1-5 instances)
├── Browser Context (1-10 per browser)
│   ├── Page Session (1-20 per context)
│   ├── Page Session
│   └── ...
├── Browser Context
└── ...
```

## 🛠️ Development

### Project Structure

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

### Development Commands

```bash
# Development with auto-reload
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test

# Lint code
npm run lint

# Format code
npm run format
```

### Adding New Tools

1. Define the tool schema in `src/tools/[category].ts`
2. Add the tool name to `ToolName` type in `types.ts`
3. Implement execution logic in `server.ts`
4. Add validation schemas if needed

## 🔐 Security Features

### Input Validation
- **URL Validation**: Blocks dangerous protocols and local networks in production
- **Selector Sanitization**: Prevents XSS and injection attacks
- **File Path Validation**: Prevents directory traversal
- **Parameter Validation**: Uses Zod schemas for type safety

### Rate Limiting
- Configurable request limits per method
- Per-method rate limiting with exponential backoff
- Memory-efficient sliding window implementation

### Resource Management
- Automatic cleanup of expired sessions
- Memory usage monitoring
- Graceful shutdown handling
- Resource limits enforcement

## 📊 Monitoring & Debugging

### Session Statistics

```json
{
  "totalBrowsers": 2,
  "totalContexts": 4,
  "totalPages": 8,
  "memoryUsage": {
    "rss": 150000000,
    "heapUsed": 120000000,
    "heapTotal": 140000000
  }
}
```

### Error Handling

The server provides detailed error responses with MCP-compliant error codes:

- `-32700`: Parse error
- `-32600`: Invalid request
- `-32601`: Method not found
- `-32602`: Invalid params
- `-32603`: Internal error
- `-32000`: Timeout
- `-32002`: Resource not found

### Logging

Structured logging with timestamps and context:

```
2024-01-15T10:30:00.000Z [browser_launch_chromium] Browser launched successfully: chrome-123
2024-01-15T10:30:01.000Z [session_cleanup] Cleaned up 2 expired sessions
2024-01-15T10:30:02.000Z [error] Navigation failed: net::ERR_NAME_NOT_RESOLVED
```

## 🎯 Usage Examples

### Complete Automation Workflow

```json
// 1. Launch browser
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "browser_launch_chromium", "arguments": {"headless": false}}}
// Response: {"browserId": "browser-uuid-123"}

// 2. Create context
{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "browser_contexts_create", "arguments": {"browserId": "browser-uuid-123", "viewport": {"width": 1920, "height": 1080}}}}
// Response: {"contextId": "context-uuid-456"}

// 3. Navigate to page
{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "page_goto", "arguments": {"contextId": "context-uuid-456", "url": "https://example.com"}}}
// Response: {"pageId": "page-uuid-789", "title": "Example Domain"}

// 4. Fill form
{"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "element_fill", "arguments": {"pageId": "page-uuid-789", "selector": "#search", "value": "playwright automation"}}}

// 5. Click button
{"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "element_click", "arguments": {"pageId": "page-uuid-789", "selector": "button[type='submit']"}}}

// 6. Take screenshot
{"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": {"name": "page_screenshot", "arguments": {"pageId": "page-uuid-789", "fullPage": true}}}
```

### Error Handling Example

```json
// Invalid selector
{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "element_click", "arguments": {"pageId": "invalid-id", "selector": ""}}}

// Response
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Parameter validation failed",
    "data": {
      "validationErrors": [
        {"path": "selector", "message": "String must contain at least 1 character(s)"}
      ]
    }
  }
}
```

## 🚀 Integration Examples

### ChatGPT Desktop Integration

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": ["/path/to/playwright-mcp-server/dist/server.js"],
      "cwd": "/path/to/playwright-mcp-server"
    }
  }
}
```

### Custom Client Integration

```typescript
import { spawn } from 'child_process';

const server = spawn('node', ['dist/server.js'], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

// Send MCP requests
server.stdin.write(JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { /* ... */ }
}) + '\n');

// Handle responses
server.stdout.on('data', (data) => {
  const responses = data.toString().trim().split('\n');
  responses.forEach(response => {
    const parsed = JSON.parse(response);
    console.log('Received:', parsed);
  });
});
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Add comprehensive error handling
- Include input validation for all tools
- Write unit tests for new functionality
- Update documentation for API changes

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

**Browser launch fails**
```bash
# Install browsers
npx playwright install

# Check browser paths
npx playwright install --help
```

**Session not found errors**
- Check that browser/context/page IDs are valid UUIDs
- Verify sessions haven't expired (default 1 hour timeout)
- Check server logs for cleanup messages

**Rate limiting**
- Reduce request frequency
- Check rate limit settings in environment variables
- Implement exponential backoff in client

**Memory issues**
- Monitor session statistics
- Reduce concurrent browser/context/page limits
- Implement regular cleanup cycles

### Debug Mode

```bash
# Enable verbose logging
DEBUG=playwright:* npm start

# Monitor memory usage
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

## 🔮 Roadmap

This base implementation includes 25 essential tools. The full architecture supports 150+ tools across 18 categories:

- **Advanced Element Operations** (20+ tools)
- **Form Handling** (15+ tools)
- **Network & API Integration** (10+ tools)  
- **File Operations** (8+ tools)
- **Authentication & Security** (12+ tools)
- **Testing & Validation** (15+ tools)
- **Performance Monitoring** (10+ tools)
- **Mobile & Device Emulation** (8+ tools)
- **Accessibility Testing** (6+ tools)
- **Visual Testing** (8+ tools)
- **Database Integration** (5+ tools)

Contact the development team for enterprise features and extended tool sets.
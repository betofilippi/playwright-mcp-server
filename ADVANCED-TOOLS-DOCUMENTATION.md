# Advanced Browser & Page Management Tools Documentation

## Overview

This enhanced Playwright MCP server now includes **55+ comprehensive browser automation tools**, extending the original 25 base tools with 30+ advanced tools for complete browser and page management scenarios.

## Tool Categories

### **Base Tools (25 tools)**
- **Browser Management (8 tools)**: Launch, close, manage browser sessions
- **Page Navigation (11 tools)**: Navigate, reload, manage pages
- **Element Interaction (6 tools)**: Click, type, interact with elements

### **Advanced Browser Management Tools (15 tools)**

#### Browser Instance Management
1. **`browser_get_contexts`** - Get all contexts for a browser with detailed information
2. **`browser_new_context`** - Create new context with comprehensive configuration options
3. **`browser_is_connected`** - Check browser connection status and health
4. **`browser_disconnect`** - Gracefully disconnect from browser with cleanup options
5. **`browser_get_pages`** - Get all pages across contexts or specific context
6. **`browser_get_user_agent`** - Get browser default user agent string

#### Browser Configuration & Options  
7. **`browser_set_default_timeout`** - Set default timeout for all operations
8. **`browser_set_default_navigation_timeout`** - Set navigation timeout for contexts
9. **`browser_add_init_script`** - Add script to run on every new page
10. **`browser_set_extra_http_headers`** - Set additional HTTP headers for context
11. **`browser_grant_permissions`** - Grant browser permissions (geolocation, camera, etc.)
12. **`browser_clear_permissions`** - Clear all granted permissions from context
13. **`browser_set_geolocation`** - Set geolocation coordinates for context
14. **`browser_set_offline`** - Set offline network mode for context
15. **`browser_get_cookies`** - Get all cookies from context with filtering options

### **Advanced Page Management Tools (15 tools)**

#### Page Content & State Management
1. **`page_set_content`** - Set HTML content directly with wait options
2. **`page_get_inner_html`** - Get inner HTML of page or specific element
3. **`page_get_outer_html`** - Get outer HTML of page or specific element
4. **`page_evaluate`** - Execute JavaScript in page context with arguments
5. **`page_evaluate_handle`** - Execute JS and return object handle for complex objects
6. **`page_add_script_tag`** - Add script tag from URL, file path, or inline content
7. **`page_add_style_tag`** - Add CSS styles from URL, file path, or inline content
8. **`page_expose_function`** - Expose function to page context for JavaScript access

#### Page Event Monitoring & Debugging
9. **`page_wait_for_event`** - Wait for specific page event (console, dialog, download, etc.)
10. **`page_wait_for_function`** - Wait for JavaScript function to return truthy value
11. **`page_wait_for_selector`** - Wait for CSS selector with state options
12. **`page_wait_for_timeout`** - Wait for specified timeout (use sparingly)
13. **`page_get_console_messages`** - Get console messages with filtering and limits
14. **`page_clear_console`** - Clear console message history
15. **`page_pause`** - Pause page execution for debugging

### **System Management Tools (5 tools)**

#### Browser Pool Management
1. **`browser_pool_stats`** - Get comprehensive pool statistics and memory usage
2. **`browser_health_check`** - Perform health check and cleanup disconnected browsers

#### Page Event Monitoring System
3. **`page_monitoring_start`** - Start comprehensive event monitoring for a page
4. **`page_monitoring_stop`** - Stop event monitoring for a page
5. **`page_event_history`** - Get event history with filtering options

## Advanced Features

### **Browser Pool Management**
- **Connection Pooling**: Reuse healthy browser instances for efficiency
- **Health Monitoring**: Automatic detection and cleanup of disconnected browsers
- **Resource Optimization**: Smart context and page reuse strategies
- **Statistics Tracking**: Comprehensive pool statistics and memory monitoring

### **Context Lifecycle Management**
- **Advanced Options**: Support for 20+ context configuration options
- **Permission Management**: Grant/revoke browser permissions with origin support
- **Network Simulation**: Offline mode, custom headers, geolocation simulation
- **Security Features**: Credential management, proxy support, CSP bypass

### **Page Event Monitoring**
- **Event Types**: Console, dialog, request, response, download, error, popup, worker
- **History Tracking**: Persistent event history with filtering and limits
- **Real-time Monitoring**: Live event capture with configurable event types
- **Performance Metrics**: Memory usage and network activity tracking

### **Security Framework**
- **Input Validation**: Comprehensive Zod-based parameter validation
- **Content Sanitization**: HTML and JavaScript content sanitization
- **Permission Control**: Granular permission management and validation
- **Rate Limiting**: Built-in rate limiting for resource-intensive operations
- **Domain Filtering**: Allowed/blocked domain lists for network requests

### **Error Handling & Recovery**
- **Retry Mechanisms**: Automatic retry with exponential backoff
- **Resource Cleanup**: Comprehensive cleanup on errors with timeout handling
- **Error Diagnostics**: Detailed error information with context and suggestions
- **Recovery Strategies**: Configurable fallback actions (ignore, cleanup, reconnect)

### **Performance Optimization**
- **Caching Layer**: Response and session caching with configurable TTL
- **Streaming Support**: Progress reporting for long-running operations
- **Connection Management**: Efficient transport layer with multiple protocols
- **Memory Monitoring**: Automatic memory usage tracking and alerts

## Configuration Options

### Environment Variables

```bash
# Core Settings
MAX_BROWSERS=5                      # Maximum browser instances
MAX_CONTEXTS_PER_BROWSER=10        # Maximum contexts per browser
MAX_PAGES_PER_CONTEXT=20          # Maximum pages per context
SESSION_TIMEOUT=3600000           # Session timeout (1 hour)
CLEANUP_INTERVAL=300000           # Cleanup interval (5 minutes)

# Advanced Features
ENABLE_ADVANCED_TOOLS=true        # Enable 30+ advanced tools
ENABLE_BROWSER_POOLING=true       # Enable browser pooling
ENABLE_EVENT_MONITORING=true      # Enable page event monitoring
ENABLE_SECURITY_VALIDATION=true   # Enable security validation
ENABLE_ADVANCED_ERROR_HANDLING=true # Enable advanced error handling

# Performance Settings
MAX_CONCURRENT_OPERATIONS=50      # Maximum concurrent operations
OPERATION_TIMEOUT=300000          # Operation timeout (5 minutes)
CACHE_MAX_SIZE=104857600         # Cache size (100MB)
CACHE_DEFAULT_TTL=300000         # Cache TTL (5 minutes)

# Security Settings
ENABLE_RATE_LIMIT=true           # Enable rate limiting
RATE_LIMIT_WINDOW=60000          # Rate limit window (1 minute)
RATE_LIMIT_MAX=100               # Rate limit max requests
CORS_ORIGINS="*"                 # CORS allowed origins

# Transport Settings
ENABLE_STDIO=true                # Enable STDIO (primary for ChatGPT)
ENABLE_SSE=false                 # Enable Server-Sent Events
ENABLE_WEBSOCKET=false           # Enable WebSocket
SSE_PORT=3001                    # SSE server port
WS_PORT=3002                     # WebSocket server port
```

## Usage Examples

### Browser Context Management

```javascript
// Create a new context with advanced options
{
  "tool": "browser_new_context",
  "params": {
    "browserId": "browser-uuid",
    "viewport": { "width": 1920, "height": 1080 },
    "userAgent": "Custom Bot 1.0",
    "permissions": ["geolocation", "camera"],
    "geolocation": { "latitude": 40.7128, "longitude": -74.0060 },
    "offline": false,
    "extraHTTPHeaders": {
      "Accept-Language": "en-US,en;q=0.9"
    }
  }
}

// Grant additional permissions
{
  "tool": "browser_grant_permissions",
  "params": {
    "contextId": "context-uuid",
    "permissions": ["microphone", "notifications"],
    "origin": "https://example.com"
  }
}
```

### Page Content Management

```javascript
// Set custom HTML content
{
  "tool": "page_set_content",
  "params": {
    "pageId": "page-uuid",
    "html": "<html><body><h1>Test Page</h1></body></html>",
    "waitUntil": "domcontentloaded"
  }
}

// Execute JavaScript with arguments
{
  "tool": "page_evaluate",
  "params": {
    "pageId": "page-uuid",
    "expression": "(x, y) => x + y",
    "args": [5, 10]
  }
}

// Add external script
{
  "tool": "page_add_script_tag",
  "params": {
    "pageId": "page-uuid",
    "url": "https://cdn.jsdelivr.net/npm/jquery@3.6.0/dist/jquery.min.js"
  }
}
```

### Event Monitoring

```javascript
// Start comprehensive monitoring
{
  "tool": "page_monitoring_start",
  "params": {
    "pageId": "page-uuid",
    "events": ["console", "dialog", "request", "response", "pageerror"]
  }
}

// Get console messages with filtering
{
  "tool": "page_get_console_messages",
  "params": {
    "pageId": "page-uuid",
    "level": "error",
    "limit": 50,
    "since": "2023-01-01T00:00:00Z"
  }
}

// Get event history
{
  "tool": "page_event_history",
  "params": {
    "pageId": "page-uuid",
    "eventType": "request",
    "limit": 100
  }
}
```

### System Management

```javascript
// Get browser pool statistics
{
  "tool": "browser_pool_stats",
  "params": {}
}

// Perform health check
{
  "tool": "browser_health_check",
  "params": {
    "cleanup": true
  }
}
```

## Error Handling

All advanced tools include comprehensive error handling with:

- **Retry Logic**: Automatic retry with exponential backoff
- **Resource Cleanup**: Proper cleanup of browser resources on errors
- **Detailed Diagnostics**: Comprehensive error information and context
- **Recovery Strategies**: Configurable fallback actions

## Security Features

- **Input Validation**: All parameters validated with Zod schemas
- **Content Sanitization**: HTML/JavaScript content sanitized for safety
- **Permission Management**: Fine-grained browser permission control
- **Rate Limiting**: Prevents abuse of resource-intensive operations
- **Domain Filtering**: Control allowed/blocked domains for requests

## Performance Characteristics

- **Memory Efficient**: Smart resource pooling and cleanup
- **High Throughput**: Support for 50+ concurrent operations
- **Caching**: Response caching with configurable TTL
- **Monitoring**: Built-in memory and performance monitoring
- **Scalable**: Designed for high-volume automation scenarios

## Integration with ChatGPT Desktop

This enhanced server is optimized for ChatGPT Desktop with:

- **Primary STDIO Transport**: Direct integration with ChatGPT Desktop
- **Rich Error Messages**: Detailed error information for troubleshooting  
- **Progress Reporting**: Real-time progress for long-running operations
- **Context Window Optimization**: Efficient response formatting
- **Tool Recommendations**: Smart suggestions based on context

## Tool Summary

| Category | Basic Tools | Advanced Tools | Total |
|----------|-------------|----------------|-------|
| Browser Management | 8 | 15 | 23 |
| Page Management | 11 | 15 | 26 |
| Element Interaction | 6 | 0 | 6 |
| System Management | 0 | 5 | 5 |
| **Total** | **25** | **35** | **60** |

The enhanced server provides **60 comprehensive tools** for complete browser automation scenarios, making it one of the most feature-rich MCP servers available for ChatGPT Desktop integration.

## Getting Started

1. **Install Dependencies**: `npm install`
2. **Build Server**: `npm run build`
3. **Start Enhanced Server**: `npm start`
4. **Configure ChatGPT Desktop**: Add server to MCP settings
5. **Test Tools**: Use any of the 60 available tools

The server automatically detects and configures advanced features based on environment variables, providing a seamless upgrade path from basic to advanced functionality.
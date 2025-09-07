import { MCPTool } from '../types.js';
import { PlaywrightService } from '../services/playwright.js';

/**
 * Advanced Page Management Tools
 * 15 additional tools for comprehensive page content, state, and event management
 */
export function createAdvancedPageTools(_playwrightService: PlaywrightService): MCPTool[] {
  return [
    // 1. Set Page HTML Content
    {
      name: 'page_set_content',
      description: 'Set the HTML content of a page directly. Useful for testing with custom HTML or loading content without navigation.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to set content for',
          },
          html: {
            type: 'string',
            minLength: 1,
            maxLength: 10000000, // 10MB limit
            description: 'HTML content to set on the page',
          },
          waitUntil: {
            type: 'string',
            enum: ['load', 'domcontentloaded', 'networkidle'],
            default: 'load',
            description: 'When to consider the content loading complete',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 30000,
            description: 'Timeout in milliseconds',
          },
        },
        required: ['pageId', 'html'],
        additionalProperties: false,
      },
    },

    // 2. Get Page Inner HTML
    {
      name: 'page_get_inner_html',
      description: 'Get the inner HTML of the page or a specific element. Returns the HTML content inside the element.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to get inner HTML from',
          },
          selector: {
            type: 'string',
            minLength: 1,
            description: 'CSS selector for element (gets full page HTML if not specified)',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Timeout to wait for selector',
          },
        },
        required: ['pageId'],
        additionalProperties: false,
      },
    },

    // 3. Get Page Outer HTML
    {
      name: 'page_get_outer_html',
      description: 'Get the outer HTML of the page or a specific element. Returns the HTML content including the element itself.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to get outer HTML from',
          },
          selector: {
            type: 'string',
            minLength: 1,
            description: 'CSS selector for element (gets full page HTML if not specified)',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Timeout to wait for selector',
          },
        },
        required: ['pageId'],
        additionalProperties: false,
      },
    },

    // 4. Execute JavaScript in Page
    {
      name: 'page_evaluate',
      description: 'Execute JavaScript code in the page context and return the result. Supports passing arguments to the script.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to execute script in',
          },
          expression: {
            type: 'string',
            minLength: 1,
            maxLength: 100000, // 100KB limit
            description: 'JavaScript expression or function to execute',
          },
          args: {
            type: 'array',
            items: { type: 'any' },
            description: 'Arguments to pass to the JavaScript function',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 30000,
            description: 'Script execution timeout in milliseconds',
          },
        },
        required: ['pageId', 'expression'],
        additionalProperties: false,
      },
    },

    // 5. Execute JavaScript and Return Handle
    {
      name: 'page_evaluate_handle',
      description: 'Execute JavaScript in the page context and return a handle to the result object. Useful for complex objects that need to be referenced later.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to execute script in',
          },
          expression: {
            type: 'string',
            minLength: 1,
            maxLength: 100000,
            description: 'JavaScript expression or function to execute',
          },
          args: {
            type: 'array',
            items: { type: 'any' },
            description: 'Arguments to pass to the JavaScript function',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 30000,
            description: 'Script execution timeout in milliseconds',
          },
        },
        required: ['pageId', 'expression'],
        additionalProperties: false,
      },
    },

    // 6. Add Script Tag to Page
    {
      name: 'page_add_script_tag',
      description: 'Add a script tag to the page. Can load from URL, file path, or inline content.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to add script to',
          },
          url: {
            type: 'string',
            format: 'uri',
            description: 'URL of script to load',
          },
          path: {
            type: 'string',
            description: 'Path to local script file',
          },
          content: {
            type: 'string',
            description: 'Inline JavaScript content',
          },
          type: {
            type: 'string',
            default: 'text/javascript',
            description: 'Script MIME type',
          },
        },
        required: ['pageId'],
        additionalProperties: false,
        oneOf: [
          { required: ['url'] },
          { required: ['path'] },
          { required: ['content'] },
        ],
      },
    },

    // 7. Add Style Tag to Page
    {
      name: 'page_add_style_tag',
      description: 'Add a style tag to the page. Can load CSS from URL, file path, or inline content.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to add styles to',
          },
          url: {
            type: 'string',
            format: 'uri',
            description: 'URL of CSS file to load',
          },
          path: {
            type: 'string',
            description: 'Path to local CSS file',
          },
          content: {
            type: 'string',
            description: 'Inline CSS content',
          },
        },
        required: ['pageId'],
        additionalProperties: false,
        oneOf: [
          { required: ['url'] },
          { required: ['path'] },
          { required: ['content'] },
        ],
      },
    },

    // 8. Expose Function to Page
    {
      name: 'page_expose_function',
      description: 'Expose a function to the page context so it can be called from JavaScript running in the page.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to expose function to',
          },
          name: {
            type: 'string',
            pattern: '^[a-zA-Z_$][a-zA-Z0-9_$]*$',
            minLength: 1,
            maxLength: 100,
            description: 'Function name (valid JavaScript identifier)',
          },
          playwrightFunction: {
            type: 'string',
            minLength: 1,
            maxLength: 10000,
            description: 'Function implementation as string',
          },
        },
        required: ['pageId', 'name', 'playwrightFunction'],
        additionalProperties: false,
      },
    },

    // 9. Wait for Page Event
    {
      name: 'page_wait_for_event',
      description: 'Wait for a specific page event to occur. Useful for waiting for downloads, dialogs, console messages, etc.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to wait for event on',
          },
          event: {
            type: 'string',
            enum: [
              'console', 'dialog', 'download', 'filechooser', 'frameattached',
              'framedetached', 'framenavigated', 'load', 'domcontentloaded',
              'networkidle', 'pageerror', 'popup', 'request', 'requestfailed',
              'requestfinished', 'response', 'websocket', 'worker', 'close'
            ],
            description: 'Event type to wait for',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 30000,
            description: 'Timeout to wait for event in milliseconds',
          },
          predicate: {
            type: 'string',
            description: 'Optional JavaScript predicate function to filter events',
          },
        },
        required: ['pageId', 'event'],
        additionalProperties: false,
      },
    },

    // 10. Wait for JavaScript Function
    {
      name: 'page_wait_for_function',
      description: 'Wait for a JavaScript function to return a truthy value. Polls the function until it returns true or timeout.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to execute function on',
          },
          expression: {
            type: 'string',
            minLength: 1,
            maxLength: 10000,
            description: 'JavaScript expression that should return truthy value',
          },
          args: {
            type: 'array',
            items: { type: 'any' },
            description: 'Arguments to pass to the function',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 30000,
            description: 'Timeout in milliseconds',
          },
          polling: {
            oneOf: [
              { type: 'number', minimum: 100 },
              { type: 'string', enum: ['raf'] },
            ],
            default: 100,
            description: 'Polling interval in milliseconds or "raf" for requestAnimationFrame',
          },
        },
        required: ['pageId', 'expression'],
        additionalProperties: false,
      },
    },

    // 11. Wait for Selector
    {
      name: 'page_wait_for_selector',
      description: 'Wait for a CSS selector to appear in the page. Can wait for element to be attached, visible, or hidden.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to wait for selector on',
          },
          selector: {
            type: 'string',
            minLength: 1,
            description: 'CSS selector to wait for',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 30000,
            description: 'Timeout in milliseconds',
          },
          state: {
            type: 'string',
            enum: ['attached', 'detached', 'visible', 'hidden'],
            default: 'visible',
            description: 'State to wait for',
          },
        },
        required: ['pageId', 'selector'],
        additionalProperties: false,
      },
    },

    // 12. Wait for Timeout
    {
      name: 'page_wait_for_timeout',
      description: 'Wait for a specified amount of time. Use sparingly as it makes tests slower and more brittle.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to pause',
          },
          timeout: {
            type: 'number',
            minimum: 100,
            maximum: 300000,
            description: 'Time to wait in milliseconds',
          },
        },
        required: ['pageId', 'timeout'],
        additionalProperties: false,
      },
    },

    // 13. Get Console Messages
    {
      name: 'page_get_console_messages',
      description: 'Get console messages from the page. Can filter by log level and limit results.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to get console messages from',
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 1000,
            default: 100,
            description: 'Maximum number of messages to return',
          },
          level: {
            type: 'string',
            enum: ['log', 'warning', 'error', 'info', 'debug'],
            description: 'Filter by log level (returns all if not specified)',
          },
          since: {
            type: 'string',
            format: 'date-time',
            description: 'Only return messages since this timestamp',
          },
        },
        required: ['pageId'],
        additionalProperties: false,
      },
    },

    // 14. Clear Console Messages
    {
      name: 'page_clear_console',
      description: 'Clear console message history for a page. Useful for starting fresh before testing console output.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to clear console for',
          },
        },
        required: ['pageId'],
        additionalProperties: false,
      },
    },

    // 15. Pause Page Execution
    {
      name: 'page_pause',
      description: 'Pause page execution for debugging. When in headed mode, this will pause the browser for manual inspection.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to pause',
          },
        },
        required: ['pageId'],
        additionalProperties: false,
      },
    },
  ];
}
import { MCPTool } from '../types.js';
import { PlaywrightService } from '../services/playwright.js';

/**
 * Creates page navigation tools
 * 10 tools for navigating, managing pages, and controlling page state
 */
export function createPageTools(_playwrightService: PlaywrightService): MCPTool[] {
  return [
    // 1. Navigate to URL
    {
      name: 'page_goto',
      description: 'Navigate to a URL in a browser context. Creates a new page if none exists. Returns page ID and navigation details.',
      inputSchema: {
        type: 'object',
        properties: {
          contextId: {
            type: 'string',
            format: 'uuid',
            description: 'Browser context ID where the navigation should occur',
          },
          url: {
            type: 'string',
            format: 'uri',
            description: 'URL to navigate to (must be http, https, or file protocol)',
          },
          waitUntil: {
            type: 'string',
            enum: ['load', 'domcontentloaded', 'networkidle'],
            default: 'load',
            description: 'When to consider navigation successful',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 30000,
            description: 'Navigation timeout in milliseconds (1-300 seconds)',
          },
          referer: {
            type: 'string',
            format: 'uri',
            description: 'Referer header value for the navigation',
          },
        },
        required: ['contextId', 'url'],
        additionalProperties: false,
      },
    },

    // 2. Go Back in History
    {
      name: 'page_go_back',
      description: 'Navigate back to the previous page in browser history. Similar to clicking the browser back button.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID to navigate back',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 30000,
            description: 'Navigation timeout in milliseconds (1-300 seconds)',
          },
        },
        required: ['pageId'],
        additionalProperties: false,
      },
    },

    // 3. Go Forward in History
    {
      name: 'page_go_forward',
      description: 'Navigate forward to the next page in browser history. Similar to clicking the browser forward button.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID to navigate forward',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 30000,
            description: 'Navigation timeout in milliseconds (1-300 seconds)',
          },
        },
        required: ['pageId'],
        additionalProperties: false,
      },
    },

    // 4. Reload Page
    {
      name: 'page_reload',
      description: 'Reload the current page. Similar to pressing F5 or clicking the browser reload button.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID to reload',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 30000,
            description: 'Reload timeout in milliseconds (1-300 seconds)',
          },
        },
        required: ['pageId'],
        additionalProperties: false,
      },
    },

    // 5. Close Page
    {
      name: 'page_close',
      description: 'Close a specific page/tab. This will terminate all ongoing operations on the page.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID to close',
          },
        },
        required: ['pageId'],
        additionalProperties: false,
      },
    },

    // 6. Get Page Title
    {
      name: 'page_title',
      description: 'Get the title of the current page (from the <title> element).',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID to get title from',
          },
        },
        required: ['pageId'],
        additionalProperties: false,
      },
    },

    // 7. Get Page URL
    {
      name: 'page_url',
      description: 'Get the current URL of the page. This may differ from the original navigation URL due to redirects.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID to get URL from',
          },
        },
        required: ['pageId'],
        additionalProperties: false,
      },
    },

    // 8. Get Page HTML Content
    {
      name: 'page_content',
      description: 'Get the full HTML content of the page. Returns the complete DOM including dynamically generated content.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID to get content from',
          },
        },
        required: ['pageId'],
        additionalProperties: false,
      },
    },

    // 9. Set Page Viewport
    {
      name: 'page_set_viewport',
      description: 'Change the viewport size of the page. This affects how the page is rendered and can trigger responsive design changes.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID to set viewport for',
          },
          width: {
            type: 'number',
            minimum: 1,
            maximum: 4096,
            description: 'Viewport width in pixels',
          },
          height: {
            type: 'number',
            minimum: 1,
            maximum: 4096,
            description: 'Viewport height in pixels',
          },
        },
        required: ['pageId', 'width', 'height'],
        additionalProperties: false,
      },
    },

    // 10. Wait for Load State
    {
      name: 'page_wait_for_load_state',
      description: 'Wait for the page to reach a specific load state. Useful for ensuring content is fully loaded before proceeding.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID to wait for',
          },
          state: {
            type: 'string',
            enum: ['load', 'domcontentloaded', 'networkidle'],
            default: 'load',
            description: 'Load state to wait for: load=full page load, domcontentloaded=DOM ready, networkidle=no network activity',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 30000,
            description: 'Wait timeout in milliseconds (1-300 seconds)',
          },
        },
        required: ['pageId'],
        additionalProperties: false,
      },
    },

    // 11. Take Page Screenshot (added as page tool instead of element tool)
    {
      name: 'page_screenshot',
      description: 'Take a screenshot of the entire page or a specific area. Returns base64-encoded image data.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID to screenshot',
          },
          type: {
            type: 'string',
            enum: ['png', 'jpeg'],
            default: 'png',
            description: 'Image format for the screenshot',
          },
          quality: {
            type: 'number',
            minimum: 0,
            maximum: 100,
            description: 'Image quality (0-100, only for JPEG format)',
          },
          fullPage: {
            type: 'boolean',
            default: false,
            description: 'Capture the full scrollable page content, not just the viewport',
          },
          clip: {
            type: 'object',
            description: 'Clip the screenshot to a specific rectangular area',
            properties: {
              x: {
                type: 'number',
                minimum: 0,
                description: 'X coordinate of the top-left corner',
              },
              y: {
                type: 'number',
                minimum: 0,
                description: 'Y coordinate of the top-left corner',
              },
              width: {
                type: 'number',
                minimum: 1,
                description: 'Width of the clipping area',
              },
              height: {
                type: 'number',
                minimum: 1,
                description: 'Height of the clipping area',
              },
            },
            required: ['x', 'y', 'width', 'height'],
            additionalProperties: false,
          },
        },
        required: ['pageId'],
        additionalProperties: false,
      },
    },
  ];
}
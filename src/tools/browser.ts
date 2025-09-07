import { MCPTool } from '../types.js';
import { PlaywrightService } from '../services/playwright.js';

/**
 * Creates browser management tools
 * 8 tools for launching, closing, and managing browser sessions
 */
export function createBrowserTools(_playwrightService: PlaywrightService): MCPTool[] {
  return [
    // 1. Launch Chromium Browser
    {
      name: 'browser_launch_chromium',
      description: 'Launch a new Chromium browser instance with configurable options. Returns browser ID for session management.',
      inputSchema: {
        type: 'object',
        properties: {
          headless: {
            type: 'boolean',
            description: 'Run browser in headless mode (no GUI)',
            default: true,
          },
          viewport: {
            type: 'object',
            description: 'Default viewport size for new pages',
            properties: {
              width: {
                type: 'number',
                minimum: 1,
                maximum: 4096,
                default: 1280,
                description: 'Viewport width in pixels',
              },
              height: {
                type: 'number',
                minimum: 1,
                maximum: 4096,
                default: 720,
                description: 'Viewport height in pixels',
              },
            },
            additionalProperties: false,
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 30000,
            description: 'Browser launch timeout in milliseconds (1-300 seconds)',
          },
          args: {
            type: 'array',
            description: 'Additional command line arguments for the browser',
            items: {
              type: 'string',
            },
          },
          executablePath: {
            type: 'string',
            description: 'Path to browser executable (optional, uses bundled browser by default)',
          },
        },
        additionalProperties: false,
      },
    },

    // 2. Launch Firefox Browser
    {
      name: 'browser_launch_firefox',
      description: 'Launch a new Firefox browser instance with configurable options. Returns browser ID for session management.',
      inputSchema: {
        type: 'object',
        properties: {
          headless: {
            type: 'boolean',
            description: 'Run browser in headless mode (no GUI)',
            default: true,
          },
          viewport: {
            type: 'object',
            description: 'Default viewport size for new pages',
            properties: {
              width: {
                type: 'number',
                minimum: 1,
                maximum: 4096,
                default: 1280,
                description: 'Viewport width in pixels',
              },
              height: {
                type: 'number',
                minimum: 1,
                maximum: 4096,
                default: 720,
                description: 'Viewport height in pixels',
              },
            },
            additionalProperties: false,
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 30000,
            description: 'Browser launch timeout in milliseconds (1-300 seconds)',
          },
          args: {
            type: 'array',
            description: 'Additional command line arguments for the browser',
            items: {
              type: 'string',
            },
          },
          executablePath: {
            type: 'string',
            description: 'Path to browser executable (optional, uses bundled browser by default)',
          },
        },
        additionalProperties: false,
      },
    },

    // 3. Launch WebKit Browser
    {
      name: 'browser_launch_webkit',
      description: 'Launch a new WebKit browser instance (Safari engine) with configurable options. Returns browser ID for session management.',
      inputSchema: {
        type: 'object',
        properties: {
          headless: {
            type: 'boolean',
            description: 'Run browser in headless mode (no GUI)',
            default: true,
          },
          viewport: {
            type: 'object',
            description: 'Default viewport size for new pages',
            properties: {
              width: {
                type: 'number',
                minimum: 1,
                maximum: 4096,
                default: 1280,
                description: 'Viewport width in pixels',
              },
              height: {
                type: 'number',
                minimum: 1,
                maximum: 4096,
                default: 720,
                description: 'Viewport height in pixels',
              },
            },
            additionalProperties: false,
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 30000,
            description: 'Browser launch timeout in milliseconds (1-300 seconds)',
          },
          args: {
            type: 'array',
            description: 'Additional command line arguments for the browser',
            items: {
              type: 'string',
            },
          },
          executablePath: {
            type: 'string',
            description: 'Path to browser executable (optional, uses bundled browser by default)',
          },
        },
        additionalProperties: false,
      },
    },

    // 4. Close Browser
    {
      name: 'browser_close',
      description: 'Close a browser instance and all its contexts/pages. Frees up system resources.',
      inputSchema: {
        type: 'object',
        properties: {
          browserId: {
            type: 'string',
            format: 'uuid',
            description: 'Unique identifier of the browser session to close',
          },
          force: {
            type: 'boolean',
            default: false,
            description: 'Force close even if there are unsaved changes or active operations',
          },
        },
        required: ['browserId'],
        additionalProperties: false,
      },
    },

    // 5. Create Browser Context
    {
      name: 'browser_contexts_create',
      description: 'Create a new browser context (isolated session) within an existing browser. Contexts provide isolation for cookies, storage, and other browser state.',
      inputSchema: {
        type: 'object',
        properties: {
          browserId: {
            type: 'string',
            format: 'uuid',
            description: 'Browser session ID where the context should be created',
          },
          userAgent: {
            type: 'string',
            description: 'Custom user agent string for this context',
          },
          viewport: {
            type: 'object',
            description: 'Viewport size for pages in this context',
            properties: {
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
            required: ['width', 'height'],
            additionalProperties: false,
          },
          locale: {
            type: 'string',
            description: 'Locale for the context (e.g., "en-US", "de-DE")',
          },
          timezone: {
            type: 'string',
            description: 'Timezone for the context (e.g., "America/New_York", "Europe/London")',
          },
          geolocation: {
            type: 'object',
            description: 'Geolocation coordinates for the context',
            properties: {
              latitude: {
                type: 'number',
                minimum: -90,
                maximum: 90,
                description: 'Latitude coordinate',
              },
              longitude: {
                type: 'number',
                minimum: -180,
                maximum: 180,
                description: 'Longitude coordinate',
              },
            },
            required: ['latitude', 'longitude'],
            additionalProperties: false,
          },
          permissions: {
            type: 'array',
            description: 'Permissions to grant to the context',
            items: {
              type: 'string',
              enum: [
                'geolocation',
                'midi',
                'notifications',
                'camera',
                'microphone',
                'background-sync',
                'ambient-light-sensor',
                'accelerometer',
                'gyroscope',
                'magnetometer',
                'accessibility-events',
                'clipboard-read',
                'clipboard-write',
                'payment-handler',
              ],
            },
          },
        },
        required: ['browserId'],
        additionalProperties: false,
      },
    },

    // 6. Close Browser Context
    {
      name: 'browser_contexts_close',
      description: 'Close a browser context and all its pages. This will terminate all ongoing operations in the context.',
      inputSchema: {
        type: 'object',
        properties: {
          contextId: {
            type: 'string',
            format: 'uuid',
            description: 'Unique identifier of the context to close',
          },
        },
        required: ['contextId'],
        additionalProperties: false,
      },
    },

    // 7. List Browser Contexts
    {
      name: 'browser_list_contexts',
      description: 'List all browser contexts within a specific browser session. Shows context IDs, creation times, and page counts.',
      inputSchema: {
        type: 'object',
        properties: {
          browserId: {
            type: 'string',
            format: 'uuid',
            description: 'Browser session ID to list contexts for',
          },
        },
        required: ['browserId'],
        additionalProperties: false,
      },
    },

    // 8. Browser Version Info
    {
      name: 'browser_version',
      description: 'Get version information and statistics for all browser sessions. Shows active browsers, memory usage, and session counts.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
  ];
}
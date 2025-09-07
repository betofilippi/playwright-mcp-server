import { MCPTool } from '../types.js';
import { PlaywrightService } from '../services/playwright.js';

/**
 * Extended Browser Management Tools
 * 15 additional tools for comprehensive browser instance management
 */
export function createAdvancedBrowserTools(_playwrightService: PlaywrightService): MCPTool[] {
  return [
    // 1. Get Browser Contexts
    {
      name: 'browser_get_contexts',
      description: 'Get all browser contexts for a specific browser instance. Returns context details including IDs, page counts, and creation times.',
      inputSchema: {
        type: 'object',
        properties: {
          browserId: {
            type: 'string',
            format: 'uuid',
            description: 'Unique identifier of the browser to get contexts from',
          },
        },
        required: ['browserId'],
        additionalProperties: false,
      },
    },

    // 2. Create New Browser Context
    {
      name: 'browser_new_context',
      description: 'Create a new browser context with comprehensive configuration options including viewport, permissions, geolocation, and more.',
      inputSchema: {
        type: 'object',
        properties: {
          browserId: {
            type: 'string',
            format: 'uuid',
            description: 'Browser ID where the context should be created',
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
            additionalProperties: false,
          },
          userAgent: {
            type: 'string',
            maxLength: 1000,
            description: 'Custom user agent string',
          },
          deviceScaleFactor: {
            type: 'number',
            minimum: 0.1,
            maximum: 5,
            description: 'Device pixel ratio (1.0 = normal, 2.0 = retina)',
          },
          hasTouch: {
            type: 'boolean',
            description: 'Whether the context supports touch events',
          },
          locale: {
            type: 'string',
            minLength: 2,
            maxLength: 10,
            description: 'Browser locale (e.g., en-US, fr-FR)',
          },
          timezone: {
            type: 'string',
            maxLength: 100,
            description: 'Timezone identifier (e.g., America/New_York)',
          },
          permissions: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'geolocation', 'camera', 'microphone', 'notifications',
                'persistent-storage', 'background-sync', 'midi', 'midi-sysex',
                'clipboard-read', 'clipboard-write', 'accelerometer',
                'ambient-light-sensor', 'gyroscope', 'magnetometer', 'payment-handler'
              ],
            },
            description: 'Browser permissions to grant to this context',
          },
          extraHTTPHeaders: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Additional HTTP headers to send with all requests',
          },
          offline: {
            type: 'boolean',
            description: 'Whether to simulate offline network conditions',
          },
          httpCredentials: {
            type: 'object',
            properties: {
              username: { type: 'string' },
              password: { type: 'string' },
            },
            required: ['username', 'password'],
            additionalProperties: false,
            description: 'HTTP authentication credentials',
          },
          geolocation: {
            type: 'object',
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
              accuracy: {
                type: 'number',
                minimum: 0,
                description: 'Optional accuracy in meters',
              },
            },
            required: ['latitude', 'longitude'],
            additionalProperties: false,
            description: 'Geolocation to simulate',
          },
          colorScheme: {
            type: 'string',
            enum: ['light', 'dark', 'no-preference'],
            description: 'Preferred color scheme',
          },
          reducedMotion: {
            type: 'string',
            enum: ['reduce', 'no-preference'],
            description: 'Motion preference setting',
          },
          forcedColors: {
            type: 'string',
            enum: ['active', 'none'],
            description: 'Forced colors setting for accessibility',
          },
          recordVideo: {
            type: 'object',
            properties: {
              dir: {
                type: 'string',
                description: 'Directory to save video recordings',
              },
              size: {
                type: 'object',
                properties: {
                  width: { type: 'number', minimum: 1, maximum: 4096 },
                  height: { type: 'number', minimum: 1, maximum: 4096 },
                },
                additionalProperties: false,
              },
            },
            required: ['dir'],
            additionalProperties: false,
            description: 'Video recording configuration',
          },
          ignoreHTTPSErrors: {
            type: 'boolean',
            description: 'Whether to ignore HTTPS certificate errors',
          },
          acceptDownloads: {
            type: 'boolean',
            description: 'Whether to accept downloads in this context',
          },
          bypassCSP: {
            type: 'boolean',
            description: 'Whether to bypass Content Security Policy',
          },
        },
        required: ['browserId'],
        additionalProperties: false,
      },
    },

    // 3. Check Browser Connection Status
    {
      name: 'browser_is_connected',
      description: 'Check if a browser instance is still connected and responsive. Returns connection status and health information.',
      inputSchema: {
        type: 'object',
        properties: {
          browserId: {
            type: 'string',
            format: 'uuid',
            description: 'Browser ID to check connection for',
          },
        },
        required: ['browserId'],
        additionalProperties: false,
      },
    },

    // 4. Disconnect Browser Gracefully
    {
      name: 'browser_disconnect',
      description: 'Gracefully disconnect from a browser instance, cleaning up all contexts and pages. Use force=true for immediate disconnection.',
      inputSchema: {
        type: 'object',
        properties: {
          browserId: {
            type: 'string',
            format: 'uuid',
            description: 'Browser ID to disconnect',
          },
          force: {
            type: 'boolean',
            default: false,
            description: 'Force immediate disconnection without graceful cleanup',
          },
        },
        required: ['browserId'],
        additionalProperties: false,
      },
    },

    // 5. Get All Pages Across Browser/Contexts
    {
      name: 'browser_get_pages',
      description: 'Get all pages from a browser or specific context. Returns comprehensive page information including URLs, titles, and states.',
      inputSchema: {
        type: 'object',
        properties: {
          browserId: {
            type: 'string',
            format: 'uuid',
            description: 'Browser ID to get pages from (gets all pages across all contexts)',
          },
          contextId: {
            type: 'string',
            format: 'uuid',
            description: 'Context ID to get pages from (gets pages from specific context)',
          },
        },
        additionalProperties: false,
      },
    },

    // 6. Get Browser User Agent
    {
      name: 'browser_get_user_agent',
      description: 'Get the default user agent string for a browser instance.',
      inputSchema: {
        type: 'object',
        properties: {
          browserId: {
            type: 'string',
            format: 'uuid',
            description: 'Browser ID to get user agent from',
          },
        },
        required: ['browserId'],
        additionalProperties: false,
      },
    },

    // 7. Set Browser Default Timeout
    {
      name: 'browser_set_default_timeout',
      description: 'Set default timeout for all operations in a browser instance. Applies to all contexts and pages.',
      inputSchema: {
        type: 'object',
        properties: {
          browserId: {
            type: 'string',
            format: 'uuid',
            description: 'Browser ID to set timeout for',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            description: 'Default timeout in milliseconds (1-300 seconds)',
          },
        },
        required: ['browserId', 'timeout'],
        additionalProperties: false,
      },
    },

    // 8. Set Browser Navigation Timeout
    {
      name: 'browser_set_default_navigation_timeout',
      description: 'Set default navigation timeout for all contexts in a browser instance. Controls page.goto() and similar navigation operations.',
      inputSchema: {
        type: 'object',
        properties: {
          browserId: {
            type: 'string',
            format: 'uuid',
            description: 'Browser ID to set navigation timeout for',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            description: 'Navigation timeout in milliseconds (1-300 seconds)',
          },
        },
        required: ['browserId', 'timeout'],
        additionalProperties: false,
      },
    },

    // 9. Add Init Script to Context
    {
      name: 'browser_add_init_script',
      description: 'Add a JavaScript script that will run on every new page in a browser context. Useful for injecting utilities or modifying page behavior.',
      inputSchema: {
        type: 'object',
        properties: {
          contextId: {
            type: 'string',
            format: 'uuid',
            description: 'Context ID to add init script to',
          },
          script: {
            oneOf: [
              {
                type: 'string',
                minLength: 1,
                description: 'JavaScript code as string',
              },
              {
                type: 'object',
                properties: {
                  path: {
                    type: 'string',
                    minLength: 1,
                    description: 'Path to JavaScript file',
                  },
                },
                required: ['path'],
                additionalProperties: false,
              },
              {
                type: 'object',
                properties: {
                  content: {
                    type: 'string',
                    minLength: 1,
                    description: 'JavaScript code content',
                  },
                },
                required: ['content'],
                additionalProperties: false,
              },
            ],
            description: 'Script to run on every new page',
          },
        },
        required: ['contextId', 'script'],
        additionalProperties: false,
      },
    },

    // 10. Set Extra HTTP Headers for Context
    {
      name: 'browser_set_extra_http_headers',
      description: 'Set additional HTTP headers that will be sent with all requests from a browser context.',
      inputSchema: {
        type: 'object',
        properties: {
          contextId: {
            type: 'string',
            format: 'uuid',
            description: 'Context ID to set headers for',
          },
          headers: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'HTTP headers as key-value pairs',
          },
        },
        required: ['contextId', 'headers'],
        additionalProperties: false,
      },
    },

    // 11. Grant Browser Permissions
    {
      name: 'browser_grant_permissions',
      description: 'Grant browser permissions to a context. Allows the context to access features like geolocation, camera, microphone, etc.',
      inputSchema: {
        type: 'object',
        properties: {
          contextId: {
            type: 'string',
            format: 'uuid',
            description: 'Context ID to grant permissions to',
          },
          permissions: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'geolocation', 'camera', 'microphone', 'notifications',
                'persistent-storage', 'background-sync', 'midi', 'midi-sysex',
                'clipboard-read', 'clipboard-write', 'accelerometer',
                'ambient-light-sensor', 'gyroscope', 'magnetometer', 'payment-handler'
              ],
            },
            minItems: 1,
            description: 'List of permissions to grant',
          },
          origin: {
            type: 'string',
            format: 'uri',
            description: 'Optional origin to grant permissions for (grants for all origins if not specified)',
          },
        },
        required: ['contextId', 'permissions'],
        additionalProperties: false,
      },
    },

    // 12. Clear Browser Permissions
    {
      name: 'browser_clear_permissions',
      description: 'Clear all granted permissions from a browser context. Revokes access to previously granted features.',
      inputSchema: {
        type: 'object',
        properties: {
          contextId: {
            type: 'string',
            format: 'uuid',
            description: 'Context ID to clear permissions from',
          },
        },
        required: ['contextId'],
        additionalProperties: false,
      },
    },

    // 13. Set Browser Geolocation
    {
      name: 'browser_set_geolocation',
      description: 'Set geolocation coordinates for a browser context. All pages in the context will report this location.',
      inputSchema: {
        type: 'object',
        properties: {
          contextId: {
            type: 'string',
            format: 'uuid',
            description: 'Context ID to set geolocation for',
          },
          geolocation: {
            type: 'object',
            properties: {
              latitude: {
                type: 'number',
                minimum: -90,
                maximum: 90,
                description: 'Latitude coordinate (-90 to 90)',
              },
              longitude: {
                type: 'number',
                minimum: -180,
                maximum: 180,
                description: 'Longitude coordinate (-180 to 180)',
              },
              accuracy: {
                type: 'number',
                minimum: 0,
                description: 'Location accuracy in meters (optional)',
              },
            },
            required: ['latitude', 'longitude'],
            additionalProperties: false,
            description: 'Geolocation coordinates',
          },
        },
        required: ['contextId', 'geolocation'],
        additionalProperties: false,
      },
    },

    // 14. Set Browser Offline Mode
    {
      name: 'browser_set_offline',
      description: 'Set offline network mode for a browser context. When offline=true, all network requests will fail.',
      inputSchema: {
        type: 'object',
        properties: {
          contextId: {
            type: 'string',
            format: 'uuid',
            description: 'Context ID to set offline mode for',
          },
          offline: {
            type: 'boolean',
            description: 'Whether to enable offline mode (true) or online mode (false)',
          },
        },
        required: ['contextId', 'offline'],
        additionalProperties: false,
      },
    },

    // 15. Get Browser Cookies
    {
      name: 'browser_get_cookies',
      description: 'Get all cookies from a browser context. Optionally filter by specific URLs.',
      inputSchema: {
        type: 'object',
        properties: {
          contextId: {
            type: 'string',
            format: 'uuid',
            description: 'Context ID to get cookies from',
          },
          urls: {
            type: 'array',
            items: {
              type: 'string',
              format: 'uri',
            },
            description: 'Optional array of URLs to filter cookies (gets all if not specified)',
          },
        },
        required: ['contextId'],
        additionalProperties: false,
      },
    },
  ];
}
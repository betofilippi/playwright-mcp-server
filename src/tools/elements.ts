import { MCPTool } from '../types.js';
import { PlaywrightService } from '../services/playwright.js';

/**
 * Creates element interaction tools
 * 6 tools for finding, clicking, filling, and interacting with page elements
 */
export function createElementTools(_playwrightService: PlaywrightService): MCPTool[] {
  return [
    // 1. Click Element
    {
      name: 'element_click',
      description: 'Click on an element identified by a CSS selector. Supports various click options like button type, click count, and position.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID where the element is located',
          },
          selector: {
            type: 'string',
            minLength: 1,
            description: 'CSS selector to identify the element (e.g., "#button1", ".submit-btn", "[data-testid=\'login\']")',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Wait timeout for element to be clickable (1-60 seconds)',
          },
          button: {
            type: 'string',
            enum: ['left', 'right', 'middle'],
            default: 'left',
            description: 'Mouse button to use for clicking',
          },
          clickCount: {
            type: 'number',
            minimum: 1,
            maximum: 3,
            default: 1,
            description: 'Number of consecutive clicks (1=single, 2=double, 3=triple)',
          },
          force: {
            type: 'boolean',
            default: false,
            description: 'Force click even if element is not visible or actionable',
          },
          position: {
            type: 'object',
            description: 'Specific position within the element to click (relative to element top-left)',
            properties: {
              x: {
                type: 'number',
                description: 'X coordinate in pixels from element left edge',
              },
              y: {
                type: 'number',
                description: 'Y coordinate in pixels from element top edge',
              },
            },
            required: ['x', 'y'],
            additionalProperties: false,
          },
        },
        required: ['pageId', 'selector'],
        additionalProperties: false,
      },
    },

    // 2. Fill Input Element
    {
      name: 'element_fill',
      description: 'Fill a text input, textarea, or contenteditable element with specified text. Clears existing content first.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID where the element is located',
          },
          selector: {
            type: 'string',
            minLength: 1,
            description: 'CSS selector for the input element (e.g., "input[name=\'email\']", "#search-box", "textarea")',
          },
          value: {
            type: 'string',
            description: 'Text value to fill into the element (existing content will be cleared)',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Wait timeout for element to be fillable (1-60 seconds)',
          },
          force: {
            type: 'boolean',
            default: false,
            description: 'Force fill even if element is not visible or editable',
          },
        },
        required: ['pageId', 'selector', 'value'],
        additionalProperties: false,
      },
    },

    // 3. Type Text into Element
    {
      name: 'element_type',
      description: 'Type text into an element character by character, simulating real user typing. Does not clear existing content.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID where the element is located',
          },
          selector: {
            type: 'string',
            minLength: 1,
            description: 'CSS selector for the target element (e.g., "input", "[contenteditable]")',
          },
          text: {
            type: 'string',
            description: 'Text to type into the element (preserves existing content)',
          },
          delay: {
            type: 'number',
            minimum: 0,
            maximum: 1000,
            default: 0,
            description: 'Delay between keystrokes in milliseconds (0-1000ms)',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Wait timeout for element to be ready for typing (1-60 seconds)',
          },
        },
        required: ['pageId', 'selector', 'text'],
        additionalProperties: false,
      },
    },

    // 4. Hover Over Element
    {
      name: 'element_hover',
      description: 'Hover the mouse over an element. Useful for triggering hover effects, dropdown menus, or tooltips.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID where the element is located',
          },
          selector: {
            type: 'string',
            minLength: 1,
            description: 'CSS selector for the element to hover over',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Wait timeout for element to be hoverable (1-60 seconds)',
          },
          position: {
            type: 'object',
            description: 'Specific position within the element to hover (relative to element top-left)',
            properties: {
              x: {
                type: 'number',
                description: 'X coordinate in pixels from element left edge',
              },
              y: {
                type: 'number',
                description: 'Y coordinate in pixels from element top edge',
              },
            },
            required: ['x', 'y'],
            additionalProperties: false,
          },
        },
        required: ['pageId', 'selector'],
        additionalProperties: false,
      },
    },

    // 5. Take Element Screenshot
    {
      name: 'element_screenshot',
      description: 'Take a screenshot of a specific element identified by CSS selector. Returns base64-encoded image data.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID where the element is located',
          },
          selector: {
            type: 'string',
            minLength: 1,
            description: 'CSS selector for the element to screenshot',
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
        },
        required: ['pageId', 'selector'],
        additionalProperties: false,
      },
    },

    // 6. Wait for Element
    {
      name: 'element_wait_for',
      description: 'Wait for an element to appear, disappear, or reach a specific state. Useful for handling dynamic content.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID where the element should appear',
          },
          selector: {
            type: 'string',
            minLength: 1,
            description: 'CSS selector for the element to wait for',
          },
          state: {
            type: 'string',
            enum: ['attached', 'detached', 'visible', 'hidden'],
            default: 'visible',
            description: 'Element state to wait for: attached=in DOM, detached=not in DOM, visible=visible and stable, hidden=not visible',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Wait timeout in milliseconds (1-60 seconds)',
          },
        },
        required: ['pageId', 'selector'],
        additionalProperties: false,
      },
    },
  ];
}
/**
 * Advanced Keyboard and Mouse Interactions for Playwright MCP Server
 * Implements sophisticated keyboard shortcuts, mouse operations, and gesture controls
 */

import { Page } from 'playwright';
import { MCPTool, MCPToolResult } from '../../../types.js';
import { PlaywrightService } from '../../../services/playwright.js';
import { validateElementSchema } from '../validation/element-schemas.js';

/**
 * Advanced keyboard and mouse interaction tools
 */
export function createKeyboardMouseTools(playwrightService: PlaywrightService): MCPTool[] {
  return [
    // 1. Advanced Hover with Options
    {
      name: 'element_advanced_hover',
      description: 'Hover over element with advanced options including position and timing.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID'
          },
          selector: {
            type: 'string',
            minLength: 1,
            description: 'CSS selector for the element'
          },
          position: {
            type: 'object',
            description: 'Position within element to hover',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' }
            },
            required: ['x', 'y'],
            additionalProperties: false
          },
          duration: {
            type: 'number',
            minimum: 0,
            maximum: 10000,
            default: 0,
            description: 'How long to hover in milliseconds'
          },
          modifiers: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['Alt', 'Control', 'Meta', 'Shift']
            },
            description: 'Modifier keys to hold during hover'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Timeout for element to be hoverable'
          }
        },
        required: ['pageId', 'selector'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_advanced_hover', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);

        const hoverOptions: any = {
          timeout: args.timeout
        };

        if (args.position) {
          hoverOptions.position = args.position;
        }

        if (args.modifiers && args.modifiers.length > 0) {
          hoverOptions.modifiers = args.modifiers;
        }

        await locator.hover(hoverOptions);

        if (args.duration > 0) {
          await page.waitForTimeout(args.duration);
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              position: args.position,
              duration: args.duration,
              modifiers: args.modifiers,
              action: 'advanced_hover'
            }, null, 2)
          }]
        };
      }
    },

    // 2. Focus Management
    {
      name: 'element_focus_management',
      description: 'Advanced focus management including focus, blur, and focus trapping.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID'
          },
          selector: {
            type: 'string',
            minLength: 1,
            description: 'CSS selector for the element'
          },
          action: {
            type: 'string',
            enum: ['focus', 'blur', 'focus_visible', 'focus_within'],
            description: 'Focus action to perform'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Timeout for the operation'
          }
        },
        required: ['pageId', 'selector', 'action'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_focus_management', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);

        await locator.waitFor({ state: 'attached', timeout: args.timeout });

        let result: any = { action: args.action, selector: args.selector };

        switch (args.action) {
          case 'focus':
            await locator.focus();
            result.focused = await locator.evaluate(el => document.activeElement === el);
            break;

          case 'blur':
            await locator.blur();
            result.blurred = await locator.evaluate(el => document.activeElement !== el);
            break;

          case 'focus_visible':
            await locator.focus();
            result.focusVisible = await locator.evaluate(el => {
              return el.matches(':focus-visible');
            });
            break;

          case 'focus_within':
            await locator.focus();
            result.focusWithin = await locator.evaluate(el => {
              return el.matches(':focus-within');
            });
            break;
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
      }
    },

    // 3. Scroll into View with Options
    {
      name: 'element_scroll_into_view_advanced',
      description: 'Scroll element into view with advanced positioning and behavior options.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID'
          },
          selector: {
            type: 'string',
            minLength: 1,
            description: 'CSS selector for the element'
          },
          block: {
            type: 'string',
            enum: ['start', 'center', 'end', 'nearest'],
            default: 'start',
            description: 'Vertical alignment'
          },
          inline: {
            type: 'string',
            enum: ['start', 'center', 'end', 'nearest'],
            default: 'nearest',
            description: 'Horizontal alignment'
          },
          behavior: {
            type: 'string',
            enum: ['auto', 'smooth', 'instant'],
            default: 'auto',
            description: 'Scrolling behavior'
          },
          offset: {
            type: 'object',
            description: 'Additional offset from the aligned position',
            properties: {
              x: { type: 'number', default: 0 },
              y: { type: 'number', default: 0 }
            },
            additionalProperties: false
          },
          waitForStable: {
            type: 'boolean',
            default: true,
            description: 'Wait for element to be stable after scrolling'
          }
        },
        required: ['pageId', 'selector'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_scroll_into_view_advanced', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);

        const scrollOptions = {
          block: args.block,
          inline: args.inline,
          behavior: args.behavior
        };

        await locator.scrollIntoViewIfNeeded();

        // Apply custom scroll options
        await locator.evaluate((el, options) => {
          el.scrollIntoView(options);
        }, scrollOptions);

        // Apply offset if specified
        if (args.offset && (args.offset.x !== 0 || args.offset.y !== 0)) {
          const currentPos = await page.evaluate(() => ({ 
            x: window.pageXOffset, 
            y: window.pageYOffset 
          }));
          
          await page.evaluate(({ x, y, offset }) => {
            window.scrollTo(x + offset.x, y + offset.y);
          }, { ...currentPos, offset: args.offset });
        }

        // Wait for stability if requested
        if (args.waitForStable) {
          let lastPosition = await locator.boundingBox();
          for (let i = 0; i < 5; i++) {
            await page.waitForTimeout(100);
            const currentPosition = await locator.boundingBox();
            if (lastPosition && currentPosition) {
              if (Math.abs(currentPosition.y - lastPosition.y) < 1) {
                break; // Element is stable
              }
            }
            lastPosition = currentPosition;
          }
        }

        const finalPosition = await locator.boundingBox();

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              scrollOptions,
              offset: args.offset,
              finalPosition,
              waitedForStable: args.waitForStable
            }, null, 2)
          }]
        };
      }
    },

    // 4. Complex Key Sequences
    {
      name: 'element_key_sequence',
      description: 'Execute complex key sequences with timing and modifiers.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID'
          },
          selector: {
            type: 'string',
            minLength: 1,
            description: 'CSS selector for the element to focus (optional for global keys)'
          },
          sequence: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                key: {
                  type: 'string',
                  description: 'Key to press (e.g., "Enter", "Control+c", "Alt+F4")'
                },
                delay: {
                  type: 'number',
                  minimum: 0,
                  maximum: 5000,
                  default: 0,
                  description: 'Delay after this key press (ms)'
                },
                hold: {
                  type: 'number',
                  minimum: 0,
                  maximum: 2000,
                  default: 0,
                  description: 'How long to hold the key (ms)'
                }
              },
              required: ['key'],
              additionalProperties: false
            },
            minItems: 1,
            description: 'Sequence of keys to press'
          },
          global: {
            type: 'boolean',
            default: false,
            description: 'Execute keys globally (not on specific element)'
          }
        },
        required: ['pageId', 'sequence'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_key_sequence', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        
        // Focus element if not global
        if (!args.global && args.selector) {
          const locator = page.locator(args.selector);
          await locator.focus();
        }

        const executedSequence = [];

        for (const step of args.sequence) {
          const startTime = Date.now();
          
          if (step.hold > 0) {
            // Hold key for specified duration
            await page.keyboard.down(step.key);
            await page.waitForTimeout(step.hold);
            await page.keyboard.up(step.key);
          } else {
            // Normal key press
            await page.keyboard.press(step.key);
          }

          const endTime = Date.now();
          
          executedSequence.push({
            key: step.key,
            executionTime: endTime - startTime,
            held: step.hold > 0
          });

          if (step.delay > 0) {
            await page.waitForTimeout(step.delay);
          }
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              global: args.global,
              sequenceExecuted: executedSequence,
              totalSteps: executedSequence.length
            }, null, 2)
          }]
        };
      }
    },

    // 5. Mouse Gestures
    {
      name: 'element_mouse_gestures',
      description: 'Perform complex mouse gestures like circles, lines, or custom paths.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID'
          },
          gesture: {
            type: 'string',
            enum: ['circle', 'line', 'rectangle', 'custom_path'],
            description: 'Type of gesture to perform'
          },
          startSelector: {
            type: 'string',
            description: 'Starting element selector (optional, uses center if not provided)'
          },
          startPosition: {
            type: 'object',
            description: 'Starting position (x, y coordinates)',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' }
            },
            required: ['x', 'y'],
            additionalProperties: false
          },
          parameters: {
            type: 'object',
            description: 'Gesture-specific parameters',
            properties: {
              radius: {
                type: 'number',
                minimum: 10,
                maximum: 500,
                description: 'Radius for circle gestures'
              },
              width: {
                type: 'number',
                description: 'Width for rectangle gestures'
              },
              height: {
                type: 'number',
                description: 'Height for rectangle gestures'
              },
              endX: {
                type: 'number',
                description: 'End X coordinate for line gestures'
              },
              endY: {
                type: 'number',
                description: 'End Y coordinate for line gestures'
              },
              path: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' }
                  },
                  required: ['x', 'y']
                },
                description: 'Custom path points for custom_path gestures'
              }
            },
            additionalProperties: false
          },
          steps: {
            type: 'number',
            minimum: 8,
            maximum: 100,
            default: 20,
            description: 'Number of steps to draw the gesture'
          },
          speed: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            default: 50,
            description: 'Speed of gesture (ms between steps)'
          },
          button: {
            type: 'string',
            enum: ['left', 'right', 'middle', 'none'],
            default: 'left',
            description: 'Mouse button to hold during gesture (none = just move)'
          }
        },
        required: ['pageId', 'gesture'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_mouse_gestures', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        
        // Determine starting position
        let startX = 0, startY = 0;
        
        if (args.startSelector) {
          const locator = page.locator(args.startSelector);
          const box = await locator.boundingBox();
          if (box) {
            startX = box.x + box.width / 2;
            startY = box.y + box.height / 2;
          }
        } else if (args.startPosition) {
          startX = args.startPosition.x;
          startY = args.startPosition.y;
        } else {
          // Default to viewport center
          const viewport = page.viewportSize();
          if (viewport) {
            startX = viewport.width / 2;
            startY = viewport.height / 2;
          }
        }

        // Generate gesture path
        const path = await generateGesturePath(
          args.gesture,
          { x: startX, y: startY },
          args.parameters || {},
          args.steps
        );

        // Execute gesture
        await page.mouse.move(path[0].x, path[0].y);
        
        if (args.button !== 'none') {
          await page.mouse.down({ button: args.button });
        }

        for (let i = 1; i < path.length; i++) {
          await page.mouse.move(path[i].x, path[i].y);
          await page.waitForTimeout(args.speed);
        }

        if (args.button !== 'none') {
          await page.mouse.up({ button: args.button });
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              gesture: args.gesture,
              startPosition: { x: startX, y: startY },
              pathLength: path.length,
              parameters: args.parameters,
              button: args.button,
              executedSuccessfully: true
            }, null, 2)
          }]
        };
      }
    },

    // 6. Context Menu Navigation
    {
      name: 'element_context_menu_navigate',
      description: 'Right-click to open context menu and navigate to specific option.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID'
          },
          selector: {
            type: 'string',
            minLength: 1,
            description: 'CSS selector for the element to right-click'
          },
          menuOption: {
            type: 'string',
            description: 'Text of the menu option to select'
          },
          menuSelector: {
            type: 'string',
            description: 'CSS selector for the menu option (alternative to menuOption)'
          },
          waitForMenu: {
            type: 'number',
            minimum: 100,
            maximum: 5000,
            default: 1000,
            description: 'Time to wait for context menu to appear (ms)'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Total timeout for the operation'
          }
        },
        required: ['pageId', 'selector'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_context_menu_navigate', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);

        // Right-click to open context menu
        await locator.click({ button: 'right', timeout: args.timeout });
        
        // Wait for menu to appear
        await page.waitForTimeout(args.waitForMenu);

        let menuResult = null;

        if (args.menuSelector) {
          // Use specific selector
          const menuItem = page.locator(args.menuSelector);
          await menuItem.click();
          menuResult = { method: 'selector', selector: args.menuSelector };
        } else if (args.menuOption) {
          // Find by text
          const menuItem = page.getByText(args.menuOption).first();
          await menuItem.click();
          menuResult = { method: 'text', text: args.menuOption };
        } else {
          // Just opened context menu without selecting
          menuResult = { method: 'open_only' };
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              contextMenuOpened: true,
              menuSelection: menuResult
            }, null, 2)
          }]
        };
      }
    }
  ];
}

/**
 * Generate path points for different gesture types
 */
async function generateGesturePath(
  gesture: string,
  start: { x: number; y: number },
  parameters: any,
  steps: number
): Promise<Array<{ x: number; y: number }>> {
  const path: Array<{ x: number; y: number }> = [];

  switch (gesture) {
    case 'circle':
      const radius = parameters.radius || 50;
      for (let i = 0; i <= steps; i++) {
        const angle = (i / steps) * 2 * Math.PI;
        path.push({
          x: start.x + Math.cos(angle) * radius,
          y: start.y + Math.sin(angle) * radius
        });
      }
      break;

    case 'line':
      const endX = parameters.endX || start.x + 100;
      const endY = parameters.endY || start.y + 100;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        path.push({
          x: start.x + (endX - start.x) * t,
          y: start.y + (endY - start.y) * t
        });
      }
      break;

    case 'rectangle':
      const width = parameters.width || 100;
      const height = parameters.height || 100;
      const perimeter = 2 * (width + height);
      const stepLength = perimeter / steps;
      
      for (let i = 0; i <= steps; i++) {
        const distance = (i * stepLength) % perimeter;
        let x = start.x, y = start.y;
        
        if (distance <= width) {
          // Top edge
          x = start.x + distance;
          y = start.y;
        } else if (distance <= width + height) {
          // Right edge
          x = start.x + width;
          y = start.y + (distance - width);
        } else if (distance <= 2 * width + height) {
          // Bottom edge
          x = start.x + width - (distance - width - height);
          y = start.y + height;
        } else {
          // Left edge
          x = start.x;
          y = start.y + height - (distance - 2 * width - height);
        }
        
        path.push({ x, y });
      }
      break;

    case 'custom_path':
      if (parameters.path && parameters.path.length > 0) {
        // Interpolate between custom path points
        const customPath = parameters.path;
        const segmentLength = steps / (customPath.length - 1);
        
        for (let i = 0; i <= steps; i++) {
          const segmentIndex = Math.floor(i / segmentLength);
          const segmentProgress = (i % segmentLength) / segmentLength;
          
          const startPoint = customPath[Math.min(segmentIndex, customPath.length - 1)];
          const endPoint = customPath[Math.min(segmentIndex + 1, customPath.length - 1)];
          
          path.push({
            x: startPoint.x + (endPoint.x - startPoint.x) * segmentProgress,
            y: startPoint.y + (endPoint.y - startPoint.y) * segmentProgress
          });
        }
      } else {
        // Fallback to simple line
        path.push(start);
        path.push({ x: start.x + 100, y: start.y + 100 });
      }
      break;

    default:
      throw new Error(`Unknown gesture type: ${gesture}`);
  }

  return path;
}
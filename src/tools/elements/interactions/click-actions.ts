/**
 * Advanced Click Actions for Playwright MCP Server
 * Implements sophisticated click operations with retry logic and intelligent positioning
 */

import { Page, Locator } from 'playwright';
import { MCPTool, MCPToolResult } from '../../../types.js';
import { PlaywrightService } from '../../../services/playwright.js';
import { validateElementSchema } from '../validation/element-schemas.js';
import { checkInteractionSafety } from '../validation/interaction-safety.js';

/**
 * Smart click algorithms with retry and recovery mechanisms
 */
export class SmartClickAlgorithms {
  private page: Page;
  
  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Intelligent click with multiple strategies
   */
  async smartClick(
    selector: string,
    options: {
      retry_count?: number;
      wait_strategies?: ('visible' | 'stable' | 'enabled' | 'attached')[];
      click_options?: any;
      force?: boolean;
    } = {}
  ): Promise<{ success: boolean; strategy: string; attempts: number; error?: string }> {
    const {
      retry_count = 3,
      wait_strategies = ['visible', 'stable', 'enabled'],
      click_options = {},
      force = false
    } = options;

    const strategies = [
      'standard_click',
      'force_click',
      'scroll_and_click',
      'hover_and_click',
      'js_click'
    ];

    let lastError: string = '';
    
    for (let attempt = 0; attempt < retry_count; attempt++) {
      for (const strategy of strategies) {
        try {
          const result = await this.executeClickStrategy(
            selector, 
            strategy, 
            { ...click_options, force },
            wait_strategies
          );
          
          if (result.success) {
            return {
              success: true,
              strategy,
              attempts: attempt + 1
            };
          } else {
            lastError = result.error || 'Unknown error';
          }
        } catch (error) {
          lastError = error.message;
          
          // Wait before retry
          if (attempt < retry_count - 1) {
            await this.page.waitForTimeout(1000 * (attempt + 1));
          }
        }
      }
    }

    return {
      success: false,
      strategy: 'none',
      attempts: retry_count,
      error: lastError
    };
  }

  /**
   * Execute specific click strategy
   */
  private async executeClickStrategy(
    selector: string,
    strategy: string,
    clickOptions: any,
    waitStrategies: string[]
  ): Promise<{ success: boolean; error?: string }> {
    const locator = this.page.locator(selector);
    
    // Wait for element based on strategies
    for (const waitStrategy of waitStrategies) {
      try {
        switch (waitStrategy) {
          case 'visible':
            await locator.waitFor({ state: 'visible', timeout: 5000 });
            break;
          case 'stable':
            // Check element is stable (not moving)
            await this.waitForElementStable(locator);
            break;
          case 'enabled':
            await locator.waitFor({ state: 'attached', timeout: 5000 });
            const isEnabled = await locator.isEnabled();
            if (!isEnabled && !clickOptions.force) {
              throw new Error('Element is disabled');
            }
            break;
          case 'attached':
            await locator.waitFor({ state: 'attached', timeout: 5000 });
            break;
        }
      } catch (error) {
        return { success: false, error: `Wait strategy ${waitStrategy} failed: ${error.message}` };
      }
    }

    // Execute the click strategy
    try {
      switch (strategy) {
        case 'standard_click':
          await locator.click(clickOptions);
          break;

        case 'force_click':
          await locator.click({ ...clickOptions, force: true });
          break;

        case 'scroll_and_click':
          await locator.scrollIntoViewIfNeeded();
          await this.page.waitForTimeout(100); // Brief pause after scroll
          await locator.click(clickOptions);
          break;

        case 'hover_and_click':
          await locator.hover();
          await this.page.waitForTimeout(100); // Brief pause after hover
          await locator.click(clickOptions);
          break;

        case 'js_click':
          await locator.evaluate(el => el.click());
          break;

        default:
          throw new Error(`Unknown click strategy: ${strategy}`);
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: `Strategy ${strategy} failed: ${error.message}` };
    }
  }

  /**
   * Wait for element to be stable (not moving)
   */
  private async waitForElementStable(locator: Locator, timeout: number = 5000): Promise<void> {
    const startTime = Date.now();
    let lastBox: any = null;
    
    while (Date.now() - startTime < timeout) {
      try {
        const currentBox = await locator.boundingBox();
        
        if (currentBox && lastBox) {
          const isStable = Math.abs(currentBox.x - lastBox.x) < 1 &&
                          Math.abs(currentBox.y - lastBox.y) < 1;
          
          if (isStable) {
            return; // Element is stable
          }
        }
        
        lastBox = currentBox;
        await this.page.waitForTimeout(50);
      } catch (error) {
        // Element might not be visible yet
        await this.page.waitForTimeout(100);
      }
    }
    
    throw new Error('Element did not stabilize within timeout');
  }
}

/**
 * Advanced click action tools
 */
export function createAdvancedClickTools(playwrightService: PlaywrightService): MCPTool[] {
  return [
    // 1. Smart Click with Intelligence
    {
      name: 'element_smart_click',
      description: 'Intelligent click with automatic retry, multiple strategies, and error recovery.',
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
            description: 'CSS selector or XPath for the element'
          },
          retryCount: {
            type: 'number',
            minimum: 1,
            maximum: 10,
            default: 3,
            description: 'Number of retry attempts'
          },
          waitStrategies: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['visible', 'stable', 'enabled', 'attached']
            },
            default: ['visible', 'stable', 'enabled'],
            description: 'Wait strategies to use before clicking'
          },
          button: {
            type: 'string',
            enum: ['left', 'right', 'middle'],
            default: 'left',
            description: 'Mouse button to use'
          },
          clickCount: {
            type: 'number',
            minimum: 1,
            maximum: 3,
            default: 1,
            description: 'Number of clicks (1=single, 2=double, 3=triple)'
          },
          force: {
            type: 'boolean',
            default: false,
            description: 'Force click even if element is not actionable'
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
        const validation = validateElementSchema('element_smart_click', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const safetyCheck = await checkInteractionSafety(args.selector, 'click');
        if (!safetyCheck.safe) {
          throw new Error(`Unsafe interaction: ${safetyCheck.reason}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const clickAlgorithms = new SmartClickAlgorithms(page);

        const result = await clickAlgorithms.smartClick(args.selector, {
          retry_count: args.retryCount,
          wait_strategies: args.waitStrategies,
          click_options: {
            button: args.button,
            clickCount: args.clickCount,
            timeout: args.timeout
          },
          force: args.force
        });

        return {
          success: result.success,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              success: result.success,
              strategy: result.strategy,
              attempts: result.attempts,
              error: result.error,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 2. Double Click
    {
      name: 'element_double_click',
      description: 'Perform double-click action on an element with timing control.',
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
          delay: {
            type: 'number',
            minimum: 0,
            maximum: 1000,
            default: 0,
            description: 'Delay between clicks in milliseconds'
          },
          button: {
            type: 'string',
            enum: ['left', 'right', 'middle'],
            default: 'left',
            description: 'Mouse button to use'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Wait timeout for element'
          },
          force: {
            type: 'boolean',
            default: false,
            description: 'Force click even if element is not visible'
          }
        },
        required: ['pageId', 'selector'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_double_click', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);

        await locator.dblclick({
          button: args.button,
          delay: args.delay,
          timeout: args.timeout,
          force: args.force
        });

        return {
          success: true,
          content: [{
            type: 'text',
            text: `Double-clicked element: ${args.selector}`
          }]
        };
      }
    },

    // 3. Right Click (Context Menu)
    {
      name: 'element_right_click',
      description: 'Perform right-click to open context menu.',
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
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Wait timeout for element'
          },
          force: {
            type: 'boolean',
            default: false,
            description: 'Force click even if element is not visible'
          },
          position: {
            type: 'object',
            description: 'Position within element to right-click',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' }
            },
            required: ['x', 'y'],
            additionalProperties: false
          }
        },
        required: ['pageId', 'selector'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_right_click', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);

        await locator.click({
          button: 'right',
          timeout: args.timeout,
          force: args.force,
          position: args.position
        });

        return {
          success: true,
          content: [{
            type: 'text',
            text: `Right-clicked element: ${args.selector}`
          }]
        };
      }
    },

    // 4. Click at Position
    {
      name: 'element_click_at_position',
      description: 'Click at specific coordinates within an element.',
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
          x: {
            type: 'number',
            description: 'X coordinate relative to element (0 = left edge)'
          },
          y: {
            type: 'number',
            description: 'Y coordinate relative to element (0 = top edge)'
          },
          button: {
            type: 'string',
            enum: ['left', 'right', 'middle'],
            default: 'left',
            description: 'Mouse button to use'
          },
          clickCount: {
            type: 'number',
            minimum: 1,
            maximum: 3,
            default: 1,
            description: 'Number of clicks'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Wait timeout for element'
          }
        },
        required: ['pageId', 'selector', 'x', 'y'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_click_at_position', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);

        await locator.click({
          position: { x: args.x, y: args.y },
          button: args.button,
          clickCount: args.clickCount,
          timeout: args.timeout
        });

        return {
          success: true,
          content: [{
            type: 'text',
            text: `Clicked element at position (${args.x}, ${args.y}): ${args.selector}`
          }]
        };
      }
    },

    // 5. Force Click (Bypass Actionability)
    {
      name: 'element_force_click',
      description: 'Force click bypassing all actionability checks. Use with caution.',
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
          button: {
            type: 'string',
            enum: ['left', 'right', 'middle'],
            default: 'left',
            description: 'Mouse button to use'
          },
          clickCount: {
            type: 'number',
            minimum: 1,
            maximum: 3,
            default: 1,
            description: 'Number of clicks'
          },
          position: {
            type: 'object',
            description: 'Position within element to click',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' }
            },
            required: ['x', 'y'],
            additionalProperties: false
          },
          reason: {
            type: 'string',
            minLength: 10,
            description: 'Reason for forcing the click (required for audit trail)'
          }
        },
        required: ['pageId', 'selector', 'reason'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_force_click', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);

        const clickOptions: any = {
          button: args.button,
          clickCount: args.clickCount,
          force: true
        };

        if (args.position) {
          clickOptions.position = args.position;
        }

        await locator.click(clickOptions);

        // Log force click for audit trail
        console.error(`FORCE CLICK: ${args.selector} - Reason: ${args.reason}`);

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              action: 'force_click',
              selector: args.selector,
              reason: args.reason,
              timestamp: new Date().toISOString(),
              warning: 'Force click bypassed all safety checks'
            }, null, 2)
          }]
        };
      }
    },

    // 6. Click and Wait for Navigation
    {
      name: 'element_click_and_wait_navigation',
      description: 'Click element and wait for page navigation to complete.',
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
          waitUntil: {
            type: 'string',
            enum: ['load', 'domcontentloaded', 'networkidle', 'commit'],
            default: 'load',
            description: 'When to consider navigation complete'
          },
          timeout: {
            type: 'number',
            minimum: 5000,
            maximum: 120000,
            default: 30000,
            description: 'Navigation timeout in milliseconds'
          },
          button: {
            type: 'string',
            enum: ['left', 'right', 'middle'],
            default: 'left',
            description: 'Mouse button to use'
          }
        },
        required: ['pageId', 'selector'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_click_and_wait_navigation', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);

        // Click and wait for navigation
        await Promise.all([
          page.waitForLoadState(args.waitUntil, { timeout: args.timeout }),
          locator.click({ button: args.button })
        ]);

        const newUrl = page.url();

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              action: 'click_and_navigate',
              selector: args.selector,
              newUrl,
              waitUntil: args.waitUntil
            }, null, 2)
          }]
        };
      }
    },

    // 7. Click and Wait for Selector
    {
      name: 'element_click_and_wait_selector',
      description: 'Click element and wait for another element to appear.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID'
          },
          clickSelector: {
            type: 'string',
            minLength: 1,
            description: 'CSS selector for the element to click'
          },
          waitSelector: {
            type: 'string',
            minLength: 1,
            description: 'CSS selector for the element to wait for'
          },
          waitState: {
            type: 'string',
            enum: ['attached', 'detached', 'visible', 'hidden'],
            default: 'visible',
            description: 'State to wait for'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Wait timeout in milliseconds'
          }
        },
        required: ['pageId', 'clickSelector', 'waitSelector'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_click_and_wait_selector', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        
        // Click and wait for selector
        await Promise.all([
          page.locator(args.waitSelector).waitFor({ 
            state: args.waitState, 
            timeout: args.timeout 
          }),
          page.locator(args.clickSelector).click()
        ]);

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              clickedSelector: args.clickSelector,
              waitedForSelector: args.waitSelector,
              waitState: args.waitState
            }, null, 2)
          }]
        };
      }
    }
  ];
}
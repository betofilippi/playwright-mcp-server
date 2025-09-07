/**
 * Advanced Input Actions for Playwright MCP Server
 * Implements intelligent text input, form filling, and keyboard interactions
 */

import { Page, Locator } from 'playwright';
import { MCPTool, MCPToolResult } from '../../../types.js';
import { PlaywrightService } from '../../../services/playwright.js';
import { validateElementSchema } from '../validation/element-schemas.js';
import { checkInteractionSafety } from '../validation/interaction-safety.js';

/**
 * Intelligent input algorithms with validation and cleanup
 */
export class IntelligentInputAlgorithms {
  private page: Page;
  
  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Smart fill with multiple clearing strategies
   */
  async intelligentFill(
    selector: string,
    text: string,
    options: {
      clear_method?: 'select_all' | 'triple_click' | 'ctrl_a' | 'backspace' | 'delete_content';
      validate_input?: boolean;
      timeout?: number;
    } = {}
  ): Promise<{ success: boolean; method: string; validated: boolean; error?: string }> {
    const {
      clear_method = 'select_all',
      validate_input = true,
      timeout = 30000
    } = options;

    const locator = this.page.locator(selector);
    
    try {
      // Wait for element to be ready
      await locator.waitFor({ state: 'visible', timeout });
      await locator.focus();

      // Get initial value for validation
      const initialValue = await locator.inputValue().catch(() => '');
      
      // Clear existing content
      await this.clearInput(locator, clear_method);
      
      // Fill with new text
      await locator.fill(text);
      
      // Validate input if requested
      let validated = false;
      if (validate_input) {
        const finalValue = await locator.inputValue();
        validated = finalValue === text;
        
        if (!validated) {
          // Try alternative method if validation failed
          await this.clearInput(locator, 'select_all');
          await locator.type(text, { delay: 50 });
          
          const retryValue = await locator.inputValue();
          validated = retryValue === text;
        }
      }

      return {
        success: true,
        method: clear_method,
        validated
      };
    } catch (error) {
      return {
        success: false,
        method: clear_method,
        validated: false,
        error: error.message
      };
    }
  }

  /**
   * Clear input using different strategies
   */
  private async clearInput(locator: Locator, method: string): Promise<void> {
    switch (method) {
      case 'select_all':
        await locator.selectText();
        break;
      
      case 'triple_click':
        await locator.click({ clickCount: 3 });
        break;
      
      case 'ctrl_a':
        await locator.press('Control+a');
        break;
      
      case 'backspace':
        const value = await locator.inputValue();
        for (let i = 0; i < value.length; i++) {
          await locator.press('Backspace');
        }
        break;
      
      case 'delete_content':
        await locator.evaluate(el => {
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
        break;
      
      default:
        await locator.selectText();
    }
  }

  /**
   * Smart typing with realistic human patterns
   */
  async humanLikeTyping(
    selector: string,
    text: string,
    options: {
      min_delay?: number;
      max_delay?: number;
      mistake_probability?: number;
      word_pause_probability?: number;
    } = {}
  ): Promise<{ success: boolean; typing_stats: any; error?: string }> {
    const {
      min_delay = 50,
      max_delay = 200,
      mistake_probability = 0.02,
      word_pause_probability = 0.1
    } = options;

    const locator = this.page.locator(selector);
    const stats = {
      characters_typed: 0,
      mistakes_made: 0,
      pauses_taken: 0,
      total_time: 0
    };

    const startTime = Date.now();

    try {
      await locator.focus();
      
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        
        // Random delay between keystrokes
        const delay = Math.random() * (max_delay - min_delay) + min_delay;
        
        // Occasionally make a "mistake" and correct it
        if (Math.random() < mistake_probability) {
          const wrongChar = String.fromCharCode(char.charCodeAt(0) + 1);
          await locator.type(wrongChar, { delay });
          await this.page.waitForTimeout(delay);
          await locator.press('Backspace');
          stats.mistakes_made++;
        }
        
        // Type the actual character
        await locator.type(char, { delay });
        stats.characters_typed++;
        
        // Occasionally pause at word boundaries
        if (char === ' ' && Math.random() < word_pause_probability) {
          await this.page.waitForTimeout(delay * 2);
          stats.pauses_taken++;
        }
      }

      stats.total_time = Date.now() - startTime;
      
      return {
        success: true,
        typing_stats: stats
      };
    } catch (error) {
      return {
        success: false,
        typing_stats: stats,
        error: error.message
      };
    }
  }
}

/**
 * Advanced input action tools
 */
export function createAdvancedInputTools(playwrightService: PlaywrightService): MCPTool[] {
  return [
    // 1. Intelligent Fill
    {
      name: 'element_intelligent_fill',
      description: 'Fill input with intelligent clearing and validation.',
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
            description: 'CSS selector for the input element'
          },
          text: {
            type: 'string',
            description: 'Text to fill into the element'
          },
          clearMethod: {
            type: 'string',
            enum: ['select_all', 'triple_click', 'ctrl_a', 'backspace', 'delete_content'],
            default: 'select_all',
            description: 'Method to clear existing content'
          },
          validateInput: {
            type: 'boolean',
            default: true,
            description: 'Whether to validate the input was filled correctly'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Timeout for the operation'
          }
        },
        required: ['pageId', 'selector', 'text'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_intelligent_fill', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const safetyCheck = await checkInteractionSafety(args.selector, 'fill');
        if (!safetyCheck.safe) {
          throw new Error(`Unsafe interaction: ${safetyCheck.reason}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const inputAlgorithms = new IntelligentInputAlgorithms(page);

        const result = await inputAlgorithms.intelligentFill(args.selector, args.text, {
          clear_method: args.clearMethod,
          validate_input: args.validateInput,
          timeout: args.timeout
        });

        return {
          success: result.success,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              text: args.text,
              clearMethod: result.method,
              validated: result.validated,
              success: result.success,
              error: result.error
            }, null, 2)
          }]
        };
      }
    },

    // 2. Human-like Typing
    {
      name: 'element_human_type',
      description: 'Type text with human-like patterns including mistakes and pauses.',
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
            description: 'CSS selector for the input element'
          },
          text: {
            type: 'string',
            description: 'Text to type'
          },
          minDelay: {
            type: 'number',
            minimum: 10,
            maximum: 500,
            default: 50,
            description: 'Minimum delay between keystrokes (ms)'
          },
          maxDelay: {
            type: 'number',
            minimum: 50,
            maximum: 1000,
            default: 200,
            description: 'Maximum delay between keystrokes (ms)'
          },
          mistakeProbability: {
            type: 'number',
            minimum: 0,
            maximum: 0.1,
            default: 0.02,
            description: 'Probability of making typing mistakes (0-0.1)'
          },
          wordPauseProbability: {
            type: 'number',
            minimum: 0,
            maximum: 0.5,
            default: 0.1,
            description: 'Probability of pausing between words'
          }
        },
        required: ['pageId', 'selector', 'text'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_human_type', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const inputAlgorithms = new IntelligentInputAlgorithms(page);

        const result = await inputAlgorithms.humanLikeTyping(args.selector, args.text, {
          min_delay: args.minDelay,
          max_delay: args.maxDelay,
          mistake_probability: args.mistakeProbability,
          word_pause_probability: args.wordPauseProbability
        });

        return {
          success: result.success,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              text: args.text,
              typingStats: result.typing_stats,
              success: result.success,
              error: result.error
            }, null, 2)
          }]
        };
      }
    },

    // 3. Clear Input Field
    {
      name: 'element_clear_input',
      description: 'Clear input field using various methods.',
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
            description: 'CSS selector for the input element'
          },
          method: {
            type: 'string',
            enum: ['select_all', 'triple_click', 'ctrl_a', 'backspace', 'delete_content'],
            default: 'select_all',
            description: 'Method to clear the input'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Timeout for the operation'
          }
        },
        required: ['pageId', 'selector'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_clear_input', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);

        await locator.waitFor({ state: 'visible', timeout: args.timeout });
        
        const initialValue = await locator.inputValue();
        
        switch (args.method) {
          case 'select_all':
            await locator.selectText();
            await locator.press('Delete');
            break;
          case 'triple_click':
            await locator.click({ clickCount: 3 });
            await locator.press('Delete');
            break;
          case 'ctrl_a':
            await locator.press('Control+a');
            await locator.press('Delete');
            break;
          case 'backspace':
            for (let i = 0; i < initialValue.length; i++) {
              await locator.press('Backspace');
            }
            break;
          case 'delete_content':
            await locator.evaluate(el => {
              if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                el.value = '';
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
              }
            });
            break;
        }

        const finalValue = await locator.inputValue();

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              method: args.method,
              initialValue,
              finalValue,
              cleared: finalValue === ''
            }, null, 2)
          }]
        };
      }
    },

    // 4. Press Key Combination
    {
      name: 'element_press_key_combination',
      description: 'Press specific key combinations on an element.',
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
          keys: {
            type: 'string',
            description: 'Key combination (e.g., "Control+C", "Alt+Tab", "Enter")'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Timeout for the operation'
          }
        },
        required: ['pageId', 'selector', 'keys'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_press_key_combination', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);

        await locator.waitFor({ state: 'visible', timeout: args.timeout });
        await locator.focus();
        await locator.press(args.keys);

        return {
          success: true,
          content: [{
            type: 'text',
            text: `Pressed key combination "${args.keys}" on element: ${args.selector}`
          }]
        };
      }
    },

    // 5. Upload Files
    {
      name: 'element_upload_files',
      description: 'Upload files to a file input element.',
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
            description: 'CSS selector for the file input element'
          },
          filePaths: {
            type: 'array',
            items: {
              type: 'string',
              minLength: 1
            },
            minItems: 1,
            description: 'Array of file paths to upload'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Timeout for the operation'
          }
        },
        required: ['pageId', 'selector', 'filePaths'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_upload_files', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);

        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        
        // Verify it's a file input
        const inputType = await locator.getAttribute('type');
        if (inputType !== 'file') {
          throw new Error(`Element is not a file input. Type: ${inputType}`);
        }

        await locator.setInputFiles(args.filePaths);

        // Get information about uploaded files
        const files = await locator.evaluate(el => {
          const input = el as HTMLInputElement;
          if (input.files) {
            return Array.from(input.files).map(file => ({
              name: file.name,
              size: file.size,
              type: file.type,
              lastModified: file.lastModified
            }));
          }
          return [];
        });

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              uploadedFiles: files,
              filePaths: args.filePaths
            }, null, 2)
          }]
        };
      }
    },

    // 6. Set Input Value Directly
    {
      name: 'element_set_value_direct',
      description: 'Set input value directly using JavaScript (bypasses normal input events).',
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
            description: 'CSS selector for the input element'
          },
          value: {
            type: 'string',
            description: 'Value to set'
          },
          triggerEvents: {
            type: 'boolean',
            default: true,
            description: 'Whether to trigger input/change events after setting value'
          },
          reason: {
            type: 'string',
            minLength: 10,
            description: 'Reason for bypassing normal input (required for audit)'
          }
        },
        required: ['pageId', 'selector', 'value', 'reason'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_set_value_direct', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);

        const result = await locator.evaluate((el, { value, triggerEvents }) => {
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            const oldValue = el.value;
            el.value = value;
            
            if (triggerEvents) {
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
            
            return { oldValue, newValue: el.value };
          }
          throw new Error('Element is not an input or textarea');
        }, { value: args.value, triggerEvents: args.triggerEvents });

        // Log direct value setting for audit trail
        console.error(`DIRECT VALUE SET: ${args.selector} - Reason: ${args.reason}`);

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              oldValue: result.oldValue,
              newValue: result.newValue,
              triggerEvents: args.triggerEvents,
              reason: args.reason,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 7. Auto-complete Text Input
    {
      name: 'element_autocomplete_input',
      description: 'Handle auto-complete dropdowns after typing.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID'
          },
          inputSelector: {
            type: 'string',
            minLength: 1,
            description: 'CSS selector for the input element'
          },
          text: {
            type: 'string',
            description: 'Text to type for auto-complete'
          },
          optionSelector: {
            type: 'string',
            description: 'CSS selector for the option to select (optional)'
          },
          optionText: {
            type: 'string',
            description: 'Text content of the option to select (alternative to optionSelector)'
          },
          waitForOptions: {
            type: 'number',
            minimum: 100,
            maximum: 10000,
            default: 2000,
            description: 'Time to wait for auto-complete options to appear'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Total timeout for the operation'
          }
        },
        required: ['pageId', 'inputSelector', 'text'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_autocomplete_input', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const inputLocator = page.locator(args.inputSelector);

        // Type text to trigger auto-complete
        await inputLocator.fill(args.text);
        await page.waitForTimeout(args.waitForOptions);

        let selectedOption = null;

        // Select option if specified
        if (args.optionSelector) {
          const optionLocator = page.locator(args.optionSelector);
          await optionLocator.waitFor({ state: 'visible', timeout: args.timeout });
          await optionLocator.click();
          selectedOption = args.optionSelector;
        } else if (args.optionText) {
          // Find option by text content
          const optionLocator = page.getByText(args.optionText).first();
          await optionLocator.waitFor({ state: 'visible', timeout: args.timeout });
          await optionLocator.click();
          selectedOption = args.optionText;
        } else {
          // Just press Enter to select first option
          await inputLocator.press('Enter');
          selectedOption = 'first_option_via_enter';
        }

        const finalValue = await inputLocator.inputValue();

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              inputSelector: args.inputSelector,
              typedText: args.text,
              selectedOption,
              finalValue
            }, null, 2)
          }]
        };
      }
    }
  ];
}
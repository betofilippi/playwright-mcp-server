/**
 * Advanced Input Actions for Playwright MCP Server
 * Implements sophisticated input operations including file uploads, keyboard shortcuts, and advanced form interactions
 */

import { Page, Locator } from 'playwright';
import { MCPTool, MCPToolResult } from '../../../types.js';
import { PlaywrightService } from '../../../services/playwright.js';
import { validateElementSchema } from '../validation/element-schemas.js';
import { checkInteractionSafety } from '../validation/interaction-safety.js';

/**
 * Advanced Input Actions Tools (10 tools)
 */
export function createAdvancedInputActionTools(playwrightService: PlaywrightService): MCPTool[] {
  return [
    // 1. Clear Input Field
    {
      name: 'element_clear',
      description: 'Clear the content of an input field, textarea, or contenteditable element.',
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
            enum: ['selectall', 'backspace', 'delete', 'clear'],
            default: 'clear',
            description: 'Method to use for clearing: selectall+delete, backspace all chars, delete key, or playwright clear'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Wait timeout for element'
          }
        },
        required: ['pageId', 'selector'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_clear', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        
        const beforeValue = await locator.inputValue().catch(() => '');
        
        switch (args.method) {
          case 'selectall':
            await locator.selectText();
            await page.keyboard.press('Delete');
            break;
          case 'backspace':
            await locator.focus();
            const length = beforeValue.length;
            for (let i = 0; i < length; i++) {
              await page.keyboard.press('Backspace');
            }
            break;
          case 'delete':
            await locator.focus();
            await page.keyboard.press('Control+a');
            await page.keyboard.press('Delete');
            break;
          case 'clear':
          default:
            await locator.clear();
            break;
        }
        
        const afterValue = await locator.inputValue().catch(() => '');

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              method: args.method,
              beforeValue,
              afterValue,
              cleared: afterValue.length === 0,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 2. Press Key Combination
    {
      name: 'element_press_key',
      description: 'Press a specific key combination on an element (supports modifier keys).',
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
          key: {
            type: 'string',
            minLength: 1,
            description: 'Key or key combination (e.g., "Enter", "Control+a", "Shift+Tab", "Alt+F4")'
          },
          times: {
            type: 'number',
            minimum: 1,
            maximum: 100,
            default: 1,
            description: 'Number of times to press the key combination'
          },
          delay: {
            type: 'number',
            minimum: 0,
            maximum: 5000,
            default: 0,
            description: 'Delay between key presses in milliseconds'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Wait timeout for element'
          }
        },
        required: ['pageId', 'selector', 'key'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_press_key', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        await locator.focus();
        
        for (let i = 0; i < args.times; i++) {
          await page.keyboard.press(args.key);
          if (args.delay > 0 && i < args.times - 1) {
            await page.waitForTimeout(args.delay);
          }
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              key: args.key,
              times: args.times,
              delay: args.delay,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 3. Upload Files
    {
      name: 'element_input_files',
      description: 'Upload one or more files to a file input element.',
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
            items: { type: 'string' },
            minItems: 1,
            description: 'Array of absolute file paths to upload'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 120000,
            default: 60000,
            description: 'Wait timeout for element and upload'
          }
        },
        required: ['pageId', 'selector', 'filePaths'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_input_files', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        
        // Verify it's a file input
        const inputType = await locator.getAttribute('type').catch(() => '');
        if (inputType !== 'file') {
          throw new Error(`Element is not a file input. Type: ${inputType}`);
        }
        
        // Check if multiple files are allowed
        const multiple = await locator.getAttribute('multiple').catch(() => null);
        if (args.filePaths.length > 1 && !multiple) {
          throw new Error('Multiple files provided but input does not support multiple files');
        }
        
        await locator.setInputFiles(args.filePaths);
        
        // Get uploaded file info
        const uploadedFiles = await locator.evaluate((el: HTMLInputElement) => {
          const files = Array.from(el.files || []);
          return files.map(file => ({
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified
          }));
        });

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              requestedFiles: args.filePaths,
              uploadedFiles,
              fileCount: uploadedFiles.length,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 4. Focus Element
    {
      name: 'element_focus',
      description: 'Set focus on an element and optionally scroll it into view.',
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
          scrollIntoView: {
            type: 'boolean',
            default: true,
            description: 'Whether to scroll element into view if needed'
          },
          preventScroll: {
            type: 'boolean',
            default: false,
            description: 'Whether to prevent scrolling when focusing'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Wait timeout for element'
          }
        },
        required: ['pageId', 'selector'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_focus', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        
        if (args.scrollIntoView) {
          await locator.scrollIntoViewIfNeeded();
        }
        
        // Use DOM focus with preventScroll option
        if (args.preventScroll) {
          await locator.evaluate(el => el.focus({ preventScroll: true }));
        } else {
          await locator.focus();
        }
        
        // Verify focus
        const isFocused = await locator.evaluate(el => document.activeElement === el);
        const elementInfo = await locator.evaluate(el => ({
          tagName: el.tagName.toLowerCase(),
          id: el.id,
          tabIndex: el.tabIndex,
          canFocus: el.tabIndex !== -1
        }));

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              isFocused,
              scrollIntoView: args.scrollIntoView,
              preventScroll: args.preventScroll,
              elementInfo,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 5. Blur Element (Remove Focus)
    {
      name: 'element_blur',
      description: 'Remove focus from an element.',
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
          }
        },
        required: ['pageId', 'selector'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_blur', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        
        const wasFocused = await locator.evaluate(el => document.activeElement === el);
        await locator.blur();
        const isBlurred = await locator.evaluate(el => document.activeElement !== el);

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              wasFocused,
              isBlurred,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 6. Scroll Element Into View
    {
      name: 'element_scroll_into_view',
      description: 'Scroll an element into the visible viewport.',
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
          behavior: {
            type: 'string',
            enum: ['auto', 'smooth', 'instant'],
            default: 'auto',
            description: 'Scroll behavior'
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
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Wait timeout for element'
          }
        },
        required: ['pageId', 'selector'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_scroll_into_view', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        
        const beforePosition = await locator.boundingBox().catch(() => null);
        
        await locator.evaluate((el, options) => {
          el.scrollIntoView({
            behavior: options.behavior,
            block: options.block,
            inline: options.inline
          });
        }, {
          behavior: args.behavior,
          block: args.block,
          inline: args.inline
        });
        
        // Wait for scroll to complete
        await page.waitForTimeout(100);
        const afterPosition = await locator.boundingBox().catch(() => null);

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              behavior: args.behavior,
              block: args.block,
              inline: args.inline,
              beforePosition,
              afterPosition,
              scrolled: JSON.stringify(beforePosition) !== JSON.stringify(afterPosition),
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 7. Select Text in Element
    {
      name: 'element_select_text',
      description: 'Select all or part of the text content in an element.',
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
          startOffset: {
            type: 'number',
            minimum: 0,
            description: 'Start position for partial selection (character index)'
          },
          endOffset: {
            type: 'number',
            minimum: 0,
            description: 'End position for partial selection (character index)'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Wait timeout for element'
          }
        },
        required: ['pageId', 'selector'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_select_text', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        
        if (args.startOffset !== undefined && args.endOffset !== undefined) {
          // Partial text selection
          await locator.evaluate((el, { start, end }) => {
            if (el.setSelectionRange) {
              // For input/textarea elements
              (el as HTMLInputElement).setSelectionRange(start, end);
            } else {
              // For other elements using Range API
              const range = document.createRange();
              const textNode = el.childNodes[0];
              if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                range.setStart(textNode, start);
                range.setEnd(textNode, Math.min(end, textNode.textContent?.length || 0));
                const selection = window.getSelection();
                selection?.removeAllRanges();
                selection?.addRange(range);
              }
            }
          }, { start: args.startOffset, end: args.endOffset });
        } else {
          // Select all text
          await locator.selectText();
        }
        
        // Get selection info
        const selectionInfo = await page.evaluate(() => {
          const selection = window.getSelection();
          return {
            selectedText: selection?.toString() || '',
            rangeCount: selection?.rangeCount || 0,
            anchorOffset: selection?.anchorOffset,
            focusOffset: selection?.focusOffset
          };
        });

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              startOffset: args.startOffset,
              endOffset: args.endOffset,
              selectionInfo,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 8. Type with Realistic Timing
    {
      name: 'element_type_realistic',
      description: 'Type text with realistic human-like timing patterns and occasional errors.',
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
          text: {
            type: 'string',
            minLength: 1,
            description: 'Text to type'
          },
          wpm: {
            type: 'number',
            minimum: 10,
            maximum: 200,
            default: 60,
            description: 'Words per minute typing speed'
          },
          errorRate: {
            type: 'number',
            minimum: 0,
            maximum: 0.1,
            default: 0.02,
            description: 'Error rate (0.02 = 2% chance of typos)'
          },
          pauseChance: {
            type: 'number',
            minimum: 0,
            maximum: 0.3,
            default: 0.05,
            description: 'Chance of natural pauses (0.05 = 5%)'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 60000,
            description: 'Wait timeout for typing completion'
          }
        },
        required: ['pageId', 'selector', 'text'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_type_realistic', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        await locator.focus();
        
        // Calculate base delay between characters (60 WPM = 5 chars/sec avg)
        const baseDelay = (60 * 1000) / (args.wpm * 5); // milliseconds
        let typedText = '';
        let errorCount = 0;
        let pauseCount = 0;
        
        for (let i = 0; i < args.text.length; i++) {
          const char = args.text[i];
          
          // Random chance of making a typo
          if (Math.random() < args.errorRate) {
            const typoChar = String.fromCharCode(char.charCodeAt(0) + (Math.random() > 0.5 ? 1 : -1));
            await page.keyboard.type(typoChar);
            await page.waitForTimeout(baseDelay * (0.5 + Math.random()));
            
            // Correct the typo
            await page.keyboard.press('Backspace');
            await page.waitForTimeout(baseDelay * 0.3);
            errorCount++;
          }
          
          // Type the correct character
          await page.keyboard.type(char);
          typedText += char;
          
          // Random chance of natural pause
          if (Math.random() < args.pauseChance) {
            await page.waitForTimeout(baseDelay * (2 + Math.random() * 3));
            pauseCount++;
          } else {
            // Normal delay with some randomness
            const delay = baseDelay * (0.7 + Math.random() * 0.6);
            await page.waitForTimeout(delay);
          }
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              text: args.text,
              typedText,
              wpm: args.wpm,
              errorRate: args.errorRate,
              actualErrors: errorCount,
              pauses: pauseCount,
              duration: args.text.length * baseDelay,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 9. Paste from Clipboard
    {
      name: 'element_paste',
      description: 'Paste content into an element (simulates Ctrl+V).',
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
          text: {
            type: 'string',
            description: 'Text to paste (will be set as clipboard content first)'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Wait timeout for element'
          }
        },
        required: ['pageId', 'selector', 'text'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_paste', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        
        // Set clipboard content and paste
        const beforeValue = await locator.inputValue().catch(() => '');
        await locator.focus();
        
        // Use evaluate to set clipboard and paste
        await page.evaluate(async (text) => {
          await navigator.clipboard.writeText(text);
        }, args.text);
        
        await page.keyboard.press('Control+v');
        await page.waitForTimeout(100); // Brief wait for paste to complete
        
        const afterValue = await locator.inputValue().catch(() => '');

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              pastedText: args.text,
              beforeValue,
              afterValue,
              pasted: afterValue !== beforeValue,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 10. Input Validation and Format
    {
      name: 'element_fill_formatted',
      description: 'Fill an input with formatted data (phone, date, currency, etc.) with validation.',
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
            minLength: 1,
            description: 'Raw value to format and input'
          },
          format: {
            type: 'string',
            enum: ['phone', 'date', 'currency', 'ssn', 'creditcard', 'email', 'url', 'none'],
            default: 'none',
            description: 'Format type to apply'
          },
          locale: {
            type: 'string',
            default: 'en-US',
            description: 'Locale for formatting (e.g., en-US, fr-FR)'
          },
          validateFormat: {
            type: 'boolean',
            default: true,
            description: 'Whether to validate the format before input'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Wait timeout for element'
          }
        },
        required: ['pageId', 'selector', 'value'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_fill_formatted', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        
        // Format the value based on type
        let formattedValue = args.value;
        let validationPassed = true;
        let validationMessage = '';
        
        try {
          switch (args.format) {
            case 'phone':
              // Basic US phone formatting
              const phoneDigits = args.value.replace(/\D/g, '');
              if (phoneDigits.length === 10) {
                formattedValue = `(${phoneDigits.slice(0,3)}) ${phoneDigits.slice(3,6)}-${phoneDigits.slice(6)}`;
              } else {
                validationPassed = false;
                validationMessage = 'Phone number must be 10 digits';
              }
              break;
              
            case 'date':
              const date = new Date(args.value);
              if (!isNaN(date.getTime())) {
                formattedValue = date.toLocaleDateString(args.locale);
              } else {
                validationPassed = false;
                validationMessage = 'Invalid date format';
              }
              break;
              
            case 'currency':
              const amount = parseFloat(args.value);
              if (!isNaN(amount)) {
                formattedValue = new Intl.NumberFormat(args.locale, {
                  style: 'currency',
                  currency: args.locale === 'en-US' ? 'USD' : 'EUR'
                }).format(amount);
              } else {
                validationPassed = false;
                validationMessage = 'Invalid currency amount';
              }
              break;
              
            case 'ssn':
              const ssnDigits = args.value.replace(/\D/g, '');
              if (ssnDigits.length === 9) {
                formattedValue = `${ssnDigits.slice(0,3)}-${ssnDigits.slice(3,5)}-${ssnDigits.slice(5)}`;
              } else {
                validationPassed = false;
                validationMessage = 'SSN must be 9 digits';
              }
              break;
              
            case 'creditcard':
              const ccDigits = args.value.replace(/\D/g, '');
              if (ccDigits.length >= 13 && ccDigits.length <= 19) {
                formattedValue = ccDigits.replace(/(.{4})/g, '$1 ').trim();
              } else {
                validationPassed = false;
                validationMessage = 'Credit card must be 13-19 digits';
              }
              break;
              
            case 'email':
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              if (!emailRegex.test(args.value)) {
                validationPassed = false;
                validationMessage = 'Invalid email format';
              }
              break;
              
            case 'url':
              try {
                new URL(args.value);
              } catch {
                validationPassed = false;
                validationMessage = 'Invalid URL format';
              }
              break;
          }
        } catch (error) {
          validationPassed = false;
          validationMessage = `Formatting error: ${error.message}`;
        }
        
        if (args.validateFormat && !validationPassed) {
          throw new Error(validationMessage);
        }
        
        // Fill the formatted value
        await locator.fill(formattedValue);
        const finalValue = await locator.inputValue().catch(() => '');

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              originalValue: args.value,
              formattedValue,
              finalValue,
              format: args.format,
              locale: args.locale,
              validationPassed,
              validationMessage: validationMessage || undefined,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    }
  ];
}
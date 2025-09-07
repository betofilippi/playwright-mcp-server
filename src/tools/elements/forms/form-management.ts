/**
 * Form Management Tools for Playwright MCP Server
 * Implements comprehensive form operations including field management, validation, and data extraction
 */

import { Page, Locator } from 'playwright';
import { MCPTool, MCPToolResult } from '../../../types.js';
import { PlaywrightService } from '../../../services/playwright.js';
import { validateElementSchema } from '../validation/element-schemas.js';
import { checkInteractionSafety } from '../validation/interaction-safety.js';

/**
 * Form Management Tools (8 tools)
 */
export function createFormManagementTools(playwrightService: PlaywrightService): MCPTool[] {
  return [
    // 1. Select Option from Dropdown
    {
      name: 'element_select_option',
      description: 'Select one or more options from a select dropdown, listbox, or combobox.',
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
            description: 'CSS selector for the select element'
          },
          options: {
            type: 'array',
            items: {
              oneOf: [
                { type: 'string' },
                {
                  type: 'object',
                  properties: {
                    value: { type: 'string' },
                    label: { type: 'string' },
                    index: { type: 'number' }
                  }
                }
              ]
            },
            minItems: 1,
            description: 'Options to select (by value, label, index, or mixed)'
          },
          method: {
            type: 'string',
            enum: ['value', 'label', 'index'],
            default: 'value',
            description: 'Default method to use when option is a string'
          },
          force: {
            type: 'boolean',
            default: false,
            description: 'Force selection even if option appears invalid'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Wait timeout for element'
          }
        },
        required: ['pageId', 'selector', 'options'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_select_option', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        
        // Get all available options first
        const availableOptions = await locator.evaluate(el => {
          if (el.tagName.toLowerCase() !== 'select') {
            return [];
          }
          
          return Array.from((el as HTMLSelectElement).options).map((option, index) => ({
            index,
            value: option.value,
            text: option.text,
            disabled: option.disabled,
            selected: option.selected
          }));
        });
        
        const selectedOptions = [];
        const errors = [];
        
        // Process each option to select
        for (const option of args.options) {
          try {
            if (typeof option === 'string') {
              // Simple string option - use default method
              switch (args.method) {
                case 'value':
                  await locator.selectOption({ value: option });
                  selectedOptions.push({ type: 'value', value: option });
                  break;
                case 'label':
                  await locator.selectOption({ label: option });
                  selectedOptions.push({ type: 'label', value: option });
                  break;
                case 'index':
                  await locator.selectOption({ index: parseInt(option) });
                  selectedOptions.push({ type: 'index', value: parseInt(option) });
                  break;
              }
            } else {
              // Object option with specific method
              if (option.value !== undefined) {
                await locator.selectOption({ value: option.value });
                selectedOptions.push({ type: 'value', value: option.value });
              } else if (option.label !== undefined) {
                await locator.selectOption({ label: option.label });
                selectedOptions.push({ type: 'label', value: option.label });
              } else if (option.index !== undefined) {
                await locator.selectOption({ index: option.index });
                selectedOptions.push({ type: 'index', value: option.index });
              }
            }
          } catch (error) {
            if (!args.force) {
              errors.push(`Failed to select option ${JSON.stringify(option)}: ${error.message}`);
            }
          }
        }
        
        if (errors.length > 0 && !args.force) {
          throw new Error(`Selection errors: ${errors.join(', ')}`);
        }
        
        // Get final selected values
        const finalSelection = await locator.evaluate(el => {
          if (el.tagName.toLowerCase() !== 'select') {
            return null;
          }
          
          const select = el as HTMLSelectElement;
          return {
            selectedIndex: select.selectedIndex,
            selectedValue: select.value,
            selectedOptions: Array.from(select.selectedOptions).map(opt => ({
              value: opt.value,
              text: opt.text,
              index: opt.index
            }))
          };
        });

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              requestedOptions: args.options,
              selectedOptions,
              finalSelection,
              availableOptions,
              errors: errors.length > 0 ? errors : undefined,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 2. Check Checkbox or Radio Button
    {
      name: 'element_check',
      description: 'Check a checkbox or radio button element.',
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
            description: 'CSS selector for the checkbox or radio input'
          },
          force: {
            type: 'boolean',
            default: false,
            description: 'Force check even if element is not actionable'
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
        const validation = validateElementSchema('element_check', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        
        const beforeState = await locator.isChecked().catch(() => false);
        const elementType = await locator.getAttribute('type').catch(() => '');
        
        if (!['checkbox', 'radio'].includes(elementType)) {
          throw new Error(`Element is not a checkbox or radio button. Type: ${elementType}`);
        }
        
        await locator.check({ force: args.force });
        
        const afterState = await locator.isChecked().catch(() => false);
        const elementInfo = await locator.evaluate(el => ({
          name: el.getAttribute('name'),
          value: el.getAttribute('value'),
          id: el.id,
          disabled: el.hasAttribute('disabled')
        }));

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              elementType,
              beforeState,
              afterState,
              changed: beforeState !== afterState,
              elementInfo,
              force: args.force,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 3. Uncheck Checkbox
    {
      name: 'element_uncheck',
      description: 'Uncheck a checkbox element.',
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
            description: 'CSS selector for the checkbox input'
          },
          force: {
            type: 'boolean',
            default: false,
            description: 'Force uncheck even if element is not actionable'
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
        const validation = validateElementSchema('element_uncheck', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        
        const beforeState = await locator.isChecked().catch(() => false);
        const elementType = await locator.getAttribute('type').catch(() => '');
        
        if (elementType !== 'checkbox') {
          throw new Error(`Element is not a checkbox. Type: ${elementType}`);
        }
        
        await locator.uncheck({ force: args.force });
        
        const afterState = await locator.isChecked().catch(() => false);
        const elementInfo = await locator.evaluate(el => ({
          name: el.getAttribute('name'),
          value: el.getAttribute('value'),
          id: el.id,
          disabled: el.hasAttribute('disabled')
        }));

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              beforeState,
              afterState,
              changed: beforeState !== afterState,
              elementInfo,
              force: args.force,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 4. Set Checked State
    {
      name: 'element_set_checked',
      description: 'Set the checked state of a checkbox or radio button explicitly.',
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
            description: 'CSS selector for the checkbox or radio input'
          },
          checked: {
            type: 'boolean',
            description: 'Desired checked state (true = checked, false = unchecked)'
          },
          force: {
            type: 'boolean',
            default: false,
            description: 'Force state change even if element is not actionable'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Wait timeout for element'
          }
        },
        required: ['pageId', 'selector', 'checked'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_set_checked', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        
        const beforeState = await locator.isChecked().catch(() => false);
        const elementType = await locator.getAttribute('type').catch(() => '');
        
        if (!['checkbox', 'radio'].includes(elementType)) {
          throw new Error(`Element is not a checkbox or radio button. Type: ${elementType}`);
        }
        
        await locator.setChecked(args.checked, { force: args.force });
        
        const afterState = await locator.isChecked().catch(() => false);
        const elementInfo = await locator.evaluate(el => ({
          name: el.getAttribute('name'),
          value: el.getAttribute('value'),
          id: el.id,
          disabled: el.hasAttribute('disabled')
        }));

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              elementType,
              requestedState: args.checked,
              beforeState,
              afterState,
              changed: beforeState !== afterState,
              successful: afterState === args.checked,
              elementInfo,
              force: args.force,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 5. Submit Form
    {
      name: 'form_submit',
      description: 'Submit a form with optional validation and wait for response.',
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
            description: 'CSS selector for the form element or submit button'
          },
          method: {
            type: 'string',
            enum: ['submit', 'click_submit', 'press_enter'],
            default: 'submit',
            description: 'Method to submit: form.submit(), click submit button, or press Enter'
          },
          waitForNavigation: {
            type: 'boolean',
            default: true,
            description: 'Whether to wait for navigation after submit'
          },
          waitForResponse: {
            type: 'boolean',
            default: false,
            description: 'Whether to wait for and capture network response'
          },
          validateBeforeSubmit: {
            type: 'boolean',
            default: true,
            description: 'Whether to validate form before submitting'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 120000,
            default: 30000,
            description: 'Wait timeout for submission'
          }
        },
        required: ['pageId', 'selector'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('form_submit', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        
        let validationResult = null;
        if (args.validateBeforeSubmit) {
          validationResult = await page.evaluate((sel) => {
            const element = document.querySelector(sel);
            if (!element) return { valid: false, message: 'Element not found' };
            
            let form = element;
            if (element.tagName.toLowerCase() !== 'form') {
              form = element.closest('form');
            }
            
            if (!form) return { valid: false, message: 'No form found' };
            
            const formElement = form as HTMLFormElement;
            const valid = formElement.checkValidity();
            
            if (!valid) {
              const invalidFields = Array.from(formElement.querySelectorAll(':invalid')).map(field => ({
                name: field.getAttribute('name') || field.id || 'unknown',
                validationMessage: (field as HTMLInputElement).validationMessage
              }));
              
              return { valid: false, message: 'Form validation failed', invalidFields };
            }
            
            return { valid: true, message: 'Form is valid' };
          }, args.selector);
          
          if (!validationResult.valid) {
            throw new Error(`Form validation failed: ${validationResult.message}`);
          }
        }
        
        const beforeUrl = page.url();
        let response = null;
        let navigationOccurred = false;
        
        // Set up response capture if requested
        if (args.waitForResponse) {
          page.on('response', (res) => {
            if (res.request().method() === 'POST') {
              response = {
                url: res.url(),
                status: res.status(),
                statusText: res.statusText(),
                headers: res.headers()
              };
            }
          });
        }
        
        // Submit based on method
        try {
          switch (args.method) {
            case 'submit':
              if (args.waitForNavigation) {
                await Promise.all([
                  page.waitForLoadState('networkidle', { timeout: args.timeout }),
                  locator.evaluate(el => {
                    let form = el;
                    if (el.tagName.toLowerCase() !== 'form') {
                      form = el.closest('form');
                    }
                    if (form) (form as HTMLFormElement).submit();
                  })
                ]);
              } else {
                await locator.evaluate(el => {
                  let form = el;
                  if (el.tagName.toLowerCase() !== 'form') {
                    form = el.closest('form');
                  }
                  if (form) (form as HTMLFormElement).submit();
                });
              }
              break;
              
            case 'click_submit':
              if (args.waitForNavigation) {
                await Promise.all([
                  page.waitForLoadState('networkidle', { timeout: args.timeout }),
                  locator.click()
                ]);
              } else {
                await locator.click();
              }
              break;
              
            case 'press_enter':
              await locator.focus();
              if (args.waitForNavigation) {
                await Promise.all([
                  page.waitForLoadState('networkidle', { timeout: args.timeout }),
                  page.keyboard.press('Enter')
                ]);
              } else {
                await page.keyboard.press('Enter');
              }
              break;
          }
          
          const afterUrl = page.url();
          navigationOccurred = beforeUrl !== afterUrl;
          
        } catch (error) {
          // Submission might have failed or timed out
          const afterUrl = page.url();
          navigationOccurred = beforeUrl !== afterUrl;
          
          if (!navigationOccurred && args.waitForNavigation) {
            throw new Error(`Form submission failed or no navigation occurred: ${error.message}`);
          }
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              method: args.method,
              beforeUrl,
              afterUrl: page.url(),
              navigationOccurred,
              validationResult,
              response,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 6. Reset Form
    {
      name: 'form_reset',
      description: 'Reset a form to its initial state.',
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
            description: 'CSS selector for the form element or reset button'
          },
          method: {
            type: 'string',
            enum: ['reset', 'click_reset'],
            default: 'reset',
            description: 'Method to reset: form.reset() or click reset button'
          },
          captureBeforeState: {
            type: 'boolean',
            default: true,
            description: 'Whether to capture form state before reset'
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
        const validation = validateElementSchema('form_reset', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        
        let beforeState = null;
        if (args.captureBeforeState) {
          beforeState = await page.evaluate((sel) => {
            const element = document.querySelector(sel);
            if (!element) return null;
            
            let form = element;
            if (element.tagName.toLowerCase() !== 'form') {
              form = element.closest('form');
            }
            
            if (!form) return null;
            
            const formData: Record<string, any> = {};
            const formElement = form as HTMLFormElement;
            
            Array.from(formElement.elements).forEach(field => {
              const element = field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
              const name = element.name || element.id;
              
              if (name) {
                switch (element.type) {
                  case 'checkbox':
                  case 'radio':
                    formData[name] = (element as HTMLInputElement).checked;
                    break;
                  case 'select-multiple':
                    const select = element as HTMLSelectElement;
                    formData[name] = Array.from(select.selectedOptions).map(opt => opt.value);
                    break;
                  default:
                    formData[name] = element.value;
                }
              }
            });
            
            return formData;
          }, args.selector);
        }
        
        // Reset the form
        switch (args.method) {
          case 'reset':
            await locator.evaluate(el => {
              let form = el;
              if (el.tagName.toLowerCase() !== 'form') {
                form = el.closest('form');
              }
              if (form) (form as HTMLFormElement).reset();
            });
            break;
            
          case 'click_reset':
            await locator.click();
            break;
        }
        
        // Capture after state if we captured before state
        let afterState = null;
        if (args.captureBeforeState) {
          await page.waitForTimeout(100); // Brief wait for reset to complete
          afterState = await page.evaluate((sel) => {
            const element = document.querySelector(sel);
            if (!element) return null;
            
            let form = element;
            if (element.tagName.toLowerCase() !== 'form') {
              form = element.closest('form');
            }
            
            if (!form) return null;
            
            const formData: Record<string, any> = {};
            const formElement = form as HTMLFormElement;
            
            Array.from(formElement.elements).forEach(field => {
              const element = field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
              const name = element.name || element.id;
              
              if (name) {
                switch (element.type) {
                  case 'checkbox':
                  case 'radio':
                    formData[name] = (element as HTMLInputElement).checked;
                    break;
                  case 'select-multiple':
                    const select = element as HTMLSelectElement;
                    formData[name] = Array.from(select.selectedOptions).map(opt => opt.value);
                    break;
                  default:
                    formData[name] = element.value;
                }
              }
            });
            
            return formData;
          }, args.selector);
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              method: args.method,
              beforeState,
              afterState,
              reset: JSON.stringify(beforeState) !== JSON.stringify(afterState),
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 7. Extract Form Data
    {
      name: 'form_get_data',
      description: 'Extract all field values and metadata from a form.',
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
            description: 'CSS selector for the form element'
          },
          includeMetadata: {
            type: 'boolean',
            default: true,
            description: 'Whether to include field metadata (type, validation, etc.)'
          },
          includeHiddenFields: {
            type: 'boolean',
            default: true,
            description: 'Whether to include hidden input fields'
          },
          validateFields: {
            type: 'boolean',
            default: false,
            description: 'Whether to validate each field'
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
        const validation = validateElementSchema('form_get_data', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        
        const formData = await page.evaluate((sel, options) => {
          const form = document.querySelector(sel) as HTMLFormElement;
          if (!form || form.tagName.toLowerCase() !== 'form') {
            throw new Error('Element is not a form');
          }
          
          const data: Record<string, any> = {};
          const metadata: Record<string, any> = {};
          const validation: Record<string, any> = {};
          
          Array.from(form.elements).forEach(field => {
            const element = field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
            const name = element.name || element.id || `unnamed_${element.type}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Skip hidden fields if not requested
            if (element.type === 'hidden' && !options.includeHiddenFields) {
              return;
            }
            
            // Extract value based on field type
            switch (element.type) {
              case 'checkbox':
              case 'radio':
                data[name] = (element as HTMLInputElement).checked;
                break;
              case 'select-multiple':
                const select = element as HTMLSelectElement;
                data[name] = Array.from(select.selectedOptions).map(opt => opt.value);
                break;
              case 'file':
                const fileInput = element as HTMLInputElement;
                data[name] = Array.from(fileInput.files || []).map(file => ({
                  name: file.name,
                  size: file.size,
                  type: file.type
                }));
                break;
              default:
                data[name] = element.value;
            }
            
            // Collect metadata if requested
            if (options.includeMetadata) {
              metadata[name] = {
                type: element.type,
                tagName: element.tagName.toLowerCase(),
                required: element.hasAttribute('required'),
                disabled: element.hasAttribute('disabled'),
                readonly: element.hasAttribute('readonly'),
                placeholder: element.getAttribute('placeholder'),
                maxLength: element.getAttribute('maxlength'),
                pattern: element.getAttribute('pattern'),
                min: element.getAttribute('min'),
                max: element.getAttribute('max'),
                step: element.getAttribute('step')
              };
              
              // Additional metadata for select elements
              if (element.tagName.toLowerCase() === 'select') {
                const selectElement = element as HTMLSelectElement;
                metadata[name].options = Array.from(selectElement.options).map(opt => ({
                  value: opt.value,
                  text: opt.text,
                  selected: opt.selected,
                  disabled: opt.disabled
                }));
                metadata[name].multiple = selectElement.multiple;
              }
            }
            
            // Validate fields if requested
            if (options.validateFields) {
              const valid = element.checkValidity();
              validation[name] = {
                valid,
                validationMessage: valid ? null : (element as HTMLInputElement).validationMessage,
                valueMissing: (element as HTMLInputElement).validity?.valueMissing,
                typeMismatch: (element as HTMLInputElement).validity?.typeMismatch,
                patternMismatch: (element as HTMLInputElement).validity?.patternMismatch,
                tooLong: (element as HTMLInputElement).validity?.tooLong,
                tooShort: (element as HTMLInputElement).validity?.tooShort,
                rangeUnderflow: (element as HTMLInputElement).validity?.rangeUnderflow,
                rangeOverflow: (element as HTMLInputElement).validity?.rangeOverflow,
                stepMismatch: (element as HTMLInputElement).validity?.stepMismatch
              };
            }
          });
          
          return {
            data,
            metadata: options.includeMetadata ? metadata : undefined,
            validation: options.validateFields ? validation : undefined,
            formInfo: {
              method: form.method,
              action: form.action,
              encoding: form.encoding,
              target: form.target,
              elementCount: form.elements.length,
              valid: options.validateFields ? form.checkValidity() : undefined
            }
          };
        }, args.selector, {
          includeMetadata: args.includeMetadata,
          includeHiddenFields: args.includeHiddenFields,
          validateFields: args.validateFields
        });

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              formData,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 8. Fill Form from Data Object
    {
      name: 'form_fill_data',
      description: 'Fill an entire form from a data object mapping field names to values.',
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
            description: 'CSS selector for the form element'
          },
          data: {
            type: 'object',
            description: 'Object mapping field names/IDs to values'
          },
          clearFirst: {
            type: 'boolean',
            default: true,
            description: 'Whether to clear existing values before filling'
          },
          skipMissing: {
            type: 'boolean',
            default: true,
            description: 'Whether to skip missing fields or throw error'
          },
          validateAfter: {
            type: 'boolean',
            default: false,
            description: 'Whether to validate form after filling'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 120000,
            default: 60000,
            description: 'Wait timeout for filling operation'
          }
        },
        required: ['pageId', 'selector', 'data'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('form_fill_data', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const formLocator = page.locator(args.selector);
        
        await formLocator.waitFor({ state: 'attached', timeout: args.timeout });
        
        const fillResults = [];
        const errors = [];
        
        // Process each field in the data object
        for (const [fieldName, value] of Object.entries(args.data)) {
          try {
            // Try multiple selector strategies to find the field
            const selectors = [
              `[name="${fieldName}"]`,
              `#${fieldName}`,
              `[id="${fieldName}"]`,
              `[data-name="${fieldName}"]`
            ];
            
            let fieldLocator = null;
            for (const sel of selectors) {
              const fullSelector = `${args.selector} ${sel}`;
              const count = await page.locator(fullSelector).count();
              if (count > 0) {
                fieldLocator = page.locator(fullSelector);
                break;
              }
            }
            
            if (!fieldLocator) {
              if (!args.skipMissing) {
                throw new Error(`Field '${fieldName}' not found`);
              }
              fillResults.push({
                field: fieldName,
                status: 'skipped',
                reason: 'Field not found'
              });
              continue;
            }
            
            // Get field type and handle accordingly
            const fieldType = await fieldLocator.getAttribute('type').catch(() => '');
            const tagName = await fieldLocator.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
            
            // Clear field first if requested
            if (args.clearFirst) {
              if (['input', 'textarea'].includes(tagName) && !['checkbox', 'radio', 'file'].includes(fieldType)) {
                await fieldLocator.clear();
              }
            }
            
            // Fill based on field type
            switch (fieldType) {
              case 'checkbox':
                await fieldLocator.setChecked(Boolean(value));
                fillResults.push({
                  field: fieldName,
                  status: 'success',
                  value: Boolean(value),
                  type: 'checkbox'
                });
                break;
                
              case 'radio':
                if (value) {
                  await fieldLocator.check();
                  fillResults.push({
                    field: fieldName,
                    status: 'success',
                    value: true,
                    type: 'radio'
                  });
                }
                break;
                
              case 'file':
                if (Array.isArray(value)) {
                  await fieldLocator.setInputFiles(value);
                  fillResults.push({
                    field: fieldName,
                    status: 'success',
                    value: value,
                    type: 'file'
                  });
                }
                break;
                
              default:
                if (tagName === 'select') {
                  if (Array.isArray(value)) {
                    // Multiple select
                    await fieldLocator.selectOption(value);
                  } else {
                    await fieldLocator.selectOption(String(value));
                  }
                  fillResults.push({
                    field: fieldName,
                    status: 'success',
                    value: value,
                    type: 'select'
                  });
                } else {
                  // Regular input or textarea
                  await fieldLocator.fill(String(value));
                  fillResults.push({
                    field: fieldName,
                    status: 'success',
                    value: String(value),
                    type: fieldType || tagName
                  });
                }
                break;
            }
            
          } catch (error) {
            errors.push({
              field: fieldName,
              error: error.message,
              value: value
            });
            
            fillResults.push({
              field: fieldName,
              status: 'error',
              error: error.message,
              value: value
            });
          }
        }
        
        // Validate form if requested
        let validationResult = null;
        if (args.validateAfter) {
          validationResult = await page.evaluate((sel) => {
            const form = document.querySelector(sel) as HTMLFormElement;
            if (!form) return { valid: false, message: 'Form not found' };
            
            const valid = form.checkValidity();
            if (!valid) {
              const invalidFields = Array.from(form.querySelectorAll(':invalid')).map(field => ({
                name: field.getAttribute('name') || field.id || 'unknown',
                validationMessage: (field as HTMLInputElement).validationMessage
              }));
              
              return { valid: false, message: 'Form validation failed', invalidFields };
            }
            
            return { valid: true, message: 'Form is valid' };
          }, args.selector);
        }

        return {
          success: errors.length === 0 || args.skipMissing,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              requestedFields: Object.keys(args.data),
              fillResults,
              successCount: fillResults.filter(r => r.status === 'success').length,
              errorCount: errors.length,
              skippedCount: fillResults.filter(r => r.status === 'skipped').length,
              errors: errors.length > 0 ? errors : undefined,
              validationResult,
              settings: {
                clearFirst: args.clearFirst,
                skipMissing: args.skipMissing,
                validateAfter: args.validateAfter
              },
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    }
  ];
}
/**
 * Advanced Element Locator Strategies for Playwright MCP Server
 * Implements intelligent locator algorithms with optimization and fallback mechanisms
 */

import { Page, Locator } from 'playwright';
import { MCPTool, MCPToolResult } from '../../../types.js';
import { PlaywrightService } from '../../../services/playwright.js';
import { validateElementSchema } from '../validation/element-schemas.js';
import { optimizeSelector } from './locator-optimization.js';

/**
 * Advanced Element Location Tools (12 tools)
 */
export function createAdvancedLocatorTools(playwrightService: PlaywrightService): MCPTool[] {
  return [
    // 1. Locate by ARIA Role
    {
      name: 'locator_get_by_role',
      description: 'Locate elements by ARIA role with advanced options. More reliable than CSS selectors for accessibility.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID'
          },
          role: {
            type: 'string',
            enum: [
              'alert', 'alertdialog', 'application', 'article', 'banner', 'button',
              'cell', 'checkbox', 'columnheader', 'combobox', 'complementary',
              'contentinfo', 'definition', 'dialog', 'directory', 'document',
              'form', 'grid', 'gridcell', 'group', 'heading', 'img', 'link',
              'list', 'listbox', 'listitem', 'log', 'main', 'marquee', 'math',
              'menu', 'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
              'navigation', 'note', 'option', 'presentation', 'progressbar',
              'radio', 'radiogroup', 'region', 'row', 'rowgroup', 'rowheader',
              'scrollbar', 'search', 'separator', 'slider', 'spinbutton',
              'status', 'tab', 'tablist', 'tabpanel', 'textbox', 'timer',
              'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem'
            ],
            description: 'ARIA role to locate'
          },
          name: {
            type: 'string',
            description: 'Accessible name to filter by (aria-label, aria-labelledby, or text content)'
          },
          exact: {
            type: 'boolean',
            default: true,
            description: 'Whether to match the name exactly or partially'
          },
          level: {
            type: 'number',
            minimum: 1,
            maximum: 6,
            description: 'Heading level (only for role="heading")'
          },
          pressed: {
            type: 'boolean',
            description: 'aria-pressed state (for buttons and toggles)'
          },
          checked: {
            type: 'boolean',
            description: 'aria-checked state (for checkboxes and radios)'
          },
          selected: {
            type: 'boolean',
            description: 'aria-selected state (for options and tabs)'
          },
          expanded: {
            type: 'boolean',
            description: 'aria-expanded state (for collapsible elements)'
          },
          disabled: {
            type: 'boolean',
            description: 'disabled state'
          },
          includeHidden: {
            type: 'boolean',
            default: false,
            description: 'Whether to include hidden elements'
          }
        },
        required: ['pageId', 'role'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('locator_get_by_role', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const options: any = {};
        
        if (args.name !== undefined) options.name = args.exact !== false ? args.name : new RegExp(args.name, 'i');
        if (args.level !== undefined) options.level = args.level;
        if (args.pressed !== undefined) options.pressed = args.pressed;
        if (args.checked !== undefined) options.checked = args.checked;
        if (args.selected !== undefined) options.selected = args.selected;
        if (args.expanded !== undefined) options.expanded = args.expanded;
        if (args.disabled !== undefined) options.disabled = args.disabled;
        if (args.includeHidden !== undefined) options.includeHidden = args.includeHidden;

        const locator = page.getByRole(args.role as any, options);
        const count = await locator.count();
        const elements = [];

        for (let i = 0; i < Math.min(count, 10); i++) { // Limit to 10 elements
          const element = locator.nth(i);
          const boundingBox = await element.boundingBox().catch(() => null);
          const isVisible = await element.isVisible().catch(() => false);
          
          elements.push({
            index: i,
            selector: await generateSelectorForElement(element, page),
            boundingBox,
            isVisible,
            textContent: await element.textContent().catch(() => null)
          });
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              role: args.role,
              totalCount: count,
              elements,
              searchOptions: options
            }, null, 2)
          }]
        };
      }
    },

    // 2. Locate by Text Content
    {
      name: 'locator_get_by_text',
      description: 'Locate elements by text content with regex support and intelligent matching.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID'
          },
          text: {
            type: 'string',
            minLength: 1,
            description: 'Text to search for (supports regex when useRegex=true)'
          },
          exact: {
            type: 'boolean',
            default: false,
            description: 'Whether to match the text exactly'
          },
          useRegex: {
            type: 'boolean',
            default: false,
            description: 'Whether to treat text as a regular expression'
          },
          caseSensitive: {
            type: 'boolean',
            default: false,
            description: 'Whether the search should be case-sensitive'
          }
        },
        required: ['pageId', 'text'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('locator_get_by_text', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        
        let textPattern: string | RegExp = args.text;
        if (args.useRegex) {
          const flags = args.caseSensitive ? 'g' : 'gi';
          textPattern = new RegExp(args.text, flags);
        } else if (!args.exact) {
          textPattern = args.caseSensitive ? args.text : new RegExp(args.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        }

        const locator = page.getByText(textPattern, { exact: args.exact });
        const count = await locator.count();
        const elements = [];

        for (let i = 0; i < Math.min(count, 10); i++) {
          const element = locator.nth(i);
          const boundingBox = await element.boundingBox().catch(() => null);
          const isVisible = await element.isVisible().catch(() => false);
          
          elements.push({
            index: i,
            selector: await generateSelectorForElement(element, page),
            boundingBox,
            isVisible,
            textContent: await element.textContent().catch(() => null),
            tagName: await element.evaluate(el => el.tagName.toLowerCase()).catch(() => null)
          });
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              searchText: args.text,
              exact: args.exact,
              useRegex: args.useRegex,
              totalCount: count,
              elements
            }, null, 2)
          }]
        };
      }
    },

    // 3. Locate by Label
    {
      name: 'locator_get_by_label',
      description: 'Locate form elements by their associated label text.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID'
          },
          text: {
            type: 'string',
            minLength: 1,
            description: 'Label text to search for'
          },
          exact: {
            type: 'boolean',
            default: true,
            description: 'Whether to match the label text exactly'
          }
        },
        required: ['pageId', 'text'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('locator_get_by_label', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const textPattern = args.exact ? args.text : new RegExp(args.text, 'i');
        const locator = page.getByLabel(textPattern, { exact: args.exact });
        const count = await locator.count();
        const elements = [];

        for (let i = 0; i < Math.min(count, 10); i++) {
          const element = locator.nth(i);
          const boundingBox = await element.boundingBox().catch(() => null);
          const isVisible = await element.isVisible().catch(() => false);
          
          elements.push({
            index: i,
            selector: await generateSelectorForElement(element, page),
            boundingBox,
            isVisible,
            value: await element.inputValue().catch(() => null),
            tagName: await element.evaluate(el => el.tagName.toLowerCase()).catch(() => null),
            type: await element.getAttribute('type').catch(() => null)
          });
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              labelText: args.text,
              exact: args.exact,
              totalCount: count,
              elements
            }, null, 2)
          }]
        };
      }
    },

    // 4. Locate by Placeholder
    {
      name: 'locator_get_by_placeholder',
      description: 'Locate input elements by their placeholder text.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID'
          },
          text: {
            type: 'string',
            minLength: 1,
            description: 'Placeholder text to search for'
          },
          exact: {
            type: 'boolean',
            default: true,
            description: 'Whether to match the placeholder text exactly'
          }
        },
        required: ['pageId', 'text'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('locator_get_by_placeholder', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const textPattern = args.exact ? args.text : new RegExp(args.text, 'i');
        const locator = page.getByPlaceholder(textPattern, { exact: args.exact });
        const count = await locator.count();
        const elements = [];

        for (let i = 0; i < Math.min(count, 10); i++) {
          const element = locator.nth(i);
          const boundingBox = await element.boundingBox().catch(() => null);
          const isVisible = await element.isVisible().catch(() => false);
          
          elements.push({
            index: i,
            selector: await generateSelectorForElement(element, page),
            boundingBox,
            isVisible,
            value: await element.inputValue().catch(() => null),
            placeholder: await element.getAttribute('placeholder').catch(() => null)
          });
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              placeholderText: args.text,
              exact: args.exact,
              totalCount: count,
              elements
            }, null, 2)
          }]
        };
      }
    },

    // 5. Locate by Alt Text
    {
      name: 'locator_get_by_alt_text',
      description: 'Locate images by their alt text attribute.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID'
          },
          text: {
            type: 'string',
            minLength: 1,
            description: 'Alt text to search for'
          },
          exact: {
            type: 'boolean',
            default: true,
            description: 'Whether to match the alt text exactly'
          }
        },
        required: ['pageId', 'text'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('locator_get_by_alt_text', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const textPattern = args.exact ? args.text : new RegExp(args.text, 'i');
        const locator = page.getByAltText(textPattern, { exact: args.exact });
        const count = await locator.count();
        const elements = [];

        for (let i = 0; i < Math.min(count, 10); i++) {
          const element = locator.nth(i);
          const boundingBox = await element.boundingBox().catch(() => null);
          const isVisible = await element.isVisible().catch(() => false);
          
          elements.push({
            index: i,
            selector: await generateSelectorForElement(element, page),
            boundingBox,
            isVisible,
            src: await element.getAttribute('src').catch(() => null),
            alt: await element.getAttribute('alt').catch(() => null)
          });
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              altText: args.text,
              exact: args.exact,
              totalCount: count,
              elements
            }, null, 2)
          }]
        };
      }
    },

    // 6. Locate by Title
    {
      name: 'locator_get_by_title',
      description: 'Locate elements by their title attribute.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID'
          },
          text: {
            type: 'string',
            minLength: 1,
            description: 'Title text to search for'
          },
          exact: {
            type: 'boolean',
            default: true,
            description: 'Whether to match the title text exactly'
          }
        },
        required: ['pageId', 'text'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('locator_get_by_title', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const textPattern = args.exact ? args.text : new RegExp(args.text, 'i');
        const locator = page.getByTitle(textPattern, { exact: args.exact });
        const count = await locator.count();
        const elements = [];

        for (let i = 0; i < Math.min(count, 10); i++) {
          const element = locator.nth(i);
          const boundingBox = await element.boundingBox().catch(() => null);
          const isVisible = await element.isVisible().catch(() => false);
          
          elements.push({
            index: i,
            selector: await generateSelectorForElement(element, page),
            boundingBox,
            isVisible,
            title: await element.getAttribute('title').catch(() => null),
            tagName: await element.evaluate(el => el.tagName.toLowerCase()).catch(() => null)
          });
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              titleText: args.text,
              exact: args.exact,
              totalCount: count,
              elements
            }, null, 2)
          }]
        };
      }
    },

    // 7. Locate by Test ID
    {
      name: 'locator_get_by_test_id',
      description: 'Locate elements by test data attributes (data-testid, data-test, data-cy).',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID'
          },
          testId: {
            type: 'string',
            minLength: 1,
            description: 'Test ID value to search for'
          },
          attribute: {
            type: 'string',
            enum: ['data-testid', 'data-test', 'data-cy', 'data-qa', 'data-test-id'],
            default: 'data-testid',
            description: 'Test attribute name to use'
          }
        },
        required: ['pageId', 'testId'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('locator_get_by_test_id', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = args.attribute === 'data-testid' 
          ? page.getByTestId(args.testId)
          : page.locator(`[${args.attribute}="${args.testId}"]`);
        
        const count = await locator.count();
        const elements = [];

        for (let i = 0; i < Math.min(count, 10); i++) {
          const element = locator.nth(i);
          const boundingBox = await element.boundingBox().catch(() => null);
          const isVisible = await element.isVisible().catch(() => false);
          
          elements.push({
            index: i,
            selector: await generateSelectorForElement(element, page),
            boundingBox,
            isVisible,
            testId: await element.getAttribute(args.attribute).catch(() => null),
            tagName: await element.evaluate(el => el.tagName.toLowerCase()).catch(() => null)
          });
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              testId: args.testId,
              attribute: args.attribute,
              totalCount: count,
              elements
            }, null, 2)
          }]
        };
      }
    },

    // 8. Advanced CSS Selector
    {
      name: 'locator_css_selector',
      description: 'Advanced CSS selector with pseudo-classes, optimization, and validation.',
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
            description: 'CSS selector (supports pseudo-classes, nth-child, etc.)'
          },
          optimize: {
            type: 'boolean',
            default: true,
            description: 'Whether to optimize the selector for better performance'
          },
          validateSelector: {
            type: 'boolean',
            default: true,
            description: 'Whether to validate the CSS selector syntax'
          }
        },
        required: ['pageId', 'selector'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('locator_css_selector', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        let selector = args.selector;

        // Optimize selector if requested
        if (args.optimize) {
          selector = await optimizeSelector(selector, page);
        }

        // Validate selector syntax if requested
        if (args.validateSelector) {
          try {
            await page.locator(selector).count();
          } catch (error) {
            throw new Error(`Invalid CSS selector: ${error.message}`);
          }
        }

        const locator = page.locator(selector);
        const count = await locator.count();
        const elements = [];

        for (let i = 0; i < Math.min(count, 10); i++) {
          const element = locator.nth(i);
          const boundingBox = await element.boundingBox().catch(() => null);
          const isVisible = await element.isVisible().catch(() => false);
          
          elements.push({
            index: i,
            selector: selector,
            boundingBox,
            isVisible,
            tagName: await element.evaluate(el => el.tagName.toLowerCase()).catch(() => null),
            className: await element.getAttribute('class').catch(() => null),
            id: await element.getAttribute('id').catch(() => null)
          });
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              originalSelector: args.selector,
              optimizedSelector: selector,
              totalCount: count,
              elements,
              performance: {
                optimized: args.optimize && selector !== args.selector,
                validated: args.validateSelector
              }
            }, null, 2)
          }]
        };
      }
    },

    // 9. XPath Locator
    {
      name: 'locator_xpath',
      description: 'XPath expressions with axes, functions, and advanced features.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID'
          },
          xpath: {
            type: 'string',
            minLength: 1,
            description: 'XPath expression (supports axes, functions, predicates)'
          },
          validateXPath: {
            type: 'boolean',
            default: true,
            description: 'Whether to validate the XPath expression syntax'
          }
        },
        required: ['pageId', 'xpath'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('locator_xpath', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);

        // Validate XPath syntax if requested
        if (args.validateXPath) {
          try {
            await page.locator(args.xpath).count();
          } catch (error) {
            throw new Error(`Invalid XPath expression: ${error.message}`);
          }
        }

        const locator = page.locator(args.xpath);
        const count = await locator.count();
        const elements = [];

        for (let i = 0; i < Math.min(count, 10); i++) {
          const element = locator.nth(i);
          const boundingBox = await element.boundingBox().catch(() => null);
          const isVisible = await element.isVisible().catch(() => false);
          
          elements.push({
            index: i,
            xpath: args.xpath,
            boundingBox,
            isVisible,
            tagName: await element.evaluate(el => el.tagName.toLowerCase()).catch(() => null),
            textContent: await element.textContent().catch(() => null)
          });
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              xpath: args.xpath,
              totalCount: count,
              elements,
              validated: args.validateXPath
            }, null, 2)
          }]
        };
      }
    },

    // 10. Get Nth Element
    {
      name: 'locator_nth_match',
      description: 'Get the nth element from a locator result set.',
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
            description: 'CSS selector or XPath to find elements'
          },
          index: {
            type: 'number',
            minimum: 0,
            description: 'Zero-based index of the element to select'
          }
        },
        required: ['pageId', 'selector', 'index'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('locator_nth_match', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector).nth(args.index);
        const exists = await locator.count() > 0;

        if (!exists) {
          throw new Error(`Element at index ${args.index} not found for selector: ${args.selector}`);
        }

        const boundingBox = await locator.boundingBox().catch(() => null);
        const isVisible = await locator.isVisible().catch(() => false);

        const element = {
          index: args.index,
          selector: args.selector,
          boundingBox,
          isVisible,
          tagName: await locator.evaluate(el => el.tagName.toLowerCase()).catch(() => null),
          textContent: await locator.textContent().catch(() => null),
          id: await locator.getAttribute('id').catch(() => null),
          className: await locator.getAttribute('class').catch(() => null)
        };

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              selectedIndex: args.index,
              element
            }, null, 2)
          }]
        };
      }
    },

    // 11. Get First Element
    {
      name: 'locator_first',
      description: 'Get the first element from a locator result set.',
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
            description: 'CSS selector or XPath to find elements'
          }
        },
        required: ['pageId', 'selector'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('locator_first', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector).first();
        const count = await page.locator(args.selector).count();

        if (count === 0) {
          throw new Error(`No elements found for selector: ${args.selector}`);
        }

        const boundingBox = await locator.boundingBox().catch(() => null);
        const isVisible = await locator.isVisible().catch(() => false);

        const element = {
          index: 0,
          selector: args.selector,
          boundingBox,
          isVisible,
          tagName: await locator.evaluate(el => el.tagName.toLowerCase()).catch(() => null),
          textContent: await locator.textContent().catch(() => null),
          id: await locator.getAttribute('id').catch(() => null),
          className: await locator.getAttribute('class').catch(() => null)
        };

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              totalCount: count,
              selectedElement: 'first',
              element
            }, null, 2)
          }]
        };
      }
    },

    // 12. Get Last Element
    {
      name: 'locator_last',
      description: 'Get the last element from a locator result set.',
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
            description: 'CSS selector or XPath to find elements'
          }
        },
        required: ['pageId', 'selector'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('locator_last', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector).last();
        const count = await page.locator(args.selector).count();

        if (count === 0) {
          throw new Error(`No elements found for selector: ${args.selector}`);
        }

        const boundingBox = await locator.boundingBox().catch(() => null);
        const isVisible = await locator.isVisible().catch(() => false);

        const element = {
          index: count - 1,
          selector: args.selector,
          boundingBox,
          isVisible,
          tagName: await locator.evaluate(el => el.tagName.toLowerCase()).catch(() => null),
          textContent: await locator.textContent().catch(() => null),
          id: await locator.getAttribute('id').catch(() => null),
          className: await locator.getAttribute('class').catch(() => null)
        };

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              totalCount: count,
              selectedElement: 'last',
              element
            }, null, 2)
          }]
        };
      }
    }
  ];
}

/**
 * Generate a robust selector for an element
 */
async function generateSelectorForElement(locator: Locator, page: Page): Promise<string> {
  try {
    // Try to generate a stable selector
    const id = await locator.getAttribute('id').catch(() => null);
    if (id) return `#${id}`;

    const testId = await locator.getAttribute('data-testid').catch(() => null);
    if (testId) return `[data-testid="${testId}"]`;

    const className = await locator.getAttribute('class').catch(() => null);
    const tagName = await locator.evaluate(el => el.tagName.toLowerCase()).catch(() => 'unknown');
    
    if (className) {
      const classes = className.split(' ').filter(c => c.length > 0);
      if (classes.length > 0) {
        return `${tagName}.${classes[0]}`;
      }
    }

    return tagName;
  } catch (error) {
    return 'unknown-selector';
  }
}
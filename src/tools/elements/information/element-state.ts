/**
 * Element State and Information Tools for Playwright MCP Server
 * Implements comprehensive element property and state inspection capabilities
 */

import { Page, Locator } from 'playwright';
import { MCPTool, MCPToolResult } from '../../../types.js';
import { PlaywrightService } from '../../../services/playwright.js';
import { validateElementSchema } from '../validation/element-schemas.js';

/**
 * Element State and Information Tools (10 tools)
 */
export function createElementStateTools(playwrightService: PlaywrightService): MCPTool[] {
  return [
    // 1. Get Element Attribute
    {
      name: 'element_get_attribute',
      description: 'Get the value of a specific attribute from an element.',
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
          attributeName: {
            type: 'string',
            minLength: 1,
            description: 'Name of the attribute to retrieve (e.g., "class", "id", "data-*", "aria-*")'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Wait timeout for element'
          }
        },
        required: ['pageId', 'selector', 'attributeName'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_get_attribute', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        const attributeValue = await locator.getAttribute(args.attributeName);

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              attributeName: args.attributeName,
              attributeValue,
              exists: attributeValue !== null,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 2. Get Element Property
    {
      name: 'element_get_property',
      description: 'Get a DOM property value from an element (different from attributes).',
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
          propertyName: {
            type: 'string',
            minLength: 1,
            description: 'Name of the DOM property to retrieve (e.g., "value", "checked", "disabled", "innerHTML")'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 60000,
            default: 30000,
            description: 'Wait timeout for element'
          }
        },
        required: ['pageId', 'selector', 'propertyName'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_get_property', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        const propertyValue = await locator.evaluate((el, prop) => (el as any)[prop], args.propertyName);

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              propertyName: args.propertyName,
              propertyValue,
              propertyType: typeof propertyValue,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 3. Get Computed Style
    {
      name: 'element_get_computed_style',
      description: 'Get CSS computed styles for an element.',
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
          properties: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of CSS properties to retrieve (if empty, returns all computed styles)'
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
        const validation = validateElementSchema('element_get_computed_style', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        
        const computedStyles = await locator.evaluate((el, properties) => {
          const styles = window.getComputedStyle(el);
          const result: Record<string, string> = {};
          
          if (properties && properties.length > 0) {
            // Get specific properties
            for (const prop of properties) {
              result[prop] = styles.getPropertyValue(prop);
            }
          } else {
            // Get all computed styles
            for (let i = 0; i < styles.length; i++) {
              const prop = styles.item(i);
              result[prop] = styles.getPropertyValue(prop);
            }
          }
          
          return result;
        }, args.properties || []);

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              computedStyles,
              propertiesRequested: args.properties || 'all',
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 4. Get Bounding Box
    {
      name: 'element_get_bounding_box',
      description: 'Get element position and size information including viewport coordinates.',
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
          includeViewportInfo: {
            type: 'boolean',
            default: true,
            description: 'Whether to include viewport-relative information'
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
        const validation = validateElementSchema('element_get_bounding_box', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        const boundingBox = await locator.boundingBox();

        let viewportInfo = null;
        if (args.includeViewportInfo && boundingBox) {
          const viewport = page.viewportSize() || { width: 0, height: 0 };
          viewportInfo = {
            viewport: viewport,
            isInViewport: {
              x: boundingBox.x >= 0 && boundingBox.x + boundingBox.width <= viewport.width,
              y: boundingBox.y >= 0 && boundingBox.y + boundingBox.height <= viewport.height,
              fully: (boundingBox.x >= 0 && boundingBox.x + boundingBox.width <= viewport.width) &&
                     (boundingBox.y >= 0 && boundingBox.y + boundingBox.height <= viewport.height)
            },
            center: {
              x: boundingBox.x + boundingBox.width / 2,
              y: boundingBox.y + boundingBox.height / 2
            }
          };
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              boundingBox,
              viewportInfo,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 5. Get Text Content
    {
      name: 'element_text_content',
      description: 'Get text content of an element including hidden text.',
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
          normalize: {
            type: 'boolean',
            default: true,
            description: 'Whether to normalize whitespace'
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
        const validation = validateElementSchema('element_text_content', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        const textContent = await locator.textContent();
        
        let processedText = textContent || '';
        if (args.normalize && textContent) {
          processedText = textContent.replace(/\s+/g, ' ').trim();
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              textContent: processedText,
              originalLength: textContent?.length || 0,
              processedLength: processedText.length,
              normalized: args.normalize,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 6. Get Inner Text
    {
      name: 'element_inner_text',
      description: 'Get visible text content only (excludes hidden elements).',
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
          normalize: {
            type: 'boolean',
            default: true,
            description: 'Whether to normalize whitespace'
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
        const validation = validateElementSchema('element_inner_text', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        const innerText = await locator.innerText();
        
        let processedText = innerText || '';
        if (args.normalize && innerText) {
          processedText = innerText.replace(/\s+/g, ' ').trim();
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              innerText: processedText,
              originalLength: innerText?.length || 0,
              processedLength: processedText.length,
              normalized: args.normalize,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 7. Get Inner HTML
    {
      name: 'element_inner_html',
      description: 'Get the innerHTML content of an element.',
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
          prettify: {
            type: 'boolean',
            default: false,
            description: 'Whether to prettify the HTML output'
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
        const validation = validateElementSchema('element_inner_html', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        const innerHTML = await locator.innerHTML();
        
        let processedHTML = innerHTML;
        if (args.prettify && innerHTML) {
          // Basic HTML prettification
          processedHTML = innerHTML
            .replace(/></g, '>\n<')
            .replace(/^\s*\n/gm, '')
            .split('\n')
            .map((line, index, lines) => {
              const depth = (line.match(/^<(?!\/)/g) || []).length - (line.match(/<\//g) || []).length;
              return '  '.repeat(Math.max(0, depth)) + line.trim();
            })
            .join('\n');
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              innerHTML: processedHTML,
              length: innerHTML.length,
              prettified: args.prettify,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 8. Get Outer HTML
    {
      name: 'element_outer_html',
      description: 'Get the outerHTML content of an element (includes the element itself).',
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
          prettify: {
            type: 'boolean',
            default: false,
            description: 'Whether to prettify the HTML output'
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
        const validation = validateElementSchema('element_outer_html', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        const outerHTML = await locator.evaluate(el => el.outerHTML);
        
        let processedHTML = outerHTML;
        if (args.prettify && outerHTML) {
          // Basic HTML prettification
          processedHTML = outerHTML
            .replace(/></g, '>\n<')
            .replace(/^\s*\n/gm, '')
            .split('\n')
            .map((line, index, lines) => {
              const depth = (line.match(/^<(?!\/)/g) || []).length - (line.match(/<\//g) || []).length;
              return '  '.repeat(Math.max(0, depth)) + line.trim();
            })
            .join('\n');
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              outerHTML: processedHTML,
              length: outerHTML.length,
              prettified: args.prettify,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 9. Check Element Visibility
    {
      name: 'element_is_visible',
      description: 'Check if an element is visible on the page.',
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
          includeDetails: {
            type: 'boolean',
            default: true,
            description: 'Whether to include detailed visibility information'
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
        const validation = validateElementSchema('element_is_visible', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        const isVisible = await locator.isVisible();
        
        let details = null;
        if (args.includeDetails) {
          const boundingBox = await locator.boundingBox().catch(() => null);
          const computedStyle = await locator.evaluate(el => {
            const styles = window.getComputedStyle(el);
            return {
              display: styles.display,
              visibility: styles.visibility,
              opacity: styles.opacity,
              overflow: styles.overflow,
              position: styles.position,
              zIndex: styles.zIndex
            };
          }).catch(() => null);
          
          details = {
            boundingBox,
            computedStyle,
            hasSize: boundingBox ? (boundingBox.width > 0 && boundingBox.height > 0) : false,
            inDom: await locator.count() > 0
          };
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              isVisible,
              details,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 10. Check Element Enabled State
    {
      name: 'element_is_enabled',
      description: 'Check if an element is enabled/disabled.',
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
          includeDetails: {
            type: 'boolean',
            default: true,
            description: 'Whether to include detailed state information'
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
        const validation = validateElementSchema('element_is_enabled', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        const isEnabled = await locator.isEnabled();
        
        let details = null;
        if (args.includeDetails) {
          const elementInfo = await locator.evaluate(el => ({
            tagName: el.tagName.toLowerCase(),
            type: el.getAttribute('type'),
            disabled: el.hasAttribute('disabled'),
            ariaDisabled: el.getAttribute('aria-disabled'),
            readonly: el.hasAttribute('readonly'),
            tabIndex: el.tabIndex
          })).catch(() => null);
          
          details = {
            ...elementInfo,
            isEditable: await locator.isEditable().catch(() => false),
            canFocus: elementInfo?.tabIndex !== -1
          };
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              isEnabled,
              isDisabled: !isEnabled,
              details,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    }
  ];
}
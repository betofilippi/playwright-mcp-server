/**
 * Element Analysis Engine for Playwright MCP Server
 * Implements intelligent element analysis, structure inspection, and automation insights
 */

import { Page, Locator, ElementHandle } from 'playwright';
import { MCPTool, MCPToolResult } from '../../../types.js';
import { PlaywrightService } from '../../../services/playwright.js';
import { validateElementSchema } from '../validation/element-schemas.js';

/**
 * Comprehensive element analysis interface
 */
interface ElementAnalysisResult {
  basic: {
    tagName: string;
    id?: string;
    className?: string;
    textContent?: string;
    innerHTML?: string;
    outerHTML?: string;
  };
  attributes: Record<string, string>;
  computedStyles: Record<string, string>;
  positioning: {
    boundingBox?: any;
    isVisible: boolean;
    isInViewport: boolean;
    position: string;
    zIndex: string;
  };
  relationships: {
    parent?: string;
    children: Array<{ tagName: string; id?: string; className?: string }>;
    siblings: number;
    descendants: number;
  };
  interactivity: {
    isClickable: boolean;
    isEditable: boolean;
    isFocusable: boolean;
    isDraggable: boolean;
    hasEventListeners: string[];
  };
  accessibility: {
    role?: string;
    ariaLabel?: string;
    ariaDescribedBy?: string;
    tabIndex?: number;
    accessibleName?: string;
  };
  metadata: {
    selector: string;
    suggestedSelectors: string[];
    analysisTimestamp: string;
  };
}

/**
 * Element analysis algorithms
 */
export class ElementAnalysisEngine {
  private page: Page;
  
  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Comprehensive element analysis
   */
  async analyzeElement(selector: string): Promise<ElementAnalysisResult> {
    const locator = this.page.locator(selector);
    const count = await locator.count();
    
    if (count === 0) {
      throw new Error(`No elements found for selector: ${selector}`);
    }

    // Use first element if multiple matches
    const element = locator.first();
    
    const [
      basic,
      attributes,
      computedStyles,
      positioning,
      relationships,
      interactivity,
      accessibility
    ] = await Promise.all([
      this.analyzeBasicProperties(element),
      this.analyzeAttributes(element),
      this.analyzeComputedStyles(element),
      this.analyzePositioning(element),
      this.analyzeRelationships(element),
      this.analyzeInteractivity(element),
      this.analyzeAccessibility(element)
    ]);

    const suggestedSelectors = await this.generateSuggestedSelectors(element);

    return {
      basic,
      attributes,
      computedStyles,
      positioning,
      relationships,
      interactivity,
      accessibility,
      metadata: {
        selector,
        suggestedSelectors,
        analysisTimestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Analyze basic element properties
   */
  private async analyzeBasicProperties(element: Locator): Promise<ElementAnalysisResult['basic']> {
    return await element.evaluate((el) => {
      return {
        tagName: el.tagName.toLowerCase(),
        id: el.id || undefined,
        className: el.className || undefined,
        textContent: el.textContent?.trim() || undefined,
        innerHTML: el.innerHTML.length > 1000 ? 
          el.innerHTML.substring(0, 1000) + '...' : el.innerHTML,
        outerHTML: el.outerHTML.length > 1000 ? 
          el.outerHTML.substring(0, 1000) + '...' : el.outerHTML
      };
    });
  }

  /**
   * Analyze all element attributes
   */
  private async analyzeAttributes(element: Locator): Promise<Record<string, string>> {
    return await element.evaluate((el) => {
      const attrs: Record<string, string> = {};
      for (let i = 0; i < el.attributes.length; i++) {
        const attr = el.attributes[i];
        attrs[attr.name] = attr.value;
      }
      return attrs;
    });
  }

  /**
   * Analyze computed styles
   */
  private async analyzeComputedStyles(element: Locator): Promise<Record<string, string>> {
    const importantStyles = [
      'display', 'visibility', 'opacity', 'position', 'z-index',
      'width', 'height', 'margin', 'padding', 'border',
      'background-color', 'color', 'font-family', 'font-size',
      'cursor', 'pointer-events', 'overflow', 'transform'
    ];

    return await element.evaluate((el, styles) => {
      const computed = window.getComputedStyle(el);
      const result: Record<string, string> = {};
      
      styles.forEach(style => {
        result[style] = computed.getPropertyValue(style);
      });
      
      return result;
    }, importantStyles);
  }

  /**
   * Analyze element positioning and visibility
   */
  private async analyzePositioning(element: Locator): Promise<ElementAnalysisResult['positioning']> {
    const boundingBox = await element.boundingBox().catch(() => null);
    const isVisible = await element.isVisible().catch(() => false);
    
    const positioning = await element.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      
      return {
        position: computed.position,
        zIndex: computed.zIndex,
        isInViewport: rect.top >= 0 && 
                     rect.left >= 0 && 
                     rect.bottom <= window.innerHeight && 
                     rect.right <= window.innerWidth
      };
    });

    return {
      boundingBox,
      isVisible,
      isInViewport: positioning.isInViewport,
      position: positioning.position,
      zIndex: positioning.zIndex
    };
  }

  /**
   * Analyze element relationships
   */
  private async analyzeRelationships(element: Locator): Promise<ElementAnalysisResult['relationships']> {
    return await element.evaluate((el) => {
      const parent = el.parentElement;
      const children = Array.from(el.children).map(child => ({
        tagName: child.tagName.toLowerCase(),
        id: child.id || undefined,
        className: child.className || undefined
      }));

      return {
        parent: parent ? `${parent.tagName.toLowerCase()}${parent.id ? '#' + parent.id : ''}${parent.className ? '.' + parent.className.split(' ')[0] : ''}` : undefined,
        children,
        siblings: parent ? parent.children.length - 1 : 0,
        descendants: el.querySelectorAll('*').length
      };
    });
  }

  /**
   * Analyze element interactivity
   */
  private async analyzeInteractivity(element: Locator): Promise<ElementAnalysisResult['interactivity']> {
    return await element.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      const tagName = el.tagName.toLowerCase();
      
      // Check if element is clickable
      const isClickable = el.onclick !== null ||
                         computed.cursor === 'pointer' ||
                         ['button', 'a', 'input', 'select', 'textarea'].includes(tagName) ||
                         el.hasAttribute('role') && ['button', 'link'].includes(el.getAttribute('role')!) ||
                         el.hasAttribute('onclick');

      // Check if element is editable
      const isEditable = ['input', 'textarea', 'select'].includes(tagName) ||
                        el.hasAttribute('contenteditable') ||
                        el.isContentEditable;

      // Check if element is focusable
      const isFocusable = el.tabIndex >= 0 ||
                         ['input', 'button', 'select', 'textarea', 'a'].includes(tagName) ||
                         el.hasAttribute('tabindex');

      // Check if element is draggable
      const isDraggable = el.draggable ||
                         el.hasAttribute('draggable');

      // Detect event listeners (simplified)
      const hasEventListeners: string[] = [];
      const eventProps = ['onclick', 'onmousedown', 'onmouseup', 'onkeydown', 'onkeyup', 'onchange', 'oninput', 'onfocus', 'onblur'];
      eventProps.forEach(prop => {
        if ((el as any)[prop]) {
          hasEventListeners.push(prop.substring(2)); // Remove 'on' prefix
        }
      });

      return {
        isClickable,
        isEditable,
        isFocusable,
        isDraggable,
        hasEventListeners
      };
    });
  }

  /**
   * Analyze accessibility properties
   */
  private async analyzeAccessibility(element: Locator): Promise<ElementAnalysisResult['accessibility']> {
    return await element.evaluate((el) => {
      const getAccessibleName = (element: Element): string => {
        // Simplified accessible name calculation
        const ariaLabel = element.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel;

        const ariaLabelledBy = element.getAttribute('aria-labelledby');
        if (ariaLabelledBy) {
          const labelElement = document.getElementById(ariaLabelledBy);
          if (labelElement) return labelElement.textContent?.trim() || '';
        }

        // For form elements, check associated label
        if (element instanceof HTMLInputElement || 
            element instanceof HTMLSelectElement || 
            element instanceof HTMLTextAreaElement) {
          const labels = (element as any).labels;
          if (labels && labels.length > 0) {
            return labels[0].textContent?.trim() || '';
          }
        }

        return element.textContent?.trim() || '';
      };

      return {
        role: el.getAttribute('role') || undefined,
        ariaLabel: el.getAttribute('aria-label') || undefined,
        ariaDescribedBy: el.getAttribute('aria-describedby') || undefined,
        tabIndex: el.tabIndex !== -1 ? el.tabIndex : undefined,
        accessibleName: getAccessibleName(el) || undefined
      };
    });
  }

  /**
   * Generate alternative selector suggestions
   */
  private async generateSuggestedSelectors(element: Locator): Promise<string[]> {
    return await element.evaluate((el) => {
      const selectors: string[] = [];
      
      // ID selector (most specific)
      if (el.id) {
        selectors.push(`#${el.id}`);
      }
      
      // Test ID selectors
      const testAttributes = ['data-testid', 'data-test', 'data-cy', 'data-qa'];
      for (const attr of testAttributes) {
        const value = el.getAttribute(attr);
        if (value) {
          selectors.push(`[${attr}="${value}"]`);
        }
      }
      
      // Class selectors
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.split(' ').filter(c => c.length > 0);
        if (classes.length > 0) {
          selectors.push(`.${classes[0]}`);
          if (classes.length > 1) {
            selectors.push(`.${classes.join('.')}`);
          }
        }
      }
      
      // Attribute selectors
      const commonAttributes = ['name', 'type', 'value', 'placeholder', 'title'];
      for (const attr of commonAttributes) {
        const value = el.getAttribute(attr);
        if (value) {
          selectors.push(`[${attr}="${value}"]`);
        }
      }
      
      // Tag with attributes
      const tagName = el.tagName.toLowerCase();
      if (el.type) {
        selectors.push(`${tagName}[type="${el.getAttribute('type')}"]`);
      }
      
      // ARIA role selector
      const role = el.getAttribute('role');
      if (role) {
        selectors.push(`[role="${role}"]`);
      }
      
      // Text-based selector (if element has unique text)
      const text = el.textContent?.trim();
      if (text && text.length < 50 && text.length > 0) {
        // Only suggest text selector if text is reasonably unique
        selectors.push(`text="${text}"`);
      }
      
      return selectors;
    });
  }

  /**
   * Compare multiple elements
   */
  async compareElements(selectors: string[]): Promise<{
    similarities: string[];
    differences: Array<{
      selector: string;
      uniqueProperties: Record<string, any>;
    }>;
    recommendations: string[];
  }> {
    const analyses = await Promise.all(
      selectors.map(selector => this.analyzeElement(selector))
    );

    const similarities: string[] = [];
    const differences: Array<{ selector: string; uniqueProperties: Record<string, any> }> = [];
    const recommendations: string[] = [];

    // Find common properties
    if (analyses.length > 1) {
      const firstElement = analyses[0];
      const commonTagName = analyses.every(a => a.basic.tagName === firstElement.basic.tagName);
      if (commonTagName) {
        similarities.push(`All elements are ${firstElement.basic.tagName} tags`);
      }

      const commonRole = analyses.every(a => a.accessibility.role === firstElement.accessibility.role);
      if (commonRole && firstElement.accessibility.role) {
        similarities.push(`All elements have role: ${firstElement.accessibility.role}`);
      }
    }

    // Find unique properties for each element
    analyses.forEach((analysis, index) => {
      const uniqueProps: Record<string, any> = {};
      
      if (analysis.basic.id) uniqueProps.id = analysis.basic.id;
      if (analysis.basic.className) uniqueProps.className = analysis.basic.className;
      if (analysis.positioning.position !== 'static') uniqueProps.position = analysis.positioning.position;
      
      differences.push({
        selector: selectors[index],
        uniqueProperties: uniqueProps
      });
    });

    // Generate recommendations
    const hasIds = analyses.some(a => a.basic.id);
    const hasTestIds = analyses.some(a => Object.keys(a.attributes).some(attr => attr.startsWith('data-test')));
    
    if (!hasTestIds) {
      recommendations.push('Consider adding data-testid attributes for more stable selectors');
    }
    
    if (!hasIds) {
      recommendations.push('Consider adding unique ID attributes where appropriate');
    }

    const hasAriaLabels = analyses.some(a => a.accessibility.ariaLabel);
    if (!hasAriaLabels) {
      recommendations.push('Consider adding aria-label attributes for better accessibility');
    }

    return { similarities, differences, recommendations };
  }
}

/**
 * Element analysis tools
 */
export function createElementAnalysisTools(playwrightService: PlaywrightService): MCPTool[] {
  return [
    // 1. Comprehensive Element Analysis
    {
      name: 'element_analyze_comprehensive',
      description: 'Perform comprehensive analysis of an element including structure, styles, accessibility, and interactivity.',
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
            description: 'CSS selector for the element to analyze'
          },
          includeComputedStyles: {
            type: 'boolean',
            default: true,
            description: 'Whether to include computed styles in analysis'
          },
          includeChildren: {
            type: 'boolean',
            default: true,
            description: 'Whether to include children information'
          }
        },
        required: ['pageId', 'selector'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_analyze_comprehensive', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const analyzer = new ElementAnalysisEngine(page);

        const analysis = await analyzer.analyzeElement(args.selector);

        // Filter out computed styles if not requested
        if (!args.includeComputedStyles) {
          delete (analysis as any).computedStyles;
        }

        // Filter out children if not requested
        if (!args.includeChildren) {
          analysis.relationships.children = [];
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify(analysis, null, 2)
          }]
        };
      }
    },

    // 2. Element Structure Inspector
    {
      name: 'element_inspect_structure',
      description: 'Inspect the DOM structure around an element.',
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
          depth: {
            type: 'number',
            minimum: 1,
            maximum: 5,
            default: 2,
            description: 'Depth of structure to inspect (levels up and down)'
          },
          includeAttributes: {
            type: 'boolean',
            default: true,
            description: 'Whether to include element attributes'
          }
        },
        required: ['pageId', 'selector'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_inspect_structure', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);

        const structure = await locator.evaluate((el, { depth, includeAttributes }) => {
          const getElementInfo = (element: Element): any => {
            const info: any = {
              tagName: element.tagName.toLowerCase(),
              textContent: element.textContent?.trim().substring(0, 100) || undefined
            };

            if (includeAttributes && element.attributes.length > 0) {
              info.attributes = {};
              for (let i = 0; i < element.attributes.length; i++) {
                const attr = element.attributes[i];
                info.attributes[attr.name] = attr.value;
              }
            }

            return info;
          };

          const buildStructure = (element: Element, currentDepth: number): any => {
            const info = getElementInfo(element);
            
            if (currentDepth > 0) {
              info.children = Array.from(element.children).map(child => 
                buildStructure(child, currentDepth - 1)
              );
            } else if (element.children.length > 0) {
              info.childrenCount = element.children.length;
            }

            return info;
          };

          // Build structure going up
          const ancestors: any[] = [];
          let current = el.parentElement;
          let ancestorDepth = depth;
          
          while (current && ancestorDepth > 0) {
            ancestors.unshift(getElementInfo(current));
            current = current.parentElement;
            ancestorDepth--;
          }

          // Build structure for current element and descendants
          const elementStructure = buildStructure(el, depth);

          return {
            ancestors,
            element: elementStructure,
            selector: args.selector,
            depth
          };
        }, { depth: args.depth, includeAttributes: args.includeAttributes });

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify(structure, null, 2)
          }]
        };
      }
    },

    // 3. Element Comparison Tool
    {
      name: 'element_compare_multiple',
      description: 'Compare multiple elements to find similarities and differences.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page session ID'
          },
          selectors: {
            type: 'array',
            items: {
              type: 'string',
              minLength: 1
            },
            minItems: 2,
            maxItems: 10,
            description: 'Array of CSS selectors for elements to compare'
          }
        },
        required: ['pageId', 'selectors'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_compare_multiple', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const analyzer = new ElementAnalysisEngine(page);

        const comparison = await analyzer.compareElements(args.selectors);

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify(comparison, null, 2)
          }]
        };
      }
    },

    // 4. Smart Selector Generator
    {
      name: 'element_generate_selectors',
      description: 'Generate optimal selectors for an element based on its properties.',
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
            description: 'Current CSS selector for the element'
          },
          preferences: {
            type: 'object',
            properties: {
              preferTestIds: { type: 'boolean', default: true },
              preferIds: { type: 'boolean', default: true },
              preferShort: { type: 'boolean', default: true },
              includeXPath: { type: 'boolean', default: false }
            },
            description: 'Preferences for selector generation'
          }
        },
        required: ['pageId', 'selector'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_generate_selectors', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);

        const selectorSuggestions = await locator.evaluate((el, preferences) => {
          const suggestions: Array<{
            selector: string;
            type: string;
            stability: number;
            specificity: number;
            description: string;
          }> = [];

          // ID selector
          if (el.id && preferences.preferIds) {
            suggestions.push({
              selector: `#${el.id}`,
              type: 'id',
              stability: 95,
              specificity: 100,
              description: 'Highly specific and stable ID selector'
            });
          }

          // Test ID selectors
          if (preferences.preferTestIds) {
            const testAttrs = ['data-testid', 'data-test', 'data-cy', 'data-qa'];
            for (const attr of testAttrs) {
              const value = el.getAttribute(attr);
              if (value) {
                suggestions.push({
                  selector: `[${attr}="${value}"]`,
                  type: 'test-attribute',
                  stability: 90,
                  specificity: 90,
                  description: `Test-specific attribute selector (${attr})`
                });
              }
            }
          }

          // Class selectors
          if (el.className && typeof el.className === 'string') {
            const classes = el.className.split(' ').filter(c => c.length > 0);
            if (classes.length > 0) {
              const firstClass = classes[0];
              suggestions.push({
                selector: `.${firstClass}`,
                type: 'class',
                stability: 60,
                specificity: 50,
                description: 'Primary class selector'
              });

              if (classes.length > 1) {
                suggestions.push({
                  selector: `.${classes.join('.')}`,
                  type: 'multiple-classes',
                  stability: 70,
                  specificity: 70,
                  description: 'Multiple class selector'
                });
              }
            }
          }

          // Attribute selectors
          const stableAttrs = ['name', 'type', 'role', 'aria-label'];
          for (const attr of stableAttrs) {
            const value = el.getAttribute(attr);
            if (value) {
              suggestions.push({
                selector: `[${attr}="${value}"]`,
                type: 'attribute',
                stability: 80,
                specificity: 75,
                description: `${attr} attribute selector`
              });
            }
          }

          // Tag with specific attributes
          const tagName = el.tagName.toLowerCase();
          if (el.type) {
            suggestions.push({
              selector: `${tagName}[type="${el.getAttribute('type')}"]`,
              type: 'tag-attribute',
              stability: 75,
              specificity: 60,
              description: 'Tag with type attribute'
            });
          }

          // Sort by stability and specificity if preferShort is true
          if (preferences.preferShort) {
            suggestions.sort((a, b) => {
              if (a.selector.length !== b.selector.length) {
                return a.selector.length - b.selector.length;
              }
              return (b.stability + b.specificity) - (a.stability + a.specificity);
            });
          } else {
            suggestions.sort((a, b) => (b.stability + b.specificity) - (a.stability + a.specificity));
          }

          return suggestions;
        }, args.preferences || {});

        // Add XPath selectors if requested
        if (args.preferences?.includeXPath) {
          const xpathSuggestions = await locator.evaluate((el) => {
            const getXPath = (element: Element): string => {
              if (element.id) {
                return `//*[@id="${element.id}"]`;
              }
              
              const parts: string[] = [];
              let current: Element | null = element;
              
              while (current && current !== document.body) {
                let selector = current.tagName.toLowerCase();
                
                if (current.className) {
                  const classes = current.className.split(' ').filter(c => c.length > 0);
                  if (classes.length > 0) {
                    selector += `[@class="${classes.join(' ')}"]`;
                  }
                } else if (current.previousElementSibling || current.nextElementSibling) {
                  const siblings = Array.from(current.parentElement?.children || []);
                  const index = siblings.indexOf(current) + 1;
                  selector += `[${index}]`;
                }
                
                parts.unshift(selector);
                current = current.parentElement;
              }
              
              return '//' + parts.join('/');
            };

            return [{
              selector: getXPath(el),
              type: 'xpath',
              stability: 50,
              specificity: 60,
              description: 'XPath selector'
            }];
          });

          selectorSuggestions.push(...xpathSuggestions);
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              originalSelector: args.selector,
              suggestions: selectorSuggestions,
              preferences: args.preferences,
              totalSuggestions: selectorSuggestions.length
            }, null, 2)
          }]
        };
      }
    }
  ];
}
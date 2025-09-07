/**
 * Element Analysis and Extraction Tools for Playwright MCP Server
 * Implements comprehensive content extraction, accessibility analysis, and element structure analysis
 */

import { Page, Locator } from 'playwright';
import { MCPTool, MCPToolResult } from '../../../types.js';
import { PlaywrightService } from '../../../services/playwright.js';
import { validateElementSchema } from '../validation/element-schemas.js';

/**
 * Element Analysis and Extraction Tools (5 tools)
 */
export function createElementAnalysisTools(playwrightService: PlaywrightService): MCPTool[] {
  return [
    // 1. Extract All Links
    {
      name: 'element_extract_links',
      description: 'Extract all links from an element or the entire page with metadata.',
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
            default: 'body',
            description: 'CSS selector for the container element (default: body for entire page)'
          },
          includeInternal: {
            type: 'boolean',
            default: true,
            description: 'Whether to include internal links (same domain)'
          },
          includeExternal: {
            type: 'boolean',
            default: true,
            description: 'Whether to include external links (different domain)'
          },
          includeImages: {
            type: 'boolean',
            default: false,
            description: 'Whether to include image links'
          },
          includeAnchors: {
            type: 'boolean',
            default: false,
            description: 'Whether to include anchor links (hash fragments)'
          },
          checkAccessibility: {
            type: 'boolean',
            default: true,
            description: 'Whether to check link accessibility properties'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 120000,
            default: 30000,
            description: 'Wait timeout for element'
          }
        },
        required: ['pageId'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_extract_links', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        
        const currentUrl = new URL(page.url());
        const currentDomain = currentUrl.origin;
        
        const links = await page.evaluate((sel, options, currentDomain) => {
          const container = document.querySelector(sel) || document.body;
          const linkElements = container.querySelectorAll('a[href]');
          const results = [];
          
          linkElements.forEach((link, index) => {
            const href = link.getAttribute('href');
            if (!href) return;
            
            const absoluteUrl = new URL(href, window.location.href);
            const isInternal = absoluteUrl.origin === currentDomain;
            const isExternal = !isInternal && !absoluteUrl.protocol.startsWith('javascript:');
            const isAnchor = href.startsWith('#');
            const isImage = link.querySelector('img') !== null;
            
            // Filter based on options
            if (!options.includeInternal && isInternal) return;
            if (!options.includeExternal && isExternal) return;
            if (!options.includeAnchors && isAnchor) return;
            if (!options.includeImages && isImage) return;
            
            const linkInfo: any = {
              index,
              href,
              absoluteUrl: absoluteUrl.href,
              text: link.textContent?.trim() || '',
              title: link.getAttribute('title') || '',
              target: link.getAttribute('target') || '',
              rel: link.getAttribute('rel') || '',
              type: isInternal ? 'internal' : (isExternal ? 'external' : 'anchor'),
              isImage,
              tagName: link.tagName.toLowerCase()
            };
            
            // Check accessibility if requested
            if (options.checkAccessibility) {
              linkInfo.accessibility = {
                hasText: linkInfo.text.length > 0,
                hasTitle: linkInfo.title.length > 0,
                hasAriaLabel: link.getAttribute('aria-label') || '',
                hasAriaLabelledBy: link.getAttribute('aria-labelledby') || '',
                hasAriaDescribedBy: link.getAttribute('aria-describedby') || '',
                tabIndex: link.getAttribute('tabindex'),
                role: link.getAttribute('role') || 'link'
              };
              
              // Calculate accessibility score
              let score = 0;
              if (linkInfo.accessibility.hasText) score += 40;
              if (linkInfo.accessibility.hasTitle) score += 20;
              if (linkInfo.accessibility.hasAriaLabel) score += 30;
              if (linkInfo.accessibility.hasAriaLabelledBy) score += 30;
              if (!linkInfo.target || linkInfo.target !== '_blank') score += 10;
              
              linkInfo.accessibility.score = Math.min(score, 100);
              linkInfo.accessibility.rating = score >= 80 ? 'excellent' : 
                                             score >= 60 ? 'good' : 
                                             score >= 40 ? 'fair' : 'poor';
            }
            
            // Extract additional metadata
            linkInfo.boundingBox = {
              x: link.getBoundingClientRect().x,
              y: link.getBoundingClientRect().y,
              width: link.getBoundingClientRect().width,
              height: link.getBoundingClientRect().height
            };
            
            linkInfo.isVisible = link.offsetParent !== null;
            linkInfo.computedStyle = {
              display: window.getComputedStyle(link).display,
              visibility: window.getComputedStyle(link).visibility,
              color: window.getComputedStyle(link).color,
              textDecoration: window.getComputedStyle(link).textDecoration
            };
            
            results.push(linkInfo);
          });
          
          return results;
        }, args.selector, {
          includeInternal: args.includeInternal,
          includeExternal: args.includeExternal,
          includeImages: args.includeImages,
          includeAnchors: args.includeAnchors,
          checkAccessibility: args.checkAccessibility
        }, currentDomain);
        
        // Group and analyze links
        const analysis = {
          total: links.length,
          internal: links.filter(l => l.type === 'internal').length,
          external: links.filter(l => l.type === 'external').length,
          anchors: links.filter(l => l.type === 'anchor').length,
          images: links.filter(l => l.isImage).length,
          visible: links.filter(l => l.isVisible).length,
          hidden: links.filter(l => !l.isVisible).length
        };
        
        if (args.checkAccessibility) {
          const scores = links.map(l => l.accessibility?.score || 0);
          analysis.accessibility = {
            averageScore: scores.reduce((a, b) => a + b, 0) / scores.length || 0,
            excellent: links.filter(l => l.accessibility?.rating === 'excellent').length,
            good: links.filter(l => l.accessibility?.rating === 'good').length,
            fair: links.filter(l => l.accessibility?.rating === 'fair').length,
            poor: links.filter(l => l.accessibility?.rating === 'poor').length
          };
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              currentUrl: page.url(),
              currentDomain,
              analysis,
              links,
              extractionOptions: {
                includeInternal: args.includeInternal,
                includeExternal: args.includeExternal,
                includeImages: args.includeImages,
                includeAnchors: args.includeAnchors,
                checkAccessibility: args.checkAccessibility
              },
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 2. Extract Images and Metadata
    {
      name: 'element_extract_images',
      description: 'Extract all images from an element with comprehensive metadata.',
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
            default: 'body',
            description: 'CSS selector for the container element (default: body for entire page)'
          },
          includeBackgroundImages: {
            type: 'boolean',
            default: true,
            description: 'Whether to include CSS background images'
          },
          checkLoading: {
            type: 'boolean',
            default: true,
            description: 'Whether to check if images are loaded'
          },
          analyzeAccessibility: {
            type: 'boolean',
            default: true,
            description: 'Whether to analyze image accessibility'
          },
          includeDimensions: {
            type: 'boolean',
            default: true,
            description: 'Whether to include image dimensions'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 120000,
            default: 30000,
            description: 'Wait timeout for element'
          }
        },
        required: ['pageId'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_extract_images', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        
        const images = await page.evaluate((sel, options) => {
          const container = document.querySelector(sel) || document.body;
          const results = [];
          
          // Extract IMG elements
          const imgElements = container.querySelectorAll('img');
          imgElements.forEach((img, index) => {
            const imageInfo: any = {
              index,
              type: 'img',
              src: img.src,
              alt: img.alt || '',
              title: img.title || '',
              loading: img.getAttribute('loading') || 'auto',
              decoding: img.getAttribute('decoding') || 'auto',
              crossOrigin: img.crossOrigin || '',
              referrerPolicy: img.referrerPolicy || '',
              sizes: img.getAttribute('sizes') || '',
              srcset: img.getAttribute('srcset') || '',
              width: img.width,
              height: img.height,
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
              complete: img.complete,
              tagName: img.tagName.toLowerCase()
            };
            
            if (options.checkLoading) {
              imageInfo.loadingState = {
                complete: img.complete,
                naturalWidth: img.naturalWidth,
                naturalHeight: img.naturalHeight,
                hasError: img.naturalWidth === 0 && img.naturalHeight === 0 && img.complete
              };
            }
            
            if (options.analyzeAccessibility) {
              imageInfo.accessibility = {
                hasAlt: imageInfo.alt.length > 0,
                altLength: imageInfo.alt.length,
                hasTitle: imageInfo.title.length > 0,
                isDecorative: imageInfo.alt === '' && img.getAttribute('role') === 'presentation',
                ariaLabel: img.getAttribute('aria-label') || '',
                ariaLabelledBy: img.getAttribute('aria-labelledby') || '',
                ariaDescribedBy: img.getAttribute('aria-describedby') || '',
                role: img.getAttribute('role') || 'img'
              };
              
              // Accessibility score
              let score = 0;
              if (imageInfo.accessibility.hasAlt) score += 50;
              if (imageInfo.accessibility.altLength > 0 && imageInfo.accessibility.altLength <= 125) score += 30;
              if (imageInfo.accessibility.hasTitle) score += 10;
              if (imageInfo.accessibility.ariaLabel) score += 10;
              
              imageInfo.accessibility.score = Math.min(score, 100);
              imageInfo.accessibility.rating = score >= 80 ? 'excellent' : 
                                             score >= 60 ? 'good' : 
                                             score >= 40 ? 'fair' : 'poor';
            }
            
            if (options.includeDimensions) {
              const rect = img.getBoundingClientRect();
              imageInfo.boundingBox = {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              };
              
              imageInfo.dimensions = {
                displayed: { width: rect.width, height: rect.height },
                natural: { width: img.naturalWidth, height: img.naturalHeight },
                aspectRatio: img.naturalWidth / img.naturalHeight,
                isScaled: rect.width !== img.naturalWidth || rect.height !== img.naturalHeight
              };
            }
            
            imageInfo.isVisible = img.offsetParent !== null;
            imageInfo.computedStyle = {
              display: window.getComputedStyle(img).display,
              visibility: window.getComputedStyle(img).visibility,
              opacity: window.getComputedStyle(img).opacity
            };
            
            results.push(imageInfo);
          });
          
          // Extract background images if requested
          if (options.includeBackgroundImages) {
            const elementsWithBg = container.querySelectorAll('*');
            elementsWithBg.forEach((element, index) => {
              const bgImage = window.getComputedStyle(element).backgroundImage;
              if (bgImage && bgImage !== 'none') {
                const urlMatch = bgImage.match(/url\(['"]?(.*?)['"]?\)/);
                if (urlMatch) {
                  const bgInfo: any = {
                    index: imgElements.length + index,
                    type: 'background',
                    src: urlMatch[1],
                    element: element.tagName.toLowerCase(),
                    backgroundSize: window.getComputedStyle(element).backgroundSize,
                    backgroundPosition: window.getComputedStyle(element).backgroundPosition,
                    backgroundRepeat: window.getComputedStyle(element).backgroundRepeat,
                    backgroundAttachment: window.getComputedStyle(element).backgroundAttachment
                  };
                  
                  if (options.includeDimensions) {
                    const rect = element.getBoundingClientRect();
                    bgInfo.boundingBox = {
                      x: rect.x,
                      y: rect.y,
                      width: rect.width,
                      height: rect.height
                    };
                  }
                  
                  bgInfo.isVisible = element.offsetParent !== null;
                  
                  results.push(bgInfo);
                }
              }
            });
          }
          
          return results;
        }, args.selector, {
          includeBackgroundImages: args.includeBackgroundImages,
          checkLoading: args.checkLoading,
          analyzeAccessibility: args.analyzeAccessibility,
          includeDimensions: args.includeDimensions
        });
        
        // Analyze extracted images
        const analysis = {
          total: images.length,
          imgElements: images.filter(i => i.type === 'img').length,
          backgroundImages: images.filter(i => i.type === 'background').length,
          visible: images.filter(i => i.isVisible).length,
          hidden: images.filter(i => !i.isVisible).length
        };
        
        if (args.checkLoading) {
          analysis.loading = {
            complete: images.filter(i => i.loadingState?.complete).length,
            withErrors: images.filter(i => i.loadingState?.hasError).length,
            loading: images.filter(i => !i.loadingState?.complete && !i.loadingState?.hasError).length
          };
        }
        
        if (args.analyzeAccessibility) {
          const scores = images.filter(i => i.accessibility).map(i => i.accessibility.score);
          analysis.accessibility = {
            averageScore: scores.reduce((a, b) => a + b, 0) / scores.length || 0,
            withAlt: images.filter(i => i.accessibility?.hasAlt).length,
            withoutAlt: images.filter(i => i.accessibility && !i.accessibility.hasAlt).length,
            decorative: images.filter(i => i.accessibility?.isDecorative).length,
            excellent: images.filter(i => i.accessibility?.rating === 'excellent').length,
            good: images.filter(i => i.accessibility?.rating === 'good').length,
            fair: images.filter(i => i.accessibility?.rating === 'fair').length,
            poor: images.filter(i => i.accessibility?.rating === 'poor').length
          };
        }

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              analysis,
              images,
              extractionOptions: {
                includeBackgroundImages: args.includeBackgroundImages,
                checkLoading: args.checkLoading,
                analyzeAccessibility: args.analyzeAccessibility,
                includeDimensions: args.includeDimensions
              },
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 3. Extract and Structure Table Data
    {
      name: 'element_extract_tables',
      description: 'Convert HTML tables to structured data with headers, rows, and metadata.',
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
            default: 'body',
            description: 'CSS selector for the container element (default: body for entire page)'
          },
          includeHeaders: {
            type: 'boolean',
            default: true,
            description: 'Whether to identify and include table headers'
          },
          includeFooters: {
            type: 'boolean',
            default: true,
            description: 'Whether to include table footers'
          },
          normalizeText: {
            type: 'boolean',
            default: true,
            description: 'Whether to normalize whitespace in cell text'
          },
          includeEmpty: {
            type: 'boolean',
            default: false,
            description: 'Whether to include empty cells and rows'
          },
          parseNumbers: {
            type: 'boolean',
            default: true,
            description: 'Whether to attempt to parse numeric values'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 120000,
            default: 30000,
            description: 'Wait timeout for element'
          }
        },
        required: ['pageId'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_extract_tables', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        
        const tables = await page.evaluate((sel, options) => {
          const container = document.querySelector(sel) || document.body;
          const tableElements = container.querySelectorAll('table');
          const results = [];
          
          tableElements.forEach((table, tableIndex) => {
            const tableInfo: any = {
              index: tableIndex,
              id: table.id || '',
              className: table.className || '',
              caption: '',
              summary: table.getAttribute('summary') || '',
              headers: [],
              footers: [],
              rows: [],
              metadata: {}
            };
            
            // Extract caption
            const caption = table.querySelector('caption');
            if (caption) {
              tableInfo.caption = options.normalizeText ? 
                caption.textContent?.trim().replace(/\s+/g, ' ') || '' :
                caption.textContent || '';
            }
            
            // Extract headers
            if (options.includeHeaders) {
              const theadRows = table.querySelectorAll('thead tr');
              const headerRows = theadRows.length > 0 ? theadRows : table.querySelectorAll('tr:first-child');
              
              headerRows.forEach((row, rowIndex) => {
                const headerCells = [];
                const cells = row.querySelectorAll('th, td');
                
                cells.forEach((cell, cellIndex) => {
                  const cellText = options.normalizeText ?
                    cell.textContent?.trim().replace(/\s+/g, ' ') || '' :
                    cell.textContent || '';
                  
                  if (!options.includeEmpty && !cellText) return;
                  
                  headerCells.push({
                    index: cellIndex,
                    text: cellText,
                    tag: cell.tagName.toLowerCase(),
                    colspan: parseInt(cell.getAttribute('colspan') || '1'),
                    rowspan: parseInt(cell.getAttribute('rowspan') || '1'),
                    scope: cell.getAttribute('scope') || '',
                    abbr: cell.getAttribute('abbr') || '',
                    id: cell.id || '',
                    headers: cell.getAttribute('headers') || ''
                  });
                });
                
                if (headerCells.length > 0) {
                  tableInfo.headers.push({
                    rowIndex,
                    cells: headerCells
                  });
                }
              });
            }
            
            // Extract footer
            if (options.includeFooters) {
              const tfootRows = table.querySelectorAll('tfoot tr');
              
              tfootRows.forEach((row, rowIndex) => {
                const footerCells = [];
                const cells = row.querySelectorAll('td, th');
                
                cells.forEach((cell, cellIndex) => {
                  const cellText = options.normalizeText ?
                    cell.textContent?.trim().replace(/\s+/g, ' ') || '' :
                    cell.textContent || '';
                  
                  if (!options.includeEmpty && !cellText) return;
                  
                  let value = cellText;
                  if (options.parseNumbers && /^-?\d+\.?\d*$/.test(cellText.trim())) {
                    value = parseFloat(cellText.trim());
                  }
                  
                  footerCells.push({
                    index: cellIndex,
                    text: cellText,
                    value,
                    tag: cell.tagName.toLowerCase(),
                    colspan: parseInt(cell.getAttribute('colspan') || '1'),
                    rowspan: parseInt(cell.getAttribute('rowspan') || '1')
                  });
                });
                
                if (footerCells.length > 0) {
                  tableInfo.footers.push({
                    rowIndex,
                    cells: footerCells
                  });
                }
              });
            }
            
            // Extract body rows
            const tbodyRows = table.querySelectorAll('tbody tr');
            const bodyRows = tbodyRows.length > 0 ? tbodyRows : 
              table.querySelectorAll('tr:not(thead tr):not(tfoot tr)');
            
            bodyRows.forEach((row, rowIndex) => {
              const rowCells = [];
              const cells = row.querySelectorAll('td, th');
              
              cells.forEach((cell, cellIndex) => {
                const cellText = options.normalizeText ?
                  cell.textContent?.trim().replace(/\s+/g, ' ') || '' :
                  cell.textContent || '';
                
                if (!options.includeEmpty && !cellText) return;
                
                let value = cellText;
                if (options.parseNumbers && /^-?\d+\.?\d*$/.test(cellText.trim())) {
                  value = parseFloat(cellText.trim());
                }
                
                rowCells.push({
                  index: cellIndex,
                  text: cellText,
                  value,
                  tag: cell.tagName.toLowerCase(),
                  colspan: parseInt(cell.getAttribute('colspan') || '1'),
                  rowspan: parseInt(cell.getAttribute('rowspan') || '1'),
                  headers: cell.getAttribute('headers') || ''
                });
              });
              
              if (rowCells.length > 0 || options.includeEmpty) {
                tableInfo.rows.push({
                  index: rowIndex,
                  cells: rowCells
                });
              }
            });
            
            // Calculate metadata
            tableInfo.metadata = {
              totalRows: tableInfo.rows.length,
              totalColumns: Math.max(...tableInfo.rows.map(r => r.cells.length), 0),
              hasHeaders: tableInfo.headers.length > 0,
              hasFooters: tableInfo.footers.length > 0,
              hasCaption: tableInfo.caption.length > 0,
              hasSummary: tableInfo.summary.length > 0,
              cellCount: tableInfo.rows.reduce((sum, row) => sum + row.cells.length, 0),
              emptyCells: tableInfo.rows.reduce((sum, row) => 
                sum + row.cells.filter(cell => !cell.text).length, 0)
            };
            
            // Accessibility analysis
            tableInfo.accessibility = {
              hasCaption: tableInfo.caption.length > 0,
              hasSummary: tableInfo.summary.length > 0,
              hasProperHeaders: tableInfo.headers.some(h => 
                h.cells.some(c => c.scope || c.id)
              ),
              headerCellCount: tableInfo.headers.reduce((sum, h) => sum + h.cells.length, 0),
              dataCellsWithHeaders: tableInfo.rows.reduce((sum, row) => 
                sum + row.cells.filter(cell => cell.headers).length, 0)
            };
            
            let accessibilityScore = 0;
            if (tableInfo.accessibility.hasCaption) accessibilityScore += 20;
            if (tableInfo.accessibility.hasSummary) accessibilityScore += 15;
            if (tableInfo.accessibility.hasProperHeaders) accessibilityScore += 35;
            if (tableInfo.accessibility.dataCellsWithHeaders > 0) accessibilityScore += 30;
            
            tableInfo.accessibility.score = accessibilityScore;
            tableInfo.accessibility.rating = accessibilityScore >= 80 ? 'excellent' : 
                                           accessibilityScore >= 60 ? 'good' : 
                                           accessibilityScore >= 40 ? 'fair' : 'poor';
            
            results.push(tableInfo);
          });
          
          return results;
        }, args.selector, {
          includeHeaders: args.includeHeaders,
          includeFooters: args.includeFooters,
          normalizeText: args.normalizeText,
          includeEmpty: args.includeEmpty,
          parseNumbers: args.parseNumbers
        });
        
        // Overall analysis
        const analysis = {
          totalTables: tables.length,
          withHeaders: tables.filter(t => t.metadata.hasHeaders).length,
          withFooters: tables.filter(t => t.metadata.hasFooters).length,
          withCaptions: tables.filter(t => t.metadata.hasCaption).length,
          totalRows: tables.reduce((sum, t) => sum + t.metadata.totalRows, 0),
          totalCells: tables.reduce((sum, t) => sum + t.metadata.cellCount, 0),
          accessibility: {
            averageScore: tables.reduce((sum, t) => sum + t.accessibility.score, 0) / tables.length || 0,
            excellent: tables.filter(t => t.accessibility.rating === 'excellent').length,
            good: tables.filter(t => t.accessibility.rating === 'good').length,
            fair: tables.filter(t => t.accessibility.rating === 'fair').length,
            poor: tables.filter(t => t.accessibility.rating === 'poor').length
          }
        };

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              analysis,
              tables,
              extractionOptions: {
                includeHeaders: args.includeHeaders,
                includeFooters: args.includeFooters,
                normalizeText: args.normalizeText,
                includeEmpty: args.includeEmpty,
                parseNumbers: args.parseNumbers
              },
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 4. Analyze Element Accessibility
    {
      name: 'element_analyze_accessibility',
      description: 'Comprehensive accessibility analysis of an element and its children.',
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
          includeChildren: {
            type: 'boolean',
            default: true,
            description: 'Whether to analyze child elements'
          },
          checkContrast: {
            type: 'boolean',
            default: true,
            description: 'Whether to check color contrast (approximate)'
          },
          checkKeyboard: {
            type: 'boolean',
            default: true,
            description: 'Whether to check keyboard accessibility'
          },
          checkSemantics: {
            type: 'boolean',
            default: true,
            description: 'Whether to check semantic structure'
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 120000,
            default: 30000,
            description: 'Wait timeout for element'
          }
        },
        required: ['pageId', 'selector'],
        additionalProperties: false
      },
      handler: async (args: any): Promise<MCPToolResult> => {
        const validation = validateElementSchema('element_analyze_accessibility', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        
        const accessibilityReport = await page.evaluate((sel, options) => {
          const element = document.querySelector(sel);
          if (!element) throw new Error('Element not found');
          
          const results = {
            element: {},
            children: [],
            summary: {
              totalElements: 0,
              issues: [],
              warnings: [],
              passed: []
            }
          };
          
          // Helper function to analyze a single element
          const analyzeElement = (el: Element, isRoot = false) => {
            const analysis: any = {
              tagName: el.tagName.toLowerCase(),
              id: el.id || '',
              className: el.className || '',
              role: el.getAttribute('role') || '',
              ariaAttributes: {},
              semantics: {},
              keyboard: {},
              contrast: {},
              issues: [],
              warnings: [],
              passed: []
            };
            
            // Extract all ARIA attributes
            for (const attr of el.attributes) {
              if (attr.name.startsWith('aria-')) {
                analysis.ariaAttributes[attr.name] = attr.value;
              }
            }
            
            // Semantic analysis
            if (options.checkSemantics) {
              const tagName = analysis.tagName;
              
              // Check for proper heading hierarchy
              if (/^h[1-6]$/.test(tagName)) {
                const level = parseInt(tagName[1]);
                analysis.semantics.headingLevel = level;
                analysis.semantics.hasText = el.textContent?.trim().length > 0;
                
                if (analysis.semantics.hasText) {
                  results.summary.passed.push(`Heading ${tagName} has text content`);
                } else {
                  results.summary.issues.push(`Heading ${tagName} is empty`);
                }
              }
              
              // Check images
              if (tagName === 'img') {
                const alt = el.getAttribute('alt');
                const src = el.getAttribute('src');
                
                analysis.semantics.hasAlt = alt !== null;
                analysis.semantics.altText = alt || '';
                analysis.semantics.isDecorative = alt === '';
                
                if (src && analysis.semantics.hasAlt && alt.length > 0) {
                  results.summary.passed.push('Image has meaningful alt text');
                } else if (src && !analysis.semantics.hasAlt) {
                  results.summary.issues.push('Image missing alt attribute');
                } else if (src && alt === '') {
                  results.summary.passed.push('Decorative image has empty alt');
                }
              }
              
              // Check links
              if (tagName === 'a') {
                const href = el.getAttribute('href');
                const text = el.textContent?.trim();
                
                analysis.semantics.hasHref = !!href;
                analysis.semantics.linkText = text || '';
                analysis.semantics.hasText = text && text.length > 0;
                
                if (href && analysis.semantics.hasText) {
                  results.summary.passed.push('Link has descriptive text');
                } else if (href && !analysis.semantics.hasText) {
                  results.summary.issues.push('Link has no descriptive text');
                }
              }
              
              // Check form inputs
              if (['input', 'select', 'textarea'].includes(tagName)) {
                const label = document.querySelector(`label[for="${el.id}"]`) || 
                              el.closest('label');
                const ariaLabel = el.getAttribute('aria-label');
                const ariaLabelledBy = el.getAttribute('aria-labelledby');
                
                analysis.semantics.hasLabel = !!label;
                analysis.semantics.hasAriaLabel = !!ariaLabel;
                analysis.semantics.hasAriaLabelledBy = !!ariaLabelledBy;
                analysis.semantics.isRequired = el.hasAttribute('required');
                
                const hasLabeling = analysis.semantics.hasLabel || 
                                  analysis.semantics.hasAriaLabel || 
                                  analysis.semantics.hasAriaLabelledBy;
                
                if (hasLabeling) {
                  results.summary.passed.push('Form control has proper labeling');
                } else {
                  results.summary.issues.push('Form control lacks proper labeling');
                }
              }
            }
            
            // Keyboard accessibility
            if (options.checkKeyboard) {
              const tabIndex = el.getAttribute('tabindex');
              const isInteractive = ['a', 'button', 'input', 'select', 'textarea'].includes(analysis.tagName) ||
                                   el.getAttribute('role') === 'button' ||
                                   el.getAttribute('role') === 'link' ||
                                   el.hasAttribute('onclick');
              
              analysis.keyboard.tabIndex = tabIndex ? parseInt(tabIndex) : null;
              analysis.keyboard.isInteractive = isInteractive;
              analysis.keyboard.isFocusable = tabIndex !== '-1' && 
                                            (isInteractive || tabIndex === '0' || parseInt(tabIndex) >= 0);
              
              if (isInteractive && !analysis.keyboard.isFocusable) {
                results.summary.issues.push('Interactive element is not keyboard focusable');
              } else if (isInteractive && analysis.keyboard.isFocusable) {
                results.summary.passed.push('Interactive element is keyboard accessible');
              }
              
              if (tabIndex && parseInt(tabIndex) > 0) {
                results.summary.warnings.push('Positive tabindex detected - may disrupt tab order');
              }
            }
            
            // Color contrast (basic approximation)
            if (options.checkContrast) {
              const styles = window.getComputedStyle(el);
              const color = styles.color;
              const backgroundColor = styles.backgroundColor;
              
              analysis.contrast.textColor = color;
              analysis.contrast.backgroundColor = backgroundColor;
              
              // Simple contrast check (not WCAG accurate, just informational)
              if (color !== 'rgba(0, 0, 0, 0)' && backgroundColor !== 'rgba(0, 0, 0, 0)') {
                analysis.contrast.hasContrastInfo = true;
                results.summary.passed.push('Element has color information available');
              }
            }
            
            // ARIA validation
            if (analysis.ariaAttributes) {
              const ariaKeys = Object.keys(analysis.ariaAttributes);
              
              // Check for common ARIA issues
              if (ariaKeys.includes('aria-labelledby')) {
                const labelledById = analysis.ariaAttributes['aria-labelledby'];
                const referencedElement = document.getElementById(labelledById);
                
                if (referencedElement) {
                  results.summary.passed.push('aria-labelledby references valid element');
                } else {
                  results.summary.issues.push('aria-labelledby references non-existent element');
                }
              }
              
              if (ariaKeys.includes('aria-describedby')) {
                const describedById = analysis.ariaAttributes['aria-describedby'];
                const referencedElement = document.getElementById(describedById);
                
                if (referencedElement) {
                  results.summary.passed.push('aria-describedby references valid element');
                } else {
                  results.summary.issues.push('aria-describedby references non-existent element');
                }
              }
              
              // Check for conflicting ARIA
              if (ariaKeys.includes('aria-hidden') && analysis.keyboard.isFocusable) {
                if (analysis.ariaAttributes['aria-hidden'] === 'true') {
                  results.summary.issues.push('Focusable element has aria-hidden="true"');
                }
              }
            }
            
            return analysis;
          };
          
          // Analyze the main element
          results.element = analyzeElement(element, true);
          results.summary.totalElements = 1;
          
          // Analyze children if requested
          if (options.includeChildren) {
            const childElements = element.querySelectorAll('*');
            childElements.forEach(child => {
              const childAnalysis = analyzeElement(child);
              results.children.push(childAnalysis);
              results.summary.totalElements++;
            });
          }
          
          // Calculate summary scores
          const totalIssues = results.summary.issues.length;
          const totalWarnings = results.summary.warnings.length;
          const totalPassed = results.summary.passed.length;
          const totalChecks = totalIssues + totalWarnings + totalPassed;
          
          results.summary.score = totalChecks > 0 ? 
            Math.round((totalPassed / totalChecks) * 100) : 100;
          
          results.summary.rating = results.summary.score >= 90 ? 'excellent' :
                                 results.summary.score >= 75 ? 'good' :
                                 results.summary.score >= 50 ? 'fair' : 'poor';
          
          return results;
        }, args.selector, {
          includeChildren: args.includeChildren,
          checkContrast: args.checkContrast,
          checkKeyboard: args.checkKeyboard,
          checkSemantics: args.checkSemantics
        });

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              accessibilityReport,
              analysisOptions: {
                includeChildren: args.includeChildren,
                checkContrast: args.checkContrast,
                checkKeyboard: args.checkKeyboard,
                checkSemantics: args.checkSemantics
              },
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    },

    // 5. Get Direct Child Elements
    {
      name: 'element_get_children',
      description: 'Get information about direct child elements with filtering and analysis.',
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
            description: 'CSS selector for the parent element'
          },
          filterBy: {
            type: 'object',
            properties: {
              tagName: { type: 'string' },
              className: { type: 'string' },
              hasId: { type: 'boolean' },
              isVisible: { type: 'boolean' },
              hasText: { type: 'boolean' },
              hasChildren: { type: 'boolean' }
            },
            description: 'Filters to apply to child elements'
          },
          includeMetadata: {
            type: 'boolean',
            default: true,
            description: 'Whether to include detailed metadata for each child'
          },
          includeText: {
            type: 'boolean',
            default: true,
            description: 'Whether to include text content'
          },
          maxChildren: {
            type: 'number',
            minimum: 1,
            maximum: 1000,
            default: 100,
            description: 'Maximum number of children to return'
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
        const validation = validateElementSchema('element_get_children', args);
        if (!validation.valid) {
          throw new Error(`Invalid arguments: ${validation.errors.join(', ')}`);
        }

        const page = await playwrightService.getPage(args.pageId);
        const locator = page.locator(args.selector);
        
        await locator.waitFor({ state: 'attached', timeout: args.timeout });
        
        const childrenInfo = await page.evaluate((sel, options) => {
          const parent = document.querySelector(sel);
          if (!parent) throw new Error('Parent element not found');
          
          const children = Array.from(parent.children);
          const results = [];
          
          for (let i = 0; i < Math.min(children.length, options.maxChildren); i++) {
            const child = children[i];
            
            const childInfo: any = {
              index: i,
              tagName: child.tagName.toLowerCase(),
              id: child.id || '',
              className: child.className || '',
              hasId: !!child.id,
              hasClass: !!child.className,
              hasChildren: child.children.length > 0,
              childCount: child.children.length
            };
            
            // Apply filters
            if (options.filterBy) {
              const filters = options.filterBy;
              
              if (filters.tagName && childInfo.tagName !== filters.tagName.toLowerCase()) continue;
              if (filters.className && !childInfo.className.includes(filters.className)) continue;
              if (filters.hasId !== undefined && childInfo.hasId !== filters.hasId) continue;
              if (filters.hasChildren !== undefined && childInfo.hasChildren !== filters.hasChildren) continue;
            }
            
            // Add text content if requested
            if (options.includeText) {
              childInfo.textContent = child.textContent?.trim() || '';
              childInfo.innerText = child.innerText?.trim() || '';
              childInfo.hasText = childInfo.textContent.length > 0;
              
              // Check text filter
              if (options.filterBy?.hasText !== undefined && 
                  childInfo.hasText !== options.filterBy.hasText) continue;
            }
            
            // Add metadata if requested
            if (options.includeMetadata) {
              const rect = child.getBoundingClientRect();
              const styles = window.getComputedStyle(child);
              
              childInfo.boundingBox = {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              };
              
              childInfo.isVisible = child.offsetParent !== null;
              
              // Check visibility filter
              if (options.filterBy?.isVisible !== undefined && 
                  childInfo.isVisible !== options.filterBy.isVisible) continue;
              
              childInfo.computedStyle = {
                display: styles.display,
                visibility: styles.visibility,
                opacity: styles.opacity,
                position: styles.position,
                zIndex: styles.zIndex
              };
              
              childInfo.attributes = {};
              for (const attr of child.attributes) {
                childInfo.attributes[attr.name] = attr.value;
              }
              
              // Calculate child element structure
              const descendants = child.querySelectorAll('*');
              childInfo.structure = {
                totalDescendants: descendants.length,
                depth: 0 // Calculate max depth
              };
              
              // Calculate depth
              let maxDepth = 0;
              const calculateDepth = (element: Element, currentDepth = 0) => {
                maxDepth = Math.max(maxDepth, currentDepth);
                for (const childEl of element.children) {
                  calculateDepth(childEl, currentDepth + 1);
                }
              };
              calculateDepth(child);
              childInfo.structure.depth = maxDepth;
            }
            
            results.push(childInfo);
          }
          
          return {
            parentSelector: sel,
            totalChildren: children.length,
            returnedChildren: results.length,
            children: results
          };
        }, args.selector, {
          filterBy: args.filterBy || {},
          includeMetadata: args.includeMetadata,
          includeText: args.includeText,
          maxChildren: args.maxChildren
        });
        
        // Analyze the children
        const analysis = {
          total: childrenInfo.totalChildren,
          returned: childrenInfo.returnedChildren,
          filtered: childrenInfo.totalChildren - childrenInfo.returnedChildren,
          tagTypes: {} as Record<string, number>,
          withIds: childrenInfo.children.filter((c: any) => c.hasId).length,
          withClasses: childrenInfo.children.filter((c: any) => c.hasClass).length,
          withText: childrenInfo.children.filter((c: any) => c.hasText).length,
          withChildren: childrenInfo.children.filter((c: any) => c.hasChildren).length,
          visible: childrenInfo.children.filter((c: any) => c.isVisible).length
        };
        
        // Count tag types
        childrenInfo.children.forEach((child: any) => {
          analysis.tagTypes[child.tagName] = (analysis.tagTypes[child.tagName] || 0) + 1;
        });

        return {
          success: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              selector: args.selector,
              analysis,
              childrenInfo,
              filters: args.filterBy,
              options: {
                includeMetadata: args.includeMetadata,
                includeText: args.includeText,
                maxChildren: args.maxChildren
              },
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    }
  ];
}
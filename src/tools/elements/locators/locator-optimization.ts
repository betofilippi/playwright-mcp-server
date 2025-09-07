/**
 * Selector Optimization Algorithms for Playwright MCP Server
 * Implements intelligent selector optimization and performance improvements
 */

import { Page } from 'playwright';

/**
 * CSS Selector Optimization Strategies
 */
export interface SelectorOptimizationResult {
  originalSelector: string;
  optimizedSelector: string;
  performance: {
    originalTime: number;
    optimizedTime: number;
    improvement: number; // percentage
  };
  confidence: number; // 0-100, how confident we are in the optimization
  suggestions: string[];
}

/**
 * Optimize a CSS selector for better performance and reliability
 */
export async function optimizeSelector(selector: string, page: Page): Promise<string> {
  try {
    // Basic optimization strategies
    const optimizations = [
      removeRedundantSelectors,
      optimizeDescendantSelectors,
      preferIdSelectors,
      optimizeClassSelectors,
      removeUniversalSelectors,
      optimizeNthChildSelectors,
      preferDataAttributes
    ];

    let currentSelector = selector;
    
    for (const optimization of optimizations) {
      try {
        const newSelector = await optimization(currentSelector, page);
        if (newSelector !== currentSelector) {
          // Verify the optimized selector returns the same elements
          const originalCount = await page.locator(currentSelector).count();
          const newCount = await page.locator(newSelector).count();
          
          if (originalCount === newCount && originalCount > 0) {
            // Additional verification: ensure elements are actually the same
            if (await areSelectorsEquivalent(currentSelector, newSelector, page)) {
              currentSelector = newSelector;
            }
          }
        }
      } catch (error) {
        // If optimization fails, continue with current selector
        continue;
      }
    }

    return currentSelector;
  } catch (error) {
    // If optimization fails completely, return original
    return selector;
  }
}

/**
 * Comprehensive selector analysis and optimization
 */
export async function analyzeAndOptimizeSelector(
  selector: string, 
  page: Page
): Promise<SelectorOptimizationResult> {
  const startTime = Date.now();
  
  try {
    // Measure original performance
    const originalStartTime = Date.now();
    const originalCount = await page.locator(selector).count();
    const originalTime = Date.now() - originalStartTime;

    // Optimize the selector
    const optimizedSelector = await optimizeSelector(selector, page);

    // Measure optimized performance
    const optimizedStartTime = Date.now();
    const optimizedCount = await page.locator(optimizedSelector).count();
    const optimizedTime = Date.now() - optimizedStartTime;

    // Calculate improvement
    const improvement = originalTime > 0 ? ((originalTime - optimizedTime) / originalTime) * 100 : 0;
    
    // Generate suggestions
    const suggestions = await generateSelectorSuggestions(selector, page);
    
    // Calculate confidence based on various factors
    const confidence = calculateOptimizationConfidence(selector, optimizedSelector, originalCount, optimizedCount);

    return {
      originalSelector: selector,
      optimizedSelector,
      performance: {
        originalTime,
        optimizedTime,
        improvement: Math.max(0, improvement)
      },
      confidence,
      suggestions
    };
  } catch (error) {
    return {
      originalSelector: selector,
      optimizedSelector: selector,
      performance: {
        originalTime: 0,
        optimizedTime: 0,
        improvement: 0
      },
      confidence: 0,
      suggestions: [`Error optimizing selector: ${error.message}`]
    };
  }
}

/**
 * Remove redundant parts of selectors
 */
async function removeRedundantSelectors(selector: string, page: Page): Promise<string> {
  // Remove redundant descendant selectors like "body div" -> "div"
  const parts = selector.split(' ').filter(part => part.trim().length > 0);
  
  if (parts.length <= 1) return selector;
  
  // Try removing each part from the beginning to see if it's redundant
  for (let i = 1; i < parts.length; i++) {
    const shorterSelector = parts.slice(i).join(' ');
    try {
      const originalCount = await page.locator(selector).count();
      const shorterCount = await page.locator(shorterSelector).count();
      
      if (originalCount === shorterCount && originalCount > 0) {
        return shorterSelector;
      }
    } catch (error) {
      continue;
    }
  }
  
  return selector;
}

/**
 * Optimize descendant selectors to child selectors where possible
 */
async function optimizeDescendantSelectors(selector: string, page: Page): Promise<string> {
  // Replace " " with " > " for direct child relationships when appropriate
  if (selector.includes(' ') && !selector.includes(' > ')) {
    const childSelector = selector.replace(/ /g, ' > ');
    try {
      const originalCount = await page.locator(selector).count();
      const childCount = await page.locator(childSelector).count();
      
      if (originalCount === childCount && originalCount > 0) {
        return childSelector;
      }
    } catch (error) {
      // Child selector failed, keep original
    }
  }
  
  return selector;
}

/**
 * Prefer ID selectors when available
 */
async function preferIdSelectors(selector: string, page: Page): Promise<string> {
  // If selector doesn't start with #, try to find if there's an element with ID
  if (!selector.startsWith('#')) {
    try {
      const elements = await page.locator(selector).all();
      if (elements.length === 1) {
        const element = elements[0];
        const id = await element.getAttribute('id');
        if (id && id.trim().length > 0) {
          // Verify ID selector works
          const idCount = await page.locator(`#${id}`).count();
          if (idCount === 1) {
            return `#${id}`;
          }
        }
      }
    } catch (error) {
      // Continue with original selector
    }
  }
  
  return selector;
}

/**
 * Optimize class selectors
 */
async function optimizeClassSelectors(selector: string, page: Page): Promise<string> {
  // Simplify complex class selectors
  const classMatch = selector.match(/\.([^.\s#\[\]:]+)\.([^.\s#\[\]:]+)/);
  if (classMatch) {
    const singleClass = `.${classMatch[1]}`;
    try {
      const originalCount = await page.locator(selector).count();
      const singleCount = await page.locator(singleClass).count();
      
      if (originalCount === singleCount && originalCount > 0) {
        return singleClass;
      }
    } catch (error) {
      // Keep original
    }
  }
  
  return selector;
}

/**
 * Remove universal selectors
 */
async function removeUniversalSelectors(selector: string, page: Page): Promise<string> {
  // Remove * selectors that are often unnecessary
  const withoutUniversal = selector.replace(/\s*\*\s*/g, ' ').replace(/^\*\s*/, '').trim();
  
  if (withoutUniversal !== selector && withoutUniversal.length > 0) {
    try {
      const originalCount = await page.locator(selector).count();
      const newCount = await page.locator(withoutUniversal).count();
      
      if (originalCount === newCount && originalCount > 0) {
        return withoutUniversal;
      }
    } catch (error) {
      // Keep original
    }
  }
  
  return selector;
}

/**
 * Optimize nth-child selectors
 */
async function optimizeNthChildSelectors(selector: string, page: Page): Promise<string> {
  // Replace :nth-child(1) with :first-child
  let optimized = selector.replace(/:nth-child\(1\)/g, ':first-child');
  
  // Replace :nth-last-child(1) with :last-child
  optimized = optimized.replace(/:nth-last-child\(1\)/g, ':last-child');
  
  if (optimized !== selector) {
    try {
      const originalCount = await page.locator(selector).count();
      const optimizedCount = await page.locator(optimized).count();
      
      if (originalCount === optimizedCount && originalCount > 0) {
        return optimized;
      }
    } catch (error) {
      // Keep original
    }
  }
  
  return selector;
}

/**
 * Prefer data attributes over complex selectors
 */
async function preferDataAttributes(selector: string, page: Page): Promise<string> {
  // If selector is complex and doesn't use data attributes, try to find them
  if (selector.length > 20 && !selector.includes('[data-')) {
    try {
      const elements = await page.locator(selector).all();
      if (elements.length === 1) {
        const element = elements[0];
        
        // Check for common test attributes
        const testAttributes = ['data-testid', 'data-test', 'data-cy', 'data-qa'];
        for (const attr of testAttributes) {
          const value = await element.getAttribute(attr);
          if (value && value.trim().length > 0) {
            const dataSelector = `[${attr}="${value}"]`;
            const dataCount = await page.locator(dataSelector).count();
            if (dataCount === 1) {
              return dataSelector;
            }
          }
        }
      }
    } catch (error) {
      // Continue with original selector
    }
  }
  
  return selector;
}

/**
 * Check if two selectors return the same elements
 */
async function areSelectorsEquivalent(selector1: string, selector2: string, page: Page): Promise<boolean> {
  try {
    const elements1 = await page.locator(selector1).all();
    const elements2 = await page.locator(selector2).all();
    
    if (elements1.length !== elements2.length) {
      return false;
    }
    
    // For small sets, compare each element
    if (elements1.length <= 5) {
      for (let i = 0; i < elements1.length; i++) {
        const el1 = elements1[i];
        const el2 = elements2[i];
        
        // Compare by bounding box as a simple identity check
        const box1 = await el1.boundingBox();
        const box2 = await el2.boundingBox();
        
        if (!box1 || !box2) continue;
        
        const isSame = Math.abs(box1.x - box2.x) < 1 && 
                      Math.abs(box1.y - box2.y) < 1 &&
                      Math.abs(box1.width - box2.width) < 1 &&
                      Math.abs(box1.height - box2.height) < 1;
        
        if (!isSame) return false;
      }
    }
    
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Generate selector improvement suggestions
 */
async function generateSelectorSuggestions(selector: string, page: Page): Promise<string[]> {
  const suggestions: string[] = [];
  
  try {
    // Analyze selector characteristics
    if (selector.includes(' ')) {
      suggestions.push('Consider using more specific selectors to avoid deep DOM traversal');
    }
    
    if (selector.includes('*')) {
      suggestions.push('Universal selectors (*) can be slow - consider more specific alternatives');
    }
    
    if (selector.split(' ').length > 3) {
      suggestions.push('Complex selectors with many levels can be fragile - consider data attributes');
    }
    
    if (!selector.includes('[data-')) {
      suggestions.push('Consider using data attributes (data-testid) for more stable selectors');
    }
    
    if (selector.includes(':nth-child(') && !selector.includes(':first-child') && !selector.includes(':last-child')) {
      suggestions.push('Consider using :first-child or :last-child instead of :nth-child(1) when appropriate');
    }
    
    const count = await page.locator(selector).count();
    if (count === 0) {
      suggestions.push('Selector matches no elements - verify the selector is correct');
    } else if (count > 10) {
      suggestions.push('Selector matches many elements - consider making it more specific');
    }
    
    // Check if elements are visible
    const visibleCount = await page.locator(selector).filter({ hasText: /.*/ }).count();
    if (visibleCount !== count) {
      suggestions.push('Some matched elements may not be visible - consider visibility filters');
    }
    
  } catch (error) {
    suggestions.push('Error analyzing selector - verify syntax is correct');
  }
  
  return suggestions;
}

/**
 * Calculate confidence score for optimization
 */
function calculateOptimizationConfidence(
  original: string,
  optimized: string,
  originalCount: number,
  optimizedCount: number
): number {
  let confidence = 50; // Base confidence
  
  // Higher confidence if counts match exactly
  if (originalCount === optimizedCount) {
    confidence += 30;
  } else {
    confidence -= 20;
  }
  
  // Higher confidence for simpler selectors
  if (optimized.length < original.length) {
    confidence += 10;
  }
  
  // Higher confidence for stable selector patterns
  if (optimized.includes('#')) {
    confidence += 20; // ID selectors are very stable
  } else if (optimized.includes('[data-')) {
    confidence += 15; // Data attributes are stable
  } else if (optimized.includes('.') && !optimized.includes(' ')) {
    confidence += 10; // Simple class selectors are good
  }
  
  // Lower confidence for complex selectors
  const complexity = (original.match(/[ >+~]/g) || []).length;
  confidence -= Math.min(complexity * 5, 25);
  
  return Math.max(0, Math.min(100, confidence));
}

/**
 * Smart selector builder for common patterns
 */
export class SmartSelectorBuilder {
  private page: Page;
  
  constructor(page: Page) {
    this.page = page;
  }
  
  /**
   * Build selector for button elements
   */
  async buildButtonSelector(text?: string, role?: string): Promise<string[]> {
    const selectors: string[] = [];
    
    if (text) {
      // Try getByRole first (most reliable)
      selectors.push(`role=button[name="${text}"]`);
      selectors.push(`role=button[name*="${text}"]`);
      
      // Try getByText
      selectors.push(`text="${text}"`);
      selectors.push(`text*="${text}"`);
      
      // CSS selectors
      selectors.push(`button:has-text("${text}")`);
      selectors.push(`[role="button"]:has-text("${text}")`);
      selectors.push(`input[type="submit"][value="${text}"]`);
    }
    
    // Generic button selectors
    selectors.push('button');
    selectors.push('[role="button"]');
    selectors.push('input[type="submit"]');
    selectors.push('input[type="button"]');
    
    return selectors;
  }
  
  /**
   * Build selector for form input elements
   */
  async buildInputSelector(label?: string, placeholder?: string, name?: string): Promise<string[]> {
    const selectors: string[] = [];
    
    if (label) {
      selectors.push(`label="${label}"`);
      selectors.push(`label*="${label}"`);
    }
    
    if (placeholder) {
      selectors.push(`placeholder="${placeholder}"`);
      selectors.push(`placeholder*="${placeholder}"`);
      selectors.push(`input[placeholder="${placeholder}"]`);
    }
    
    if (name) {
      selectors.push(`input[name="${name}"]`);
      selectors.push(`[name="${name}"]`);
    }
    
    return selectors;
  }
  
  /**
   * Build selector for link elements
   */
  async buildLinkSelector(text?: string, href?: string): Promise<string[]> {
    const selectors: string[] = [];
    
    if (text) {
      selectors.push(`link="${text}"`);
      selectors.push(`link*="${text}"`);
      selectors.push(`a:has-text("${text}")`);
    }
    
    if (href) {
      selectors.push(`a[href="${href}"]`);
      selectors.push(`a[href*="${href}"]`);
    }
    
    selectors.push('a');
    selectors.push('[role="link"]');
    
    return selectors;
  }
}
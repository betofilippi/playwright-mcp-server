/**
 * Selector Validation and Sanitization for Playwright MCP Server
 * Implements security validation and selector sanitization
 */

import { Page } from 'playwright';

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitized?: string;
  risk: 'low' | 'medium' | 'high';
}

/**
 * Selector security patterns to detect potentially malicious selectors
 */
const DANGEROUS_PATTERNS = [
  /javascript:/i,
  /vbscript:/i,
  /onload/i,
  /onerror/i,
  /onclick/i,
  /onmouse/i,
  /onfocus/i,
  /onblur/i,
  /<script/i,
  /<iframe/i,
  /eval\(/i,
  /Function\(/i,
  /setTimeout/i,
  /setInterval/i,
  /alert\(/i,
  /confirm\(/i,
  /prompt\(/i
];

/**
 * XPath injection patterns
 */
const XPATH_INJECTION_PATTERNS = [
  /or\s+1=1/i,
  /union\s+select/i,
  /\'\s*or\s*\'/i,
  /\"\s*or\s*\"/i,
  /\/\*.*\*\//,
  /;.*--/,
  /drop\s+table/i,
  /insert\s+into/i,
  /delete\s+from/i,
  /update\s+set/i
];

/**
 * CSS selector injection patterns
 */
const CSS_INJECTION_PATTERNS = [
  /expression\(/i,
  /url\(/i,
  /import/i,
  /@import/i,
  /binding:/i,
  /-moz-binding/i,
  /behavior:/i,
  /javascript:/i
];

/**
 * Validate CSS selector
 */
export function validateCSSSelector(selector: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    risk: 'low'
  };

  if (!selector || typeof selector !== 'string') {
    result.valid = false;
    result.errors.push('Selector must be a non-empty string');
    result.risk = 'high';
    return result;
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(selector)) {
      result.valid = false;
      result.errors.push(`Dangerous pattern detected: ${pattern.source}`);
      result.risk = 'high';
    }
  }

  // Check for CSS injection patterns
  for (const pattern of CSS_INJECTION_PATTERNS) {
    if (pattern.test(selector)) {
      result.valid = false;
      result.errors.push(`CSS injection pattern detected: ${pattern.source}`);
      result.risk = 'high';
    }
  }

  // Basic CSS syntax validation
  try {
    // Check for balanced brackets
    const brackets = selector.match(/[\[\]]/g);
    if (brackets && brackets.length % 2 !== 0) {
      result.valid = false;
      result.errors.push('Unbalanced square brackets');
    }

    // Check for balanced parentheses
    const parens = selector.match(/[()]/g);
    if (parens && parens.length % 2 !== 0) {
      result.valid = false;
      result.errors.push('Unbalanced parentheses');
    }

    // Check for valid CSS characters
    if (!/^[a-zA-Z0-9\s.#\[\]():,"'=*^$|~+-_-]+$/.test(selector)) {
      result.warnings.push('Selector contains unusual characters');
      result.risk = result.risk === 'low' ? 'medium' : result.risk;
    }

    // Check for overly complex selectors (potential performance issues)
    if (selector.length > 200) {
      result.warnings.push('Selector is very long and may impact performance');
      result.risk = result.risk === 'low' ? 'medium' : result.risk;
    }

    const parts = selector.split(' ').filter(p => p.trim());
    if (parts.length > 6) {
      result.warnings.push('Selector has many levels and may be fragile');
    }

  } catch (error) {
    result.valid = false;
    result.errors.push(`CSS syntax validation failed: ${error.message}`);
  }

  return result;
}

/**
 * Validate XPath expression
 */
export function validateXPathExpression(xpath: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    risk: 'low'
  };

  if (!xpath || typeof xpath !== 'string') {
    result.valid = false;
    result.errors.push('XPath must be a non-empty string');
    result.risk = 'high';
    return result;
  }

  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(xpath)) {
      result.valid = false;
      result.errors.push(`Dangerous pattern detected: ${pattern.source}`);
      result.risk = 'high';
    }
  }

  // Check for XPath injection patterns
  for (const pattern of XPATH_INJECTION_PATTERNS) {
    if (pattern.test(xpath)) {
      result.valid = false;
      result.errors.push(`XPath injection pattern detected: ${pattern.source}`);
      result.risk = 'high';
    }
  }

  // Basic XPath syntax validation
  try {
    // Check for balanced brackets
    const brackets = xpath.match(/[\[\]]/g);
    if (brackets && brackets.length % 2 !== 0) {
      result.valid = false;
      result.errors.push('Unbalanced square brackets');
    }

    // Check for balanced parentheses
    const parens = xpath.match(/[()]/g);
    if (parens && parens.length % 2 !== 0) {
      result.valid = false;
      result.errors.push('Unbalanced parentheses');
    }

    // Check for valid XPath starting patterns
    if (!xpath.startsWith('/') && !xpath.startsWith('.') && !xpath.startsWith('(')) {
      result.warnings.push('XPath should typically start with /, ./, or (');
    }

    // Check for overly complex XPaths
    if (xpath.length > 300) {
      result.warnings.push('XPath is very long and may impact performance');
      result.risk = result.risk === 'low' ? 'medium' : result.risk;
    }

    // Check for potentially problematic functions
    const dangerousFunctions = [
      'document-uri', 'unparsed-text', 'collection',
      'doc', 'doc-available', 'unparsed-text-available'
    ];
    
    for (const func of dangerousFunctions) {
      if (xpath.includes(func + '(')) {
        result.warnings.push(`XPath contains potentially risky function: ${func}`);
        result.risk = result.risk === 'low' ? 'medium' : result.risk;
      }
    }

  } catch (error) {
    result.valid = false;
    result.errors.push(`XPath syntax validation failed: ${error.message}`);
  }

  return result;
}

/**
 * Sanitize selector by removing dangerous content
 */
export function sanitizeSelector(selector: string, type: 'css' | 'xpath' = 'css'): string {
  if (!selector || typeof selector !== 'string') {
    return '';
  }

  let sanitized = selector.trim();

  // Remove dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  // Remove type-specific dangerous patterns
  const injectionPatterns = type === 'xpath' ? XPATH_INJECTION_PATTERNS : CSS_INJECTION_PATTERNS;
  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, '');
  }

  // Remove excessive whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  // Remove null bytes and control characters
  sanitized = sanitized.replace(/[\x00-\x1f\x7f-\x9f]/g, '');

  return sanitized;
}

/**
 * Validate selector with page context
 */
export async function validateSelectorWithPage(
  selector: string, 
  page: Page, 
  type: 'css' | 'xpath' = 'css'
): Promise<ValidationResult> {
  // First do static validation
  const staticResult = type === 'xpath' 
    ? validateXPathExpression(selector)
    : validateCSSSelector(selector);

  if (!staticResult.valid) {
    return staticResult;
  }

  // Then validate with page context
  try {
    const locator = page.locator(selector);
    await locator.count(); // This will throw if selector is invalid

    // Check if selector is too broad (matches too many elements)
    const count = await locator.count();
    if (count > 100) {
      staticResult.warnings.push(`Selector matches ${count} elements - consider making it more specific`);
      staticResult.risk = staticResult.risk === 'low' ? 'medium' : staticResult.risk;
    }

    return staticResult;
  } catch (error) {
    return {
      valid: false,
      errors: [`Selector failed page validation: ${error.message}`],
      warnings: staticResult.warnings,
      risk: 'high'
    };
  }
}

/**
 * Comprehensive selector security audit
 */
export async function auditSelector(selector: string, page?: Page): Promise<{
  selector: string;
  type: 'css' | 'xpath';
  validation: ValidationResult;
  suggestions: string[];
  securityScore: number; // 0-100, higher is safer
}> {
  // Detect selector type
  const type: 'css' | 'xpath' = selector.startsWith('/') || selector.startsWith('./') ? 'xpath' : 'css';
  
  // Validate selector
  const validation = page 
    ? await validateSelectorWithPage(selector, page, type)
    : (type === 'xpath' ? validateXPathExpression(selector) : validateCSSSelector(selector));

  // Generate security suggestions
  const suggestions: string[] = [];
  
  if (validation.risk === 'high') {
    suggestions.push('This selector contains dangerous patterns and should not be used');
  } else if (validation.risk === 'medium') {
    suggestions.push('This selector has some risk factors - consider using safer alternatives');
  }

  if (selector.length > 100) {
    suggestions.push('Consider using shorter, more specific selectors for better performance');
  }

  if (type === 'css' && !selector.includes('[data-')) {
    suggestions.push('Consider using data attributes for more stable selectors');
  }

  if (validation.warnings.length > 0) {
    suggestions.push('Address validation warnings to improve selector reliability');
  }

  // Calculate security score
  let securityScore = 100;
  securityScore -= validation.errors.length * 30;
  securityScore -= validation.warnings.length * 10;
  
  if (validation.risk === 'high') securityScore -= 50;
  else if (validation.risk === 'medium') securityScore -= 20;

  securityScore = Math.max(0, Math.min(100, securityScore));

  return {
    selector,
    type,
    validation,
    suggestions,
    securityScore
  };
}

/**
 * Safe selector builder that enforces security constraints
 */
export class SafeSelectorBuilder {
  private maxLength: number = 150;
  private allowedPatterns: RegExp[] = [
    /^[a-zA-Z0-9\s.#\[\]():,"'=*^$|~+-_-]+$/, // CSS safe characters
    /^[a-zA-Z0-9\s.\/\[\]():,"'=@*^$|~+-_-]+$/ // XPath safe characters
  ];

  /**
   * Build a safe CSS selector
   */
  buildCSSSelector(parts: {
    tag?: string;
    id?: string;
    classes?: string[];
    attributes?: Record<string, string>;
    pseudoClasses?: string[];
  }): ValidationResult {
    const selectorParts: string[] = [];

    // Add tag
    if (parts.tag) {
      const sanitizedTag = this.sanitizeToken(parts.tag);
      if (sanitizedTag && /^[a-zA-Z][a-zA-Z0-9-]*$/.test(sanitizedTag)) {
        selectorParts.push(sanitizedTag);
      }
    }

    // Add ID
    if (parts.id) {
      const sanitizedId = this.sanitizeToken(parts.id);
      if (sanitizedId && /^[a-zA-Z][a-zA-Z0-9-_]*$/.test(sanitizedId)) {
        selectorParts.push(`#${sanitizedId}`);
      }
    }

    // Add classes
    if (parts.classes && parts.classes.length > 0) {
      const validClasses = parts.classes
        .map(cls => this.sanitizeToken(cls))
        .filter(cls => cls && /^[a-zA-Z][a-zA-Z0-9-_]*$/.test(cls));
      
      validClasses.forEach(cls => selectorParts.push(`.${cls}`));
    }

    // Add attributes
    if (parts.attributes) {
      for (const [attr, value] of Object.entries(parts.attributes)) {
        const sanitizedAttr = this.sanitizeToken(attr);
        const sanitizedValue = this.sanitizeToken(value);
        
        if (sanitizedAttr && sanitizedValue && 
            /^[a-zA-Z][a-zA-Z0-9-_]*$/.test(sanitizedAttr)) {
          selectorParts.push(`[${sanitizedAttr}="${sanitizedValue}"]`);
        }
      }
    }

    // Add pseudo-classes
    if (parts.pseudoClasses && parts.pseudoClasses.length > 0) {
      const validPseudos = parts.pseudoClasses
        .map(pseudo => this.sanitizeToken(pseudo))
        .filter(pseudo => this.isValidPseudoClass(pseudo));
      
      validPseudos.forEach(pseudo => selectorParts.push(`:${pseudo}`));
    }

    const selector = selectorParts.join('');
    
    if (selector.length === 0) {
      return {
        valid: false,
        errors: ['No valid selector parts provided'],
        warnings: [],
        risk: 'high'
      };
    }

    if (selector.length > this.maxLength) {
      return {
        valid: false,
        errors: [`Selector too long: ${selector.length} > ${this.maxLength}`],
        warnings: [],
        risk: 'medium'
      };
    }

    return {
      valid: true,
      errors: [],
      warnings: [],
      sanitized: selector,
      risk: 'low'
    };
  }

  private sanitizeToken(token: string): string {
    if (!token || typeof token !== 'string') return '';
    
    return token
      .replace(/[^\w-]/g, '') // Only allow word characters and hyphens
      .trim()
      .substring(0, 50); // Limit length
  }

  private isValidPseudoClass(pseudo: string): boolean {
    const validPseudoClasses = [
      'hover', 'focus', 'active', 'visited', 'link',
      'first-child', 'last-child', 'first-of-type', 'last-of-type',
      'nth-child', 'nth-of-type', 'nth-last-child', 'nth-last-of-type',
      'only-child', 'only-of-type', 'empty', 'root',
      'enabled', 'disabled', 'checked', 'selected'
    ];
    
    return validPseudoClasses.includes(pseudo) || 
           /^nth-child\(\d+\)$/.test(pseudo) ||
           /^nth-of-type\(\d+\)$/.test(pseudo);
  }
}
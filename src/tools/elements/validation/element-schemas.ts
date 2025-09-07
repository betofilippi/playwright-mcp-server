/**
 * Element Schema Validation for Playwright MCP Server
 * Comprehensive validation schemas for all element interaction tools
 */

import { Page } from 'playwright';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

/**
 * Validate element interaction arguments
 */
export function validateElementSchema(toolName: string, args: any): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  // Common validations
  if (!args.pageId) {
    result.errors.push('pageId is required');
  } else if (typeof args.pageId !== 'string') {
    result.errors.push('pageId must be a string');
  }

  if (!args.selector && toolName !== 'elements_batch_operation') {
    result.errors.push('selector is required');
  } else if (args.selector && typeof args.selector !== 'string') {
    result.errors.push('selector must be a string');
  }

  // Tool-specific validations
  switch (toolName) {
    case 'element_get_attribute':
      validateAttribute(args, result);
      break;
      
    case 'element_get_property':
      validateProperty(args, result);
      break;
      
    case 'element_get_computed_style':
      validateComputedStyle(args, result);
      break;
      
    case 'element_select_option':
      validateSelectOption(args, result);
      break;
      
    case 'element_input_files':
      validateFileInput(args, result);
      break;
      
    case 'element_fill_formatted':
      validateFormattedInput(args, result);
      break;
      
    case 'form_fill_data':
      validateFormFillData(args, result);
      break;
      
    case 'element_drag_and_drop':
      validateDragAndDrop(args, result);
      break;
      
    case 'elements_batch_operation':
      validateBatchOperation(args, result);
      break;
      
    case 'element_watch_changes':
      validateWatchChanges(args, result);
      break;
      
    default:
      // Generic validation for other tools
      validateGenericElement(args, result);
      break;
  }

  result.valid = result.errors.length === 0;
  return result;
}

function validateAttribute(args: any, result: ValidationResult): void {
  if (!args.attributeName) {
    result.errors.push('attributeName is required');
  } else if (typeof args.attributeName !== 'string') {
    result.errors.push('attributeName must be a string');
  }
}

function validateProperty(args: any, result: ValidationResult): void {
  if (!args.propertyName) {
    result.errors.push('propertyName is required');
  } else if (typeof args.propertyName !== 'string') {
    result.errors.push('propertyName must be a string');
  }
}

function validateComputedStyle(args: any, result: ValidationResult): void {
  if (args.properties && !Array.isArray(args.properties)) {
    result.errors.push('properties must be an array');
  }
  
  if (args.properties && args.properties.some((p: any) => typeof p !== 'string')) {
    result.errors.push('all properties must be strings');
  }
}

function validateSelectOption(args: any, result: ValidationResult): void {
  if (!args.options) {
    result.errors.push('options is required');
  } else if (!Array.isArray(args.options)) {
    result.errors.push('options must be an array');
  } else if (args.options.length === 0) {
    result.errors.push('options array cannot be empty');
  }
  
  if (args.method && !['value', 'label', 'index'].includes(args.method)) {
    result.errors.push('method must be one of: value, label, index');
  }
}

function validateFileInput(args: any, result: ValidationResult): void {
  if (!args.filePaths) {
    result.errors.push('filePaths is required');
  } else if (!Array.isArray(args.filePaths)) {
    result.errors.push('filePaths must be an array');
  } else if (args.filePaths.length === 0) {
    result.errors.push('filePaths array cannot be empty');
  } else if (args.filePaths.some((p: any) => typeof p !== 'string')) {
    result.errors.push('all file paths must be strings');
  }
}

function validateFormattedInput(args: any, result: ValidationResult): void {
  if (!args.value) {
    result.errors.push('value is required');
  } else if (typeof args.value !== 'string') {
    result.errors.push('value must be a string');
  }
  
  if (args.format && !['phone', 'date', 'currency', 'ssn', 'creditcard', 'email', 'url', 'none'].includes(args.format)) {
    result.errors.push('format must be one of: phone, date, currency, ssn, creditcard, email, url, none');
  }
  
  if (args.locale && typeof args.locale !== 'string') {
    result.errors.push('locale must be a string');
  }
}

function validateFormFillData(args: any, result: ValidationResult): void {
  if (!args.data) {
    result.errors.push('data is required');
  } else if (typeof args.data !== 'object' || args.data === null) {
    result.errors.push('data must be an object');
  } else if (Object.keys(args.data).length === 0) {
    result.errors.push('data object cannot be empty');
  }
}

function validateDragAndDrop(args: any, result: ValidationResult): void {
  if (!args.sourceSelector) {
    result.errors.push('sourceSelector is required');
  } else if (typeof args.sourceSelector !== 'string') {
    result.errors.push('sourceSelector must be a string');
  }
  
  if (!args.targetSelector) {
    result.errors.push('targetSelector is required');
  } else if (typeof args.targetSelector !== 'string') {
    result.errors.push('targetSelector must be a string');
  }
  
  if (args.method && !['dragAndDrop', 'manual', 'dataTransfer'].includes(args.method)) {
    result.errors.push('method must be one of: dragAndDrop, manual, dataTransfer');
  }
  
  if (args.sourcePosition) {
    validatePosition(args.sourcePosition, 'sourcePosition', result);
  }
  
  if (args.targetPosition) {
    validatePosition(args.targetPosition, 'targetPosition', result);
  }
}

function validateBatchOperation(args: any, result: ValidationResult): void {
  if (!args.selectors) {
    result.errors.push('selectors is required');
  } else if (!Array.isArray(args.selectors)) {
    result.errors.push('selectors must be an array');
  } else if (args.selectors.length === 0) {
    result.errors.push('selectors array cannot be empty');
  } else if (args.selectors.some((s: any) => typeof s !== 'string')) {
    result.errors.push('all selectors must be strings');
  }
  
  if (!args.operation) {
    result.errors.push('operation is required');
  } else if (!['click', 'fill', 'check', 'uncheck', 'hover', 'focus', 'blur', 'scrollIntoView'].includes(args.operation)) {
    result.errors.push('operation must be one of: click, fill, check, uncheck, hover, focus, blur, scrollIntoView');
  }
}

function validateWatchChanges(args: any, result: ValidationResult): void {
  if (!args.watchFor) {
    result.errors.push('watchFor is required');
  } else if (!Array.isArray(args.watchFor)) {
    result.errors.push('watchFor must be an array');
  } else if (args.watchFor.length === 0) {
    result.errors.push('watchFor array cannot be empty');
  } else {
    const validWatchItems = ['visibility', 'text', 'attributes', 'children', 'position', 'size'];
    const invalidItems = args.watchFor.filter((item: any) => !validWatchItems.includes(item));
    if (invalidItems.length > 0) {
      result.errors.push(`Invalid watchFor items: ${invalidItems.join(', ')}`);
    }
  }
  
  if (args.pollInterval && (typeof args.pollInterval !== 'number' || args.pollInterval < 100)) {
    result.errors.push('pollInterval must be a number >= 100');
  }
  
  if (args.maxWaitTime && (typeof args.maxWaitTime !== 'number' || args.maxWaitTime < 1000)) {
    result.errors.push('maxWaitTime must be a number >= 1000');
  }
}

function validatePosition(position: any, fieldName: string, result: ValidationResult): void {
  if (typeof position !== 'object' || position === null) {
    result.errors.push(`${fieldName} must be an object`);
    return;
  }
  
  if (typeof position.x !== 'number') {
    result.errors.push(`${fieldName}.x must be a number`);
  }
  
  if (typeof position.y !== 'number') {
    result.errors.push(`${fieldName}.y must be a number`);
  }
}

function validateGenericElement(args: any, result: ValidationResult): void {
  // Common timeout validation
  if (args.timeout && (typeof args.timeout !== 'number' || args.timeout < 1000 || args.timeout > 300000)) {
    result.errors.push('timeout must be a number between 1000 and 300000');
  }
  
  // Common force validation
  if (args.force && typeof args.force !== 'boolean') {
    result.errors.push('force must be a boolean');
  }
  
  // Position validation if present
  if (args.position) {
    validatePosition(args.position, 'position', result);
  }
}

/**
 * Additional security validation for element interactions
 */
export interface SafetyCheck {
  safe: boolean;
  reason?: string;
  warnings?: string[];
}

export async function checkInteractionSafety(selector: string, action: string): Promise<SafetyCheck> {
  const result: SafetyCheck = {
    safe: true,
    warnings: []
  };

  // Check for potentially dangerous selectors
  const dangerousPatterns = [
    /javascript:/i,
    /vbscript:/i,
    /data:text\/html/i,
    /<script/i,
    /on\w+\s*=/i  // event handlers
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(selector)) {
      result.safe = false;
      result.reason = 'Selector contains potentially dangerous content';
      return result;
    }
  }

  // Check for overly broad selectors that might affect many elements
  const broadSelectors = ['*', 'body', 'html', 'head'];
  if (broadSelectors.includes(selector.trim())) {
    result.warnings?.push(`Selector "${selector}" is very broad and may affect many elements`);
  }

  // Action-specific safety checks
  switch (action) {
    case 'click':
      // Warn about clicking on potentially sensitive elements
      if (selector.includes('button[type="submit"]') || selector.includes('input[type="submit"]')) {
        result.warnings?.push('Clicking submit button - ensure form validation is complete');
      }
      break;
      
    case 'fill':
      // Warn about filling password fields
      if (selector.includes('[type="password"]')) {
        result.warnings?.push('Filling password field - ensure secure handling');
      }
      break;
      
    case 'upload':
      // File upload safety
      result.warnings?.push('File upload operation - verify file paths and permissions');
      break;
  }

  return result;
}

/**
 * Validate CSS selector syntax
 */
export function validateCSSSelector(selector: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  if (!selector || typeof selector !== 'string') {
    result.errors.push('Selector must be a non-empty string');
    result.valid = false;
    return result;
  }

  try {
    // Test selector by attempting to create a DOM selection
    // This is a basic check - actual DOM validation happens at runtime
    if (selector.trim().length === 0) {
      result.errors.push('Selector cannot be empty or only whitespace');
    }
    
    // Check for common syntax errors
    if (selector.includes('>>')) {
      result.warnings?.push('Shadow DOM selector detected - ensure shadow DOM is accessible');
    }
    
    if (selector.includes(':nth-child(0)')) {
      result.errors.push('nth-child selector cannot use index 0 (CSS uses 1-based indexing)');
    }
    
    // Check for unmatched brackets
    const openBrackets = (selector.match(/\[/g) || []).length;
    const closeBrackets = (selector.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      result.errors.push('Unmatched brackets in selector');
    }
    
    // Check for unmatched parentheses
    const openParens = (selector.match(/\(/g) || []).length;
    const closeParens = (selector.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      result.errors.push('Unmatched parentheses in selector');
    }
    
  } catch (error) {
    result.errors.push(`Invalid selector syntax: ${error.message}`);
  }

  result.valid = result.errors.length === 0;
  return result;
}

/**
 * Validate XPath expression syntax
 */
export function validateXPathSelector(xpath: string): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: []
  };

  if (!xpath || typeof xpath !== 'string') {
    result.errors.push('XPath must be a non-empty string');
    result.valid = false;
    return result;
  }

  try {
    // Basic XPath syntax checks
    if (!xpath.startsWith('/') && !xpath.startsWith('.') && !xpath.startsWith('(')) {
      result.warnings?.push('XPath should typically start with /, ./, or (');
    }
    
    // Check for common XPath errors
    if (xpath.includes('[0]')) {
      result.warnings?.push('XPath uses 1-based indexing, [0] may not work as expected');
    }
    
    // Check for unmatched brackets
    const openBrackets = (xpath.match(/\[/g) || []).length;
    const closeBrackets = (xpath.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      result.errors.push('Unmatched brackets in XPath expression');
    }
    
    // Check for unmatched parentheses
    const openParens = (xpath.match(/\(/g) || []).length;
    const closeParens = (xpath.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      result.errors.push('Unmatched parentheses in XPath expression');
    }
    
    // Check for unmatched quotes
    const singleQuotes = (xpath.match(/'/g) || []).length;
    const doubleQuotes = (xpath.match(/"/g) || []).length;
    if (singleQuotes % 2 !== 0) {
      result.errors.push('Unmatched single quotes in XPath expression');
    }
    if (doubleQuotes % 2 !== 0) {
      result.errors.push('Unmatched double quotes in XPath expression');
    }
    
  } catch (error) {
    result.errors.push(`Invalid XPath syntax: ${error.message}`);
  }

  result.valid = result.errors.length === 0;
  return result;
}
/**
 * Interaction Safety Validation for Playwright MCP Server
 * Security and safety checks for element interactions
 */

export interface SafetyCheck {
  safe: boolean;
  reason?: string;
  warnings?: string[];
  riskLevel?: 'low' | 'medium' | 'high';
}

/**
 * Check if an interaction is safe to perform
 */
export async function checkInteractionSafety(selector: string, action: string): Promise<SafetyCheck> {
  const result: SafetyCheck = {
    safe: true,
    warnings: [],
    riskLevel: 'low'
  };

  // Check for potentially dangerous selectors
  const dangerousPatterns = [
    { pattern: /javascript:/i, risk: 'high', reason: 'JavaScript execution in selector' },
    { pattern: /vbscript:/i, risk: 'high', reason: 'VBScript execution in selector' },
    { pattern: /data:text\/html/i, risk: 'high', reason: 'HTML data URI in selector' },
    { pattern: /<script/i, risk: 'high', reason: 'Script tag in selector' },
    { pattern: /on\w+\s*=/i, risk: 'medium', reason: 'Event handler in selector' },
    { pattern: /eval\s*\(/i, risk: 'high', reason: 'Eval function in selector' }
  ];

  for (const { pattern, risk, reason } of dangerousPatterns) {
    if (pattern.test(selector)) {
      result.safe = false;
      result.reason = reason;
      result.riskLevel = risk as 'low' | 'medium' | 'high';
      return result;
    }
  }

  // Check for overly broad selectors
  const broadSelectors = ['*', 'body', 'html', 'head'];
  if (broadSelectors.includes(selector.trim())) {
    result.warnings?.push(`Selector "${selector}" is very broad and may affect many elements`);
    result.riskLevel = 'medium';
  }

  // Check for potentially problematic attribute selectors
  const sensitiveAttributes = [
    'onclick', 'onload', 'onerror', 'onmouseover', 'onmouseout',
    'onfocus', 'onblur', 'onchange', 'onsubmit'
  ];
  
  for (const attr of sensitiveAttributes) {
    if (selector.includes(`[${attr}]`) || selector.includes(`${attr}=`)) {
      result.warnings?.push(`Selector targets sensitive attribute: ${attr}`);
      result.riskLevel = 'medium';
    }
  }

  // Action-specific safety checks
  switch (action.toLowerCase()) {
    case 'click':
      result.warnings?.push(...checkClickSafety(selector));
      break;
      
    case 'fill':
    case 'type':
      result.warnings?.push(...checkInputSafety(selector));
      break;
      
    case 'upload':
    case 'input_files':
      result.warnings?.push(...checkUploadSafety(selector));
      break;
      
    case 'submit':
      result.warnings?.push(...checkSubmitSafety(selector));
      break;
      
    case 'drag_and_drop':
      result.warnings?.push(...checkDragDropSafety(selector));
      break;
      
    case 'execute_script':
    case 'evaluate':
      result.safe = false;
      result.reason = 'Script execution is not allowed through element interactions';
      result.riskLevel = 'high';
      return result;
  }

  // Update risk level based on warnings
  if (result.warnings && result.warnings.length > 0) {
    if (result.riskLevel === 'low') {
      result.riskLevel = 'medium';
    }
  }

  return result;
}

function checkClickSafety(selector: string): string[] {
  const warnings: string[] = [];
  
  // Check for submit buttons
  if (selector.includes('button[type="submit"]') || 
      selector.includes('input[type="submit"]') ||
      selector.includes('[type="submit"]')) {
    warnings.push('Clicking submit button - ensure form validation is complete');
  }
  
  // Check for delete/destructive actions
  const destructiveKeywords = ['delete', 'remove', 'destroy', 'clear', 'reset'];
  const selectorLower = selector.toLowerCase();
  
  for (const keyword of destructiveKeywords) {
    if (selectorLower.includes(keyword)) {
      warnings.push(`Potentially destructive action detected: ${keyword}`);
      break;
    }
  }
  
  // Check for external links
  if (selector.includes('a[href^="http"]') || 
      selector.includes('[target="_blank"]')) {
    warnings.push('Clicking external link - may navigate away from current page');
  }
  
  return warnings;
}

function checkInputSafety(selector: string): string[] {
  const warnings: string[] = [];
  
  // Check for password fields
  if (selector.includes('[type="password"]') || 
      selector.includes('input[type="password"]')) {
    warnings.push('Filling password field - ensure secure handling of sensitive data');
  }
  
  // Check for email fields
  if (selector.includes('[type="email"]')) {
    warnings.push('Filling email field - validate email format and handle PII appropriately');
  }
  
  // Check for credit card or sensitive data fields
  const sensitiveFieldPatterns = [
    /credit/i, /card/i, /cvv/i, /ssn/i, /social/i, /tax/i, /bank/i
  ];
  
  for (const pattern of sensitiveFieldPatterns) {
    if (pattern.test(selector)) {
      warnings.push('Interacting with potentially sensitive financial/personal data field');
      break;
    }
  }
  
  return warnings;
}

function checkUploadSafety(selector: string): string[] {
  const warnings: string[] = [];
  
  warnings.push('File upload operation - verify file paths exist and have proper permissions');
  warnings.push('Ensure uploaded files are validated and safe');
  
  // Check for multiple file upload
  if (selector.includes('[multiple]')) {
    warnings.push('Multiple file upload detected - ensure all files are validated');
  }
  
  return warnings;
}

function checkSubmitSafety(selector: string): string[] {
  const warnings: string[] = [];
  
  warnings.push('Form submission - ensure all required fields are filled and validated');
  warnings.push('Verify form data is correct before submission');
  
  // Check for POST forms
  if (selector.includes('[method="post"]')) {
    warnings.push('POST form submission - data will be sent to server');
  }
  
  return warnings;
}

function checkDragDropSafety(selector: string): string[] {
  const warnings: string[] = [];
  
  warnings.push('Drag and drop operation - ensure both source and target elements are valid');
  warnings.push('Verify drag and drop will not cause unintended data loss or movement');
  
  return warnings;
}

/**
 * Validate that a selector is safe for automation
 */
export function validateSelectorSafety(selector: string): SafetyCheck {
  const result: SafetyCheck = {
    safe: true,
    warnings: [],
    riskLevel: 'low'
  };

  if (!selector || typeof selector !== 'string') {
    result.safe = false;
    result.reason = 'Invalid selector provided';
    result.riskLevel = 'high';
    return result;
  }

  // Trim and basic cleanup
  const cleanSelector = selector.trim();
  
  if (cleanSelector.length === 0) {
    result.safe = false;
    result.reason = 'Empty selector provided';
    result.riskLevel = 'high';
    return result;
  }

  // Check for SQL injection patterns (though unlikely in CSS selectors)
  const sqlPatterns = [
    /union\s+select/i,
    /drop\s+table/i,
    /delete\s+from/i,
    /insert\s+into/i
  ];

  for (const pattern of sqlPatterns) {
    if (pattern.test(cleanSelector)) {
      result.safe = false;
      result.reason = 'Potential SQL injection attempt in selector';
      result.riskLevel = 'high';
      return result;
    }
  }

  // Check for command injection patterns
  const commandPatterns = [
    /&&/,
    /\|\|/,
    /;/,
    /`/,
    /\$\(/
  ];

  for (const pattern of commandPatterns) {
    if (pattern.test(cleanSelector)) {
      result.warnings?.push('Selector contains special characters that could be problematic');
      result.riskLevel = 'medium';
    }
  }

  return result;
}

/**
 * Rate limiting and abuse prevention
 */
export class InteractionRateLimiter {
  private interactions: Map<string, number[]> = new Map();
  private readonly maxInteractionsPerMinute = 300;
  private readonly maxInteractionsPerHour = 1800;
  
  checkRateLimit(pageId: string): SafetyCheck {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const oneHourAgo = now - 3600000;
    
    if (!this.interactions.has(pageId)) {
      this.interactions.set(pageId, []);
    }
    
    const timestamps = this.interactions.get(pageId)!;
    
    // Clean old timestamps
    const recentTimestamps = timestamps.filter(t => t > oneHourAgo);
    this.interactions.set(pageId, recentTimestamps);
    
    // Check limits
    const lastMinuteCount = recentTimestamps.filter(t => t > oneMinuteAgo).length;
    const lastHourCount = recentTimestamps.length;
    
    if (lastMinuteCount >= this.maxInteractionsPerMinute) {
      return {
        safe: false,
        reason: 'Rate limit exceeded: too many interactions per minute',
        riskLevel: 'high'
      };
    }
    
    if (lastHourCount >= this.maxInteractionsPerHour) {
      return {
        safe: false,
        reason: 'Rate limit exceeded: too many interactions per hour',
        riskLevel: 'high'
      };
    }
    
    // Record this interaction
    recentTimestamps.push(now);
    
    const result: SafetyCheck = { safe: true, riskLevel: 'low', warnings: [] };
    
    // Warn if approaching limits
    if (lastMinuteCount > this.maxInteractionsPerMinute * 0.8) {
      result.warnings?.push('Approaching per-minute rate limit');
      result.riskLevel = 'medium';
    }
    
    if (lastHourCount > this.maxInteractionsPerHour * 0.8) {
      result.warnings?.push('Approaching per-hour rate limit');
      result.riskLevel = 'medium';
    }
    
    return result;
  }
  
  reset(pageId?: string): void {
    if (pageId) {
      this.interactions.delete(pageId);
    } else {
      this.interactions.clear();
    }
  }
}

// Global rate limiter instance
export const globalRateLimiter = new InteractionRateLimiter();
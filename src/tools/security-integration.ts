import { validateInput, sanitizeHTML, validateJavaScript, validateURL, validateSelector } from '../utils/validation.js';
import { MCPServerError, MCP_ERROR_CODES } from '../types.js';
import { logError, logWarning, logInfo } from '../utils/errors.js';
import * as browserSchemas from './validation/browser-schemas.js';
import * as pageSchemas from './validation/page-schemas.js';

/**
 * Security Integration Layer for Advanced Browser and Page Tools
 * Provides comprehensive security validation and sanitization
 */

export interface SecurityPolicy {
  allowJavaScriptExecution: boolean;
  allowFileAccess: boolean;
  allowNetworkAccess: boolean;
  maxScriptSize: number;
  maxContentSize: number;
  allowedDomains: string[];
  blockedDomains: string[];
  allowedProtocols: string[];
  rateLimits: {
    scriptExecution: { windowMs: number; maxRequests: number };
    contentModification: { windowMs: number; maxRequests: number };
    networkRequests: { windowMs: number; maxRequests: number };
  };
}

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  allowJavaScriptExecution: true,
  allowFileAccess: false,
  allowNetworkAccess: true,
  maxScriptSize: 100000, // 100KB
  maxContentSize: 10000000, // 10MB
  allowedDomains: [],
  blockedDomains: ['localhost', '127.0.0.1', '0.0.0.0'],
  allowedProtocols: ['http:', 'https:', 'data:'],
  rateLimits: {
    scriptExecution: { windowMs: 60000, maxRequests: 50 },
    contentModification: { windowMs: 60000, maxRequests: 20 },
    networkRequests: { windowMs: 60000, maxRequests: 100 },
  },
};

export class SecurityValidator {
  private policy: SecurityPolicy;

  constructor(policy: SecurityPolicy = DEFAULT_SECURITY_POLICY) {
    this.policy = policy;
  }

  /**
   * Validate browser context creation parameters
   */
  validateContextCreation(params: any): any {
    const validated = validateInput(browserSchemas.BrowserNewContextSchema, params);

    // Validate permissions
    if (validated.permissions) {
      this.validatePermissions(validated.permissions);
    }

    // Validate HTTP headers
    if (validated.extraHTTPHeaders) {
      this.validateHTTPHeaders(validated.extraHTTPHeaders);
    }

    // Validate geolocation
    if (validated.geolocation) {
      this.validateGeolocation(validated.geolocation);
    }

    // Validate user agent
    if (validated.userAgent) {
      validated.userAgent = this.sanitizeUserAgent(validated.userAgent);
    }

    return validated;
  }

  /**
   * Validate JavaScript code execution
   */
  validateJavaScriptExecution(params: any): any {
    const validated = validateInput(pageSchemas.PageEvaluateSchema, params);

    if (!this.policy.allowJavaScriptExecution) {
      throw new MCPServerError(
        MCP_ERROR_CODES.UNAUTHORIZED,
        'JavaScript execution is disabled by security policy'
      );
    }

    // Validate script size
    if (validated.expression.length > this.policy.maxScriptSize) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        `JavaScript code exceeds maximum size of ${this.policy.maxScriptSize} characters`,
        { actualSize: validated.expression.length }
      );
    }

    // Validate JavaScript content
    validated.expression = this.sanitizeJavaScript(validated.expression);

    return validated;
  }

  /**
   * Validate HTML content setting
   */
  validateContentSetting(params: any): any {
    const validated = validateInput(pageSchemas.PageSetContentSchema, params);

    // Validate content size
    if (validated.html.length > this.policy.maxContentSize) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        `HTML content exceeds maximum size of ${this.policy.maxContentSize} characters`,
        { actualSize: validated.html.length }
      );
    }

    // Sanitize HTML content
    validated.html = this.sanitizeHTMLContent(validated.html);

    return validated;
  }

  /**
   * Validate script tag addition
   */
  validateScriptTagAddition(params: any): any {
    const validated = validateInput(pageSchemas.PageAddScriptTagSchema, params);

    if (!this.policy.allowJavaScriptExecution) {
      throw new MCPServerError(
        MCP_ERROR_CODES.UNAUTHORIZED,
        'Script tag addition is disabled by security policy'
      );
    }

    // Validate URL if provided
    if (validated.url) {
      this.validateURL(validated.url);
    }

    // Validate file path if provided
    if (validated.path) {
      if (!this.policy.allowFileAccess) {
        throw new MCPServerError(
          MCP_ERROR_CODES.UNAUTHORIZED,
          'File access is disabled by security policy'
        );
      }
      this.validateFilePath(validated.path);
    }

    // Validate inline content if provided
    if (validated.content) {
      if (validated.content.length > this.policy.maxScriptSize) {
        throw new MCPServerError(
          MCP_ERROR_CODES.INVALID_PARAMS,
          `Script content exceeds maximum size of ${this.policy.maxScriptSize} characters`
        );
      }
      validated.content = this.sanitizeJavaScript(validated.content);
    }

    return validated;
  }

  /**
   * Validate function exposure to page
   */
  validateFunctionExposure(params: any): any {
    const validated = validateInput(pageSchemas.PageExposeFunctionSchema, params);

    if (!this.policy.allowJavaScriptExecution) {
      throw new MCPServerError(
        MCP_ERROR_CODES.UNAUTHORIZED,
        'Function exposure is disabled by security policy'
      );
    }

    // Validate function name
    this.validateFunctionName(validated.name);

    // Validate function body size
    if (validated.playwrightFunction.length > this.policy.maxScriptSize) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        `Function body exceeds maximum size of ${this.policy.maxScriptSize} characters`
      );
    }

    // Sanitize function body
    validated.playwrightFunction = this.sanitizeJavaScript(validated.playwrightFunction);

    return validated;
  }

  /**
   * Validate browser permissions
   */
  validatePermissionGrant(params: any): any {
    const validated = validateInput(browserSchemas.BrowserGrantPermissionsSchema, params);

    // Validate permissions
    this.validatePermissions(validated.permissions);

    // Validate origin if provided
    if (validated.origin) {
      this.validateURL(validated.origin);
    }

    return validated;
  }

  /**
   * Validate geolocation setting
   */
  validateGeolocationSetting(params: any): any {
    const validated = validateInput(browserSchemas.BrowserSetGeolocationSchema, params);

    this.validateGeolocation(validated.geolocation);

    return validated;
  }

  /**
   * Validate HTTP headers
   */
  validateHTTPHeadersSetting(params: any): any {
    const validated = validateInput(browserSchemas.BrowserSetExtraHTTPHeadersSchema, params);

    this.validateHTTPHeaders(validated.headers);

    return validated;
  }

  private validatePermissions(permissions: string[]): void {
    const dangerousPermissions = ['camera', 'microphone', 'geolocation'];
    const requestedDangerous = permissions.filter(p => dangerousPermissions.includes(p));

    if (requestedDangerous.length > 0) {
      logWarning(`Security: Granting potentially sensitive permissions: ${requestedDangerous.join(', ')}`);
    }

    // Log all permission grants for auditing
    logInfo(`Security: Granting permissions: ${permissions.join(', ')}`);
  }

  private validateHTTPHeaders(headers: Record<string, string>): void {
    const sensitiveHeaders = [
      'authorization', 'cookie', 'set-cookie', 'x-auth-token',
      'x-api-key', 'x-session-token'
    ];

    for (const [name, value] of Object.entries(headers)) {
      // Check for sensitive headers
      if (sensitiveHeaders.includes(name.toLowerCase())) {
        logWarning(`Security: Setting sensitive HTTP header: ${name}`);
      }

      // Validate header value
      if (value.length > 4096) {
        throw new MCPServerError(
          MCP_ERROR_CODES.INVALID_PARAMS,
          `HTTP header value too long: ${name}`,
          { maxLength: 4096, actualLength: value.length }
        );
      }

      // Check for suspicious patterns
      if (this.containsSuspiciousPatterns(value)) {
        throw new MCPServerError(
          MCP_ERROR_CODES.INVALID_PARAMS,
          `HTTP header contains suspicious content: ${name}`
        );
      }
    }
  }

  private validateGeolocation(geolocation: { latitude: number; longitude: number; accuracy?: number }): void {
    // Validate coordinate ranges (already done by schema, but double-check)
    if (geolocation.latitude < -90 || geolocation.latitude > 90) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        'Invalid latitude coordinate',
        { latitude: geolocation.latitude }
      );
    }

    if (geolocation.longitude < -180 || geolocation.longitude > 180) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        'Invalid longitude coordinate',
        { longitude: geolocation.longitude }
      );
    }

    logInfo(`Security: Setting geolocation to ${geolocation.latitude}, ${geolocation.longitude}`);
  }

  private sanitizeUserAgent(userAgent: string): string {
    // Remove potentially malicious content
    let sanitized = userAgent
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/vbscript:/gi, '')
      .trim();

    if (sanitized.length > 500) {
      sanitized = sanitized.substring(0, 500);
      logWarning('Security: User agent string truncated to 500 characters');
    }

    return sanitized;
  }

  private sanitizeJavaScript(code: string): string {
    // Basic JavaScript sanitization
    let sanitized = code;

    // Remove potentially dangerous patterns
    const dangerousPatterns = [
      /eval\s*\(/gi,
      /Function\s*\(/gi,
      /setTimeout\s*\(\s*['"`].*?['"`]/gi,
      /setInterval\s*\(\s*['"`].*?['"`]/gi,
      /document\.write/gi,
      /document\.writeln/gi,
    ];

    let hadDangerous = false;
    for (const pattern of dangerousPatterns) {
      if (pattern.test(sanitized)) {
        hadDangerous = true;
        sanitized = sanitized.replace(pattern, '/* BLOCKED_BY_SECURITY_POLICY */');
      }
    }

    if (hadDangerous) {
      logWarning('Security: Removed dangerous JavaScript patterns from code');
    }

    return sanitized;
  }

  private sanitizeHTMLContent(html: string): string {
    return sanitizeHTML(html);
  }

  private validateURL(url: string): void {
    try {
      const urlObj = new URL(url);

      // Check protocol
      if (!this.policy.allowedProtocols.includes(urlObj.protocol)) {
        throw new MCPServerError(
          MCP_ERROR_CODES.INVALID_PARAMS,
          `Protocol not allowed: ${urlObj.protocol}`,
          { allowedProtocols: this.policy.allowedProtocols }
        );
      }

      // Check blocked domains
      if (this.policy.blockedDomains.includes(urlObj.hostname)) {
        throw new MCPServerError(
          MCP_ERROR_CODES.UNAUTHORIZED,
          `Domain is blocked: ${urlObj.hostname}`
        );
      }

      // Check allowed domains (if specified)
      if (this.policy.allowedDomains.length > 0 && 
          !this.policy.allowedDomains.includes(urlObj.hostname)) {
        throw new MCPServerError(
          MCP_ERROR_CODES.UNAUTHORIZED,
          `Domain not in allowed list: ${urlObj.hostname}`
        );
      }

    } catch (error) {
      if (error instanceof MCPServerError) {
        throw error;
      }
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        `Invalid URL format: ${url}`
      );
    }
  }

  private validateFilePath(path: string): void {
    // Prevent directory traversal
    if (path.includes('..') || path.includes('~')) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        'File path contains directory traversal patterns'
      );
    }

    // Only allow specific file extensions
    const allowedExtensions = ['.js', '.mjs', '.css', '.html', '.json'];
    const hasAllowedExtension = allowedExtensions.some(ext => path.toLowerCase().endsWith(ext));

    if (!hasAllowedExtension) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        'File extension not allowed',
        { allowedExtensions }
      );
    }
  }

  private validateFunctionName(name: string): void {
    // Ensure it's a valid JavaScript identifier
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        'Invalid function name: must be a valid JavaScript identifier'
      );
    }

    // Prevent overriding dangerous globals
    const dangerousNames = [
      'eval', 'Function', 'setTimeout', 'setInterval', 'XMLHttpRequest',
      'fetch', 'importScripts', 'open', 'close', 'postMessage'
    ];

    if (dangerousNames.includes(name)) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        `Function name is reserved: ${name}`
      );
    }
  }

  private containsSuspiciousPatterns(value: string): boolean {
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /vbscript:/i,
      /data:text\/html/i,
      /onload=/i,
      /onerror=/i,
    ];

    return suspiciousPatterns.some(pattern => pattern.test(value));
  }

  /**
   * Update security policy
   */
  updatePolicy(newPolicy: Partial<SecurityPolicy>): void {
    this.policy = { ...this.policy, ...newPolicy };
    logInfo('Security: Policy updated');
  }

  /**
   * Get current security policy
   */
  getPolicy(): SecurityPolicy {
    return { ...this.policy };
  }
}

// Export singleton instance
export const securityValidator = new SecurityValidator();

/**
 * Decorator for tool functions to add security validation
 */
export function withSecurity<T extends any[], R>(
  validationFn: (params: any) => any,
  toolFn: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    try {
      // Validate the first argument (usually contains params)
      if (args.length > 0) {
        validationFn(args[0]);
      }
      
      return await toolFn(...args);
    } catch (error) {
      if (error instanceof MCPServerError) {
        throw error;
      }
      
      logError(error, 'Security validation failed');
      throw new MCPServerError(
        MCP_ERROR_CODES.INTERNAL_ERROR,
        'Security validation failed',
        { originalError: error.message }
      );
    }
  };
}
import { z } from 'zod';
import { MCPServerError, MCP_ERROR_CODES } from '../types.js';

/**
 * Validates input parameters against a Zod schema
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.errors.map(err => ({
        path: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));

      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        'Parameter validation failed',
        { validationErrors: issues }
      );
    }
    throw error;
  }
}

/**
 * Sanitizes HTML content by removing potentially dangerous elements
 */
export function sanitizeHTML(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>/gi, '')
    .replace(/<object\b[^>]*>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/data:text\/html/gi, '');
}

/**
 * Validates and sanitizes CSS selector
 */
export function validateSelector(selector: string): string {
  if (!selector || selector.trim() === '') {
    throw new MCPServerError(
      MCP_ERROR_CODES.INVALID_PARAMS,
      'Selector cannot be empty'
    );
  }

  const sanitized = selector.trim();

  // Basic validation - check for potentially dangerous patterns
  const dangerousPatterns = [
    /javascript:/i,
    /vbscript:/i,
    /data:text\/html/i,
    /<script/i,
    /<iframe/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(sanitized)) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        'Selector contains potentially dangerous content',
        { selector: sanitized }
      );
    }
  }

  return sanitized;
}

/**
 * Validates URL and ensures it's safe to navigate to
 */
export function validateNavigationURL(url: string): string {
  try {
    const parsedURL = new URL(url);
    
    // Allow only safe protocols
    const allowedProtocols = ['http:', 'https:', 'file:'];
    if (!allowedProtocols.includes(parsedURL.protocol)) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        `Protocol '${parsedURL.protocol}' is not allowed`,
        { url, protocol: parsedURL.protocol }
      );
    }

    // Block local network addresses in production (configurable)
    if (process.env.NODE_ENV === 'production') {
      const hostname = parsedURL.hostname;
      const blockedPatterns = [
        /^localhost$/i,
        /^127\./,
        /^192\.168\./,
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[01])\./,
        /^::1$/,
        /^fc00::/i,
      ];

      for (const pattern of blockedPatterns) {
        if (pattern.test(hostname)) {
          throw new MCPServerError(
            MCP_ERROR_CODES.INVALID_PARAMS,
            `Access to local network addresses is not allowed in production`,
            { url, hostname }
          );
        }
      }
    }

    return url;
  } catch (error) {
    if (error instanceof MCPServerError) {
      throw error;
    }
    throw new MCPServerError(
      MCP_ERROR_CODES.INVALID_PARAMS,
      `Invalid URL: ${url}`,
      { url, error: String(error) }
    );
  }
}

/**
 * Validates file path for screenshots
 */
export function validateFilePath(path: string): string {
  const sanitized = path.trim();
  
  // Prevent directory traversal
  if (sanitized.includes('..')) {
    throw new MCPServerError(
      MCP_ERROR_CODES.INVALID_PARAMS,
      'Path traversal is not allowed',
      { path }
    );
  }

  // Ensure file extension is safe
  const allowedExtensions = ['.png', '.jpg', '.jpeg', '.pdf'];
  const hasValidExtension = allowedExtensions.some(ext => 
    sanitized.toLowerCase().endsWith(ext)
  );

  if (!hasValidExtension) {
    throw new MCPServerError(
      MCP_ERROR_CODES.INVALID_PARAMS,
      `File extension must be one of: ${allowedExtensions.join(', ')}`,
      { path, allowedExtensions }
    );
  }

  return sanitized;
}

/**
 * Validates viewport dimensions
 */
export function validateViewport(width: number, height: number): { width: number; height: number } {
  if (!Number.isInteger(width) || width < 1 || width > 4096) {
    throw new MCPServerError(
      MCP_ERROR_CODES.INVALID_PARAMS,
      'Viewport width must be an integer between 1 and 4096',
      { width }
    );
  }

  if (!Number.isInteger(height) || height < 1 || height > 4096) {
    throw new MCPServerError(
      MCP_ERROR_CODES.INVALID_PARAMS,
      'Viewport height must be an integer between 1 and 4096',
      { height }
    );
  }

  return { width, height };
}

/**
 * Validates timeout values
 */
export function validateTimeout(timeout: number): number {
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 300000) {
    throw new MCPServerError(
      MCP_ERROR_CODES.INVALID_PARAMS,
      'Timeout must be an integer between 1000 and 300000 (1-300 seconds)',
      { timeout }
    );
  }

  return timeout;
}

/**
 * Validates text input for typing operations
 */
export function validateTextInput(text: string): string {
  if (typeof text !== 'string') {
    throw new MCPServerError(
      MCP_ERROR_CODES.INVALID_PARAMS,
      'Text input must be a string',
      { provided: typeof text }
    );
  }

  // Limit text length to prevent abuse
  if (text.length > 10000) {
    throw new MCPServerError(
      MCP_ERROR_CODES.INVALID_PARAMS,
      'Text input cannot exceed 10,000 characters',
      { length: text.length }
    );
  }

  return text;
}

/**
 * Validates browser launch arguments
 */
export function validateBrowserArgs(args: string[]): string[] {
  const dangerousArgs = [
    '--allow-running-insecure-content',
    '--disable-security-features',
    '--disable-web-security',
    '--allow-cross-origin-auth-prompt',
  ];

  for (const arg of args) {
    for (const dangerous of dangerousArgs) {
      if (arg.toLowerCase().includes(dangerous)) {
        throw new MCPServerError(
          MCP_ERROR_CODES.INVALID_PARAMS,
          `Browser argument '${arg}' is not allowed for security reasons`,
          { arg, dangerous }
        );
      }
    }
  }

  return args;
}

/**
 * Rate limiting validation
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  /**
   * Checks if a request should be allowed
   */
  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get or create request history for this identifier
    const requests = this.requests.get(identifier) || [];
    
    // Filter out old requests
    const recentRequests = requests.filter(time => time > windowStart);
    
    // Update the history
    this.requests.set(identifier, recentRequests);

    // Check if limit exceeded
    if (recentRequests.length >= this.maxRequests) {
      return false;
    }

    // Add current request
    recentRequests.push(now);
    this.requests.set(identifier, recentRequests);

    return true;
  }

  /**
   * Gets remaining requests for identifier
   */
  getRemainingRequests(identifier: string): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const requests = this.requests.get(identifier) || [];
    const recentRequests = requests.filter(time => time > windowStart);
    
    return Math.max(0, this.maxRequests - recentRequests.length);
  }

  /**
   * Clears rate limit history (for testing)
   */
  clear(): void {
    this.requests.clear();
  }
}

/**
 * Security validation for user agent strings
 */
export function validateUserAgent(userAgent: string): string {
  const sanitized = userAgent.trim();
  
  if (sanitized.length > 500) {
    throw new MCPServerError(
      MCP_ERROR_CODES.INVALID_PARAMS,
      'User agent string is too long (max 500 characters)',
      { length: sanitized.length }
    );
  }

  // Block potentially malicious patterns
  const blockedPatterns = [
    /<script/i,
    /javascript:/i,
    /vbscript:/i,
    /data:text\/html/i,
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(sanitized)) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        'User agent contains potentially malicious content',
        { userAgent: sanitized }
      );
    }
  }

  return sanitized;
}
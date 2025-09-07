import { 
  MCPError, 
  MCP_ERROR_CODES, 
  MCPServerError, 
  BrowserSessionError, 
  ElementNotFoundError, 
  NavigationError 
} from '../types.js';

/**
 * Creates a standardized MCP error response
 */
export function createMCPError(
  code: number, 
  message: string, 
  data?: unknown
): MCPError {
  return {
    code,
    message,
    data,
  };
}

/**
 * Converts various error types to MCP errors
 */
export function toMCPError(error: unknown): MCPError {
  // Handle known MCP errors
  if (error instanceof MCPServerError) {
    return createMCPError(error.code, error.message, error.data);
  }

  // Handle browser session errors
  if (error instanceof BrowserSessionError) {
    return createMCPError(
      MCP_ERROR_CODES.RESOURCE_NOT_FOUND,
      error.message,
      {
        sessionId: error.sessionId,
        browserType: error.browserType,
      }
    );
  }

  // Handle element not found errors
  if (error instanceof ElementNotFoundError) {
    return createMCPError(
      MCP_ERROR_CODES.RESOURCE_NOT_FOUND,
      error.message,
      {
        selector: error.selector,
        pageId: error.pageId,
      }
    );
  }

  // Handle navigation errors
  if (error instanceof NavigationError) {
    return createMCPError(
      MCP_ERROR_CODES.INTERNAL_ERROR,
      error.message,
      {
        url: error.url,
        reason: error.reason,
      }
    );
  }

  // Handle Playwright timeout errors
  if (error instanceof Error && error.name === 'TimeoutError') {
    return createMCPError(
      MCP_ERROR_CODES.TIMEOUT,
      `Operation timed out: ${error.message}`,
      { originalError: error.message }
    );
  }

  // Handle Playwright network errors
  if (error instanceof Error && error.message.includes('net::')) {
    return createMCPError(
      MCP_ERROR_CODES.INTERNAL_ERROR,
      `Network error: ${error.message}`,
      { originalError: error.message }
    );
  }

  // Handle validation errors (from Zod)
  if (error && typeof error === 'object' && 'issues' in error) {
    const zodError = error as { issues: Array<{ path: string[]; message: string }> };
    const issues = zodError.issues.map(issue => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    
    return createMCPError(
      MCP_ERROR_CODES.INVALID_PARAMS,
      'Invalid parameters provided',
      { validationErrors: issues }
    );
  }

  // Handle generic errors
  if (error instanceof Error) {
    return createMCPError(
      MCP_ERROR_CODES.INTERNAL_ERROR,
      error.message,
      { originalError: error.message, stack: error.stack }
    );
  }

  // Handle unknown errors
  return createMCPError(
    MCP_ERROR_CODES.INTERNAL_ERROR,
    'An unknown error occurred',
    { originalError: String(error) }
  );
}

/**
 * Error helper functions for common scenarios
 */
export const ErrorHelpers = {
  /**
   * Creates a method not found error
   */
  methodNotFound(method: string): MCPError {
    return createMCPError(
      MCP_ERROR_CODES.METHOD_NOT_FOUND,
      `Method '${method}' not found`,
      { method }
    );
  },

  /**
   * Creates an invalid request error
   */
  invalidRequest(message: string, data?: unknown): MCPError {
    return createMCPError(
      MCP_ERROR_CODES.INVALID_REQUEST,
      message,
      data
    );
  },

  /**
   * Creates an invalid parameters error
   */
  invalidParams(message: string, data?: unknown): MCPError {
    return createMCPError(
      MCP_ERROR_CODES.INVALID_PARAMS,
      message,
      data
    );
  },

  /**
   * Creates a resource not found error
   */
  resourceNotFound(resource: string, id?: string): MCPError {
    return createMCPError(
      MCP_ERROR_CODES.RESOURCE_NOT_FOUND,
      `${resource} not found${id ? `: ${id}` : ''}`,
      { resource, id }
    );
  },

  /**
   * Creates an unauthorized error
   */
  unauthorized(message: string = 'Unauthorized access'): MCPError {
    return createMCPError(
      MCP_ERROR_CODES.UNAUTHORIZED,
      message
    );
  },

  /**
   * Creates a rate limited error
   */
  rateLimited(retryAfter?: number): MCPError {
    return createMCPError(
      MCP_ERROR_CODES.RATE_LIMITED,
      'Request rate limit exceeded',
      { retryAfter }
    );
  },

  /**
   * Creates a timeout error
   */
  timeout(operation: string, timeoutMs: number): MCPError {
    return createMCPError(
      MCP_ERROR_CODES.TIMEOUT,
      `${operation} timed out after ${timeoutMs}ms`,
      { operation, timeout: timeoutMs }
    );
  },

  /**
   * Creates a browser session error
   */
  browserSession(message: string, sessionId?: string): MCPError {
    return createMCPError(
      MCP_ERROR_CODES.RESOURCE_NOT_FOUND,
      `Browser session error: ${message}`,
      { sessionId }
    );
  },

  /**
   * Creates an element interaction error
   */
  elementInteraction(selector: string, action: string, reason: string): MCPError {
    return createMCPError(
      MCP_ERROR_CODES.INTERNAL_ERROR,
      `Failed to ${action} element '${selector}': ${reason}`,
      { selector, action, reason }
    );
  },
};

/**
 * Async error wrapper that converts errors to MCP format
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>
): Promise<{ result?: T; error?: MCPError }> {
  try {
    const result = await operation();
    return { result };
  } catch (error) {
    return { error: toMCPError(error) };
  }
}

/**
 * Validates that required parameters exist
 */
export function validateRequired(
  params: Record<string, unknown>,
  required: string[]
): void {
  const missing = required.filter(key => !(key in params) || params[key] === undefined);
  
  if (missing.length > 0) {
    throw new MCPServerError(
      MCP_ERROR_CODES.INVALID_PARAMS,
      `Missing required parameters: ${missing.join(', ')}`,
      { missing }
    );
  }
}

/**
 * Ensures a value is a string and not empty
 */
export function validateString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new MCPServerError(
      MCP_ERROR_CODES.INVALID_PARAMS,
      `${name} must be a non-empty string`,
      { provided: typeof value, name }
    );
  }
  return value;
}

/**
 * Ensures a value is a valid UUID
 */
export function validateUUID(value: unknown, name: string): string {
  const str = validateString(value, name);
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (!uuidRegex.test(str)) {
    throw new MCPServerError(
      MCP_ERROR_CODES.INVALID_PARAMS,
      `${name} must be a valid UUID`,
      { provided: str, name }
    );
  }
  return str;
}

/**
 * Ensures a value is a valid URL
 */
export function validateURL(value: unknown, name: string): string {
  const str = validateString(value, name);
  
  try {
    new URL(str);
    return str;
  } catch {
    throw new MCPServerError(
      MCP_ERROR_CODES.INVALID_PARAMS,
      `${name} must be a valid URL`,
      { provided: str, name }
    );
  }
}

/**
 * Log and format errors for debugging
 */
export function logError(error: unknown, context?: string): void {
  const timestamp = new Date().toISOString();
  const contextStr = context ? ` [${context}]` : '';
  
  if (error instanceof Error) {
    console.error(`${timestamp}${contextStr} Error: ${error.message}`);
    if (error.stack) {
      console.error(`${timestamp}${contextStr} Stack:`, error.stack);
    }
  } else {
    console.error(`${timestamp}${contextStr} Unknown error:`, error);
  }
}
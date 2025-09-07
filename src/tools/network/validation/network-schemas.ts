import { z } from 'zod';

/**
 * Comprehensive Validation Schemas for Network & API Tools
 * Provides enterprise-grade input validation for all network operations
 */

// Common schemas used across multiple tools
const HTTPMethodSchema = z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);

const HTTPHeadersSchema = z.record(
  z.string().min(1).max(256),
  z.string().max(8192)
).refine(
  (headers) => Object.keys(headers).length <= 50,
  { message: 'Too many headers (max 50)' }
);

const URLSchema = z.string()
  .url()
  .max(4096, 'URL too long (max 4096 characters)')
  .refine(
    (url) => {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    },
    { message: 'Only HTTP and HTTPS protocols are allowed' }
  );

const TimeoutSchema = z.number()
  .min(1000, 'Timeout must be at least 1000ms')
  .max(300000, 'Timeout must not exceed 300000ms (5 minutes)')
  .default(30000);

const PageIdSchema = z.string().uuid('Invalid page ID format');

// ===============================================
// HTTP Request Tool Schemas (8 tools)
// ===============================================

export const APIRequestGetSchema = z.object({
  pageId: PageIdSchema,
  url: URLSchema,
  headers: HTTPHeadersSchema.optional(),
  queryParams: z.record(z.string(), z.string()).optional(),
  timeout: TimeoutSchema.optional(),
  followRedirects: z.boolean().default(true),
  maxRedirects: z.number().min(0).max(20).default(5),
  validateTLS: z.boolean().default(true),
});

export const APIRequestPostSchema = z.object({
  pageId: PageIdSchema,
  url: URLSchema,
  headers: HTTPHeadersSchema.optional(),
  body: z.union([
    z.string().max(50 * 1024 * 1024), // 50MB max for string body
    z.object({}).passthrough(), // Allow any object structure for JSON
    z.instanceof(Buffer),
  ]).optional(),
  contentType: z.enum([
    'application/json',
    'application/x-www-form-urlencoded',
    'text/plain',
    'application/xml',
    'multipart/form-data'
  ]).optional(),
  timeout: TimeoutSchema.optional(),
  followRedirects: z.boolean().default(true),
  maxRedirects: z.number().min(0).max(20).default(5),
});

export const APIRequestPutSchema = APIRequestPostSchema;
export const APIRequestPatchSchema = APIRequestPostSchema;
export const APIRequestDeleteSchema = APIRequestGetSchema;
export const APIRequestHeadSchema = APIRequestGetSchema;
export const APIRequestOptionsSchema = APIRequestGetSchema;

export const APIRequestMultipartSchema = z.object({
  pageId: PageIdSchema,
  url: URLSchema,
  headers: HTTPHeadersSchema.optional(),
  formData: z.record(z.string(), z.union([
    z.string(),
    z.object({
      name: z.string().min(1).max(255),
      content: z.instanceof(Buffer).refine(
        (buffer) => buffer.length <= 10 * 1024 * 1024,
        { message: 'File size must not exceed 10MB' }
      ),
      contentType: z.string().optional(),
    }),
  ])),
  timeout: TimeoutSchema.optional(),
  maxTotalSize: z.number().min(1).max(50 * 1024 * 1024).default(50 * 1024 * 1024),
});

// ===============================================
// Network Interception Tool Schemas (8 tools)
// ===============================================

export const NetworkInterceptEnableSchema = z.object({
  pageId: PageIdSchema,
  patterns: z.array(z.object({
    urlPattern: z.union([z.string(), z.instanceof(RegExp)]),
    method: HTTPMethodSchema.optional(),
    resourceType: z.enum([
      'document', 'stylesheet', 'image', 'media', 'font', 
      'script', 'texttrack', 'xhr', 'fetch', 'websocket', 'other'
    ]).optional(),
    action: z.enum(['continue', 'abort', 'mock']),
    mockResponse: z.object({
      status: z.number().min(100).max(599),
      statusText: z.string().max(255).optional(),
      headers: HTTPHeadersSchema.optional(),
      body: z.union([z.string(), z.instanceof(Buffer)]).optional(),
      delay: z.number().min(0).max(30000).optional(), // Max 30 second delay
    }).optional(),
    failure: z.object({
      errorText: z.string().min(1).max(255),
      errorCode: z.number().optional(),
    }).optional(),
    modifyHeaders: HTTPHeadersSchema.optional(),
    modifyBody: z.union([z.string(), z.instanceof(Buffer)]).optional(),
  })).min(1).max(50), // Max 50 patterns per page
});

export const NetworkInterceptDisableSchema = z.object({
  pageId: PageIdSchema,
});

export const NetworkMockResponseSchema = z.object({
  pageId: PageIdSchema,
  urlPattern: z.union([z.string(), z.instanceof(RegExp)]),
  mockResponse: z.object({
    status: z.number().min(100).max(599),
    statusText: z.string().max(255).optional(),
    headers: HTTPHeadersSchema.optional(),
    body: z.union([z.string(), z.instanceof(Buffer)]).optional(),
    delay: z.number().min(0).max(30000).optional(),
  }),
});

export const NetworkMockFailureSchema = z.object({
  pageId: PageIdSchema,
  urlPattern: z.union([z.string(), z.instanceof(RegExp)]),
  errorText: z.string().min(1).max(255),
  errorCode: z.number().optional(),
});

export const NetworkContinueRequestSchema = z.object({
  pageId: PageIdSchema,
  requestId: z.string().min(1),
  modifyHeaders: HTTPHeadersSchema.optional(),
  modifyBody: z.union([z.string(), z.instanceof(Buffer)]).optional(),
  modifyUrl: URLSchema.optional(),
});

export const NetworkAbortRequestSchema = z.object({
  pageId: PageIdSchema,
  requestId: z.string().min(1),
  errorCode: z.string().min(1).max(50).default('failed'),
});

export const NetworkGetRequestsSchema = z.object({
  pageId: PageIdSchema,
  filter: z.object({
    method: HTTPMethodSchema.optional(),
    urlPattern: z.union([z.string(), z.instanceof(RegExp)]).optional(),
    resourceType: z.string().optional(),
    limit: z.number().min(1).max(1000).default(100),
  }).optional(),
});

export const NetworkGetResponsesSchema = z.object({
  pageId: PageIdSchema,
  filter: z.object({
    status: z.number().min(100).max(599).optional(),
    urlPattern: z.union([z.string(), z.instanceof(RegExp)]).optional(),
    fromCache: z.boolean().optional(),
    limit: z.number().min(1).max(1000).default(100),
  }).optional(),
});

// ===============================================
// Authentication Tool Schemas (4 tools)
// ===============================================

export const APISetAuthBearerSchema = z.object({
  sessionId: z.string().min(1).max(128),
  token: z.string().min(1).max(4096),
  expiry: z.date().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const APISetAuthBasicSchema = z.object({
  sessionId: z.string().min(1).max(128),
  username: z.string().min(1).max(255),
  password: z.string().min(1).max(255),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const APISetAuthCustomSchema = z.object({
  sessionId: z.string().min(1).max(128),
  headers: HTTPHeadersSchema,
  queryParams: z.record(z.string(), z.string()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const APIClearAuthSchema = z.object({
  sessionId: z.string().min(1).max(128),
});

// ===============================================
// Network Configuration Tool Schemas (4 tools)
// ===============================================

export const NetworkSetOfflineSchema = z.object({
  pageId: PageIdSchema,
  offline: z.boolean(),
});

export const NetworkSetUserAgentSchema = z.object({
  pageId: PageIdSchema,
  userAgent: z.string()
    .min(1, 'User agent cannot be empty')
    .max(500, 'User agent too long (max 500 characters)')
    .refine(
      (ua) => !/<script|javascript:|vbscript:/i.test(ua),
      { message: 'User agent contains suspicious content' }
    ),
});

export const NetworkSetExtraHeadersSchema = z.object({
  pageId: PageIdSchema,
  headers: HTTPHeadersSchema,
  overwrite: z.boolean().default(false),
});

export const NetworkClearHeadersSchema = z.object({
  pageId: PageIdSchema,
  headerNames: z.array(z.string().min(1).max(256)).optional(),
});

// ===============================================
// API Testing Framework Schemas
// ===============================================

export const APITestRequestSchema = z.object({
  pageId: PageIdSchema,
  testName: z.string().min(1).max(255),
  request: z.object({
    url: URLSchema,
    method: HTTPMethodSchema,
    headers: HTTPHeadersSchema.optional(),
    body: z.union([
      z.string(),
      z.object({}).passthrough(),
      z.instanceof(Buffer)
    ]).optional(),
    timeout: TimeoutSchema.optional(),
  }),
  assertions: z.array(z.object({
    type: z.enum(['status', 'header', 'body', 'responseTime', 'jsonPath', 'regex']),
    target: z.string().optional(), // Header name, JSON path, etc.
    operator: z.enum(['equals', 'contains', 'matches', 'lessThan', 'greaterThan', 'exists']),
    value: z.any(),
    message: z.string().max(255).optional(),
  })).min(1).max(50),
  retries: z.number().min(0).max(5).default(0),
  retryDelay: z.number().min(100).max(30000).default(1000),
});

export const APITestSuiteSchema = z.object({
  pageId: PageIdSchema,
  suiteName: z.string().min(1).max(255),
  tests: z.array(APITestRequestSchema).min(1).max(100),
  parallel: z.boolean().default(false),
  stopOnFailure: z.boolean().default(false),
  timeout: z.number().min(1000).max(600000).default(300000), // 5 minutes max
});

// ===============================================
// Security Policy Schemas
// ===============================================

export const SecurityPolicySchema = z.object({
  allowedDomains: z.array(z.string().max(255)).default([]),
  blockedDomains: z.array(z.string().max(255)).default([]),
  allowedProtocols: z.array(z.enum(['http:', 'https:', 'ws:', 'wss:'])).default(['http:', 'https:']),
  blockedPorts: z.array(z.number().min(1).max(65535)).default([]),
  allowPrivateNetworks: z.boolean().default(false),
  allowLoopback: z.boolean().default(false),
  allowMetadataEndpoints: z.boolean().default(false),
  maxRedirects: z.number().min(0).max(20).default(5),
  dnsResolutionTimeout: z.number().min(1000).max(30000).default(5000),
});

export const RateLimitConfigSchema = z.object({
  windowMs: z.number().min(1000).max(3600000).default(60000), // 1 second to 1 hour
  maxRequests: z.number().min(1).max(10000).default(100),
});

export const HTTPClientConfigSchema = z.object({
  maxRequestSize: z.number().min(1024).max(100 * 1024 * 1024).default(50 * 1024 * 1024), // 1KB to 100MB
  maxResponseSize: z.number().min(1024).max(500 * 1024 * 1024).default(100 * 1024 * 1024), // 1KB to 500MB
  defaultTimeout: TimeoutSchema,
  userAgent: z.string().min(1).max(500),
  enableMetrics: z.boolean().default(true),
  rateLimit: RateLimitConfigSchema,
});

// ===============================================
// Response Filtering Schemas
// ===============================================

export const ResponseFilterSchema = z.object({
  removeSensitiveHeaders: z.boolean().default(true),
  maskPII: z.boolean().default(true),
  maxBodySize: z.number().min(0).max(100 * 1024 * 1024).default(10 * 1024 * 1024), // 10MB default
  allowedContentTypes: z.array(z.string()).default([
    'application/json',
    'application/xml',
    'text/html',
    'text/plain',
    'text/css',
    'application/javascript'
  ]),
});

// ===============================================
// Type Exports
// ===============================================

export type APIRequestGet = z.infer<typeof APIRequestGetSchema>;
export type APIRequestPost = z.infer<typeof APIRequestPostSchema>;
export type APIRequestMultipart = z.infer<typeof APIRequestMultipartSchema>;
export type NetworkInterceptEnable = z.infer<typeof NetworkInterceptEnableSchema>;
export type NetworkMockResponse = z.infer<typeof NetworkMockResponseSchema>;
export type APISetAuthBearer = z.infer<typeof APISetAuthBearerSchema>;
export type APISetAuthBasic = z.infer<typeof APISetAuthBasicSchema>;
export type APISetAuthCustom = z.infer<typeof APISetAuthCustomSchema>;
export type NetworkSetOffline = z.infer<typeof NetworkSetOfflineSchema>;
export type NetworkSetUserAgent = z.infer<typeof NetworkSetUserAgentSchema>;
export type NetworkSetExtraHeaders = z.infer<typeof NetworkSetExtraHeadersSchema>;
export type APITestRequest = z.infer<typeof APITestRequestSchema>;
export type APITestSuite = z.infer<typeof APITestSuiteSchema>;
export type SecurityPolicy = z.infer<typeof SecurityPolicySchema>;
export type HTTPClientConfig = z.infer<typeof HTTPClientConfigSchema>;
export type ResponseFilter = z.infer<typeof ResponseFilterSchema>;

// ===============================================
// Schema Validation Helpers
// ===============================================

export function validateNetworkToolInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown,
  toolName: string
): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => 
        `${issue.path.join('.')}: ${issue.message}`
      ).join(', ');
      
      throw new Error(`Validation failed for ${toolName}: ${issues}`);
    }
    throw error;
  }
}

export function createSchemaValidator<T>(schema: z.ZodSchema<T>) {
  return (input: unknown): T => {
    return schema.parse(input);
  };
}

// Pre-created validators for common use
export const validateAPIRequestGet = createSchemaValidator(APIRequestGetSchema);
export const validateAPIRequestPost = createSchemaValidator(APIRequestPostSchema);
export const validateNetworkInterceptEnable = createSchemaValidator(NetworkInterceptEnableSchema);
export const validateAPISetAuthBearer = createSchemaValidator(APISetAuthBearerSchema);
export const validateNetworkSetOffline = createSchemaValidator(NetworkSetOfflineSchema);
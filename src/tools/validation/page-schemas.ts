import { z } from 'zod';

/**
 * Validation schemas for advanced page management tools
 */

// Page Content & State Schemas
export const PageSetContentSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
  html: z.string().min(1).max(10000000), // 10MB limit
  waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).optional().default('load'),
  timeout: z.number().min(1000).max(300000).optional().default(30000),
});

export const PageGetInnerHTMLSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
  selector: z.string().min(1).optional(),
  timeout: z.number().min(1000).max(60000).optional().default(30000),
});

export const PageGetOuterHTMLSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
  selector: z.string().min(1).optional(),
  timeout: z.number().min(1000).max(60000).optional().default(30000),
});

export const PageEvaluateSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
  expression: z.string().min(1).max(100000), // 100KB limit for safety
  args: z.array(z.any()).optional(),
  timeout: z.number().min(1000).max(300000).optional().default(30000),
});

export const PageEvaluateHandleSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
  expression: z.string().min(1).max(100000),
  args: z.array(z.any()).optional(),
  timeout: z.number().min(1000).max(300000).optional().default(30000),
});

export const PageAddScriptTagSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
  url: z.string().url().optional(),
  path: z.string().optional(),
  content: z.string().optional(),
  type: z.string().optional().default('text/javascript'),
}).refine(data => 
  (data.url && !data.path && !data.content) ||
  (!data.url && data.path && !data.content) ||
  (!data.url && !data.path && data.content), {
    message: 'Exactly one of url, path, or content must be provided',
  });

export const PageAddStyleTagSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
  url: z.string().url().optional(),
  path: z.string().optional(),
  content: z.string().optional(),
}).refine(data => 
  (data.url && !data.path && !data.content) ||
  (!data.url && data.path && !data.content) ||
  (!data.url && !data.path && data.content), {
    message: 'Exactly one of url, path, or content must be provided',
  });

export const PageExposeFunctionSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
  name: z.string().min(1).max(100).regex(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/, 'Function name must be a valid JavaScript identifier'),
  playwrightFunction: z.string().min(1).max(10000), // Function body as string
});

// Page Events & Monitoring Schemas
export const PageWaitForEventSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
  event: z.enum([
    'console',
    'dialog',
    'download',
    'filechooser',
    'frameattached',
    'framedetached',
    'framenavigated',
    'load',
    'domcontentloaded',
    'networkidle',
    'pageerror',
    'popup',
    'request',
    'requestfailed',
    'requestfinished',
    'response',
    'websocket',
    'worker',
    'close',
  ]),
  timeout: z.number().min(1000).max(300000).optional().default(30000),
  predicate: z.string().optional(), // JavaScript predicate function as string
});

export const PageWaitForFunctionSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
  expression: z.string().min(1).max(10000),
  args: z.array(z.any()).optional(),
  timeout: z.number().min(1000).max(300000).optional().default(30000),
  polling: z.union([
    z.number().min(100),
    z.literal('raf'),
  ]).optional().default(100),
});

export const PageWaitForSelectorSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
  selector: z.string().min(1),
  timeout: z.number().min(1000).max(300000).optional().default(30000),
  state: z.enum(['attached', 'detached', 'visible', 'hidden']).optional().default('visible'),
});

export const PageWaitForTimeoutSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
  timeout: z.number().min(100).max(300000),
});

export const PageGetConsoleMessagesSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
  limit: z.number().min(1).max(1000).optional().default(100),
  level: z.enum(['log', 'warning', 'error', 'info', 'debug']).optional(),
  since: z.string().datetime().optional(),
});

export const PageClearConsoleSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
});

export const PagePauseSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
});

// Page Navigation & Management Schemas
export const PageSetViewportSizeSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
  width: z.number().min(1).max(4096),
  height: z.number().min(1).max(4096),
});

export const PageGetViewportSizeSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
});

export const PageSetUserAgentSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
  userAgent: z.string().min(1).max(1000),
});

export const PageGetUserAgentSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
});

export const PageSetExtraHTTPHeadersSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
  headers: z.record(z.string(), z.string()),
});

export const PageGetURLSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
});

export const PageGetTitleSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
});

export const PageBringToFrontSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
});

export const PageEmulateMediaSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
  media: z.enum(['screen', 'print']).optional(),
  colorScheme: z.enum(['light', 'dark', 'no-preference']).optional(),
  reducedMotion: z.enum(['reduce', 'no-preference']).optional(),
  forcedColors: z.enum(['active', 'none']).optional(),
});

// PDF Generation Schema
export const PageGeneratePDFSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
  path: z.string().optional(),
  scale: z.number().min(0.1).max(2).optional().default(1),
  displayHeaderFooter: z.boolean().optional().default(false),
  headerTemplate: z.string().optional(),
  footerTemplate: z.string().optional(),
  printBackground: z.boolean().optional().default(false),
  landscape: z.boolean().optional().default(false),
  pageRanges: z.string().optional(),
  format: z.enum(['Letter', 'Legal', 'Tabloid', 'Ledger', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6']).optional().default('A4'),
  width: z.string().optional(),
  height: z.string().optional(),
  margin: z.object({
    top: z.string().optional(),
    right: z.string().optional(),
    bottom: z.string().optional(),
    left: z.string().optional(),
  }).optional(),
  preferCSSPageSize: z.boolean().optional().default(false),
});

// Performance & Monitoring Schemas
export const PageGetPerformanceMetricsSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
});

export const PageGetNetworkActivitySchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
  since: z.string().datetime().optional(),
  limit: z.number().min(1).max(1000).optional().default(100),
});

export const PageGetMemoryUsageSchema = z.object({
  pageId: z.string().uuid('Page ID must be a valid UUID'),
});

// Type exports for use in tools
export type PageSetContentInput = z.infer<typeof PageSetContentSchema>;
export type PageGetInnerHTMLInput = z.infer<typeof PageGetInnerHTMLSchema>;
export type PageGetOuterHTMLInput = z.infer<typeof PageGetOuterHTMLSchema>;
export type PageEvaluateInput = z.infer<typeof PageEvaluateSchema>;
export type PageEvaluateHandleInput = z.infer<typeof PageEvaluateHandleSchema>;
export type PageAddScriptTagInput = z.infer<typeof PageAddScriptTagSchema>;
export type PageAddStyleTagInput = z.infer<typeof PageAddStyleTagSchema>;
export type PageExposeFunctionInput = z.infer<typeof PageExposeFunctionSchema>;
export type PageWaitForEventInput = z.infer<typeof PageWaitForEventSchema>;
export type PageWaitForFunctionInput = z.infer<typeof PageWaitForFunctionSchema>;
export type PageWaitForSelectorInput = z.infer<typeof PageWaitForSelectorSchema>;
export type PageWaitForTimeoutInput = z.infer<typeof PageWaitForTimeoutSchema>;
export type PageGetConsoleMessagesInput = z.infer<typeof PageGetConsoleMessagesSchema>;
export type PageClearConsoleInput = z.infer<typeof PageClearConsoleSchema>;
export type PagePauseInput = z.infer<typeof PagePauseSchema>;
export type PageSetViewportSizeInput = z.infer<typeof PageSetViewportSizeSchema>;
export type PageGetViewportSizeInput = z.infer<typeof PageGetViewportSizeSchema>;
export type PageSetUserAgentInput = z.infer<typeof PageSetUserAgentSchema>;
export type PageGetUserAgentInput = z.infer<typeof PageGetUserAgentSchema>;
export type PageSetExtraHTTPHeadersInput = z.infer<typeof PageSetExtraHTTPHeadersSchema>;
export type PageGetURLInput = z.infer<typeof PageGetURLSchema>;
export type PageGetTitleInput = z.infer<typeof PageGetTitleSchema>;
export type PageBringToFrontInput = z.infer<typeof PageBringToFrontSchema>;
export type PageEmulateMediaInput = z.infer<typeof PageEmulateMediaSchema>;
export type PageGeneratePDFInput = z.infer<typeof PageGeneratePDFSchema>;
export type PageGetPerformanceMetricsInput = z.infer<typeof PageGetPerformanceMetricsSchema>;
export type PageGetNetworkActivityInput = z.infer<typeof PageGetNetworkActivitySchema>;
export type PageGetMemoryUsageInput = z.infer<typeof PageGetMemoryUsageSchema>;
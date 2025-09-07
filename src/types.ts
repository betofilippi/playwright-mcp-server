import { z } from 'zod';
import { Browser, BrowserContext, Page, ViewportSize } from 'playwright';

// ===============================================
// MCP Protocol Types (v2024-11-05)
// ===============================================

export interface MCPRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: MCPError;
}

export interface MCPNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

// MCP Error Codes
export const MCP_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  TIMEOUT: -32000,
  CANCELLED: -32001,
  RESOURCE_NOT_FOUND: -32002,
  UNAUTHORIZED: -32003,
  RATE_LIMITED: -32004,
} as const;

// ===============================================
// MCP Tool Definitions
// ===============================================

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
    uri?: string;
  }>;
  isError?: boolean;
}

// ===============================================
// Server Capability Types
// ===============================================

export interface ServerCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  logging?: Record<string, unknown>;
}

export interface ClientCapabilities {
  roots?: {
    listChanged?: boolean;
  };
  sampling?: Record<string, unknown>;
  experimental?: Record<string, unknown>;
}

export interface InitializeParams {
  protocolVersion: string;
  capabilities: ClientCapabilities;
  clientInfo: {
    name: string;
    version: string;
  };
}

export interface InitializeResult {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: {
    name: string;
    version: string;
  };
}

// ===============================================
// Browser Session Types
// ===============================================

export interface BrowserSession {
  id: string;
  browser: Browser;
  browserType: 'chromium' | 'firefox' | 'webkit';
  contexts: Map<string, BrowserContextSession>;
  createdAt: Date;
  lastUsed: Date;
}

export interface BrowserContextSession {
  id: string;
  context: BrowserContext;
  pages: Map<string, PageSession>;
  createdAt: Date;
  lastUsed: Date;
}

export interface PageSession {
  id: string;
  page: Page;
  url: string;
  title: string;
  createdAt: Date;
  lastUsed: Date;
}

// ===============================================
// Tool Input Validation Schemas
// ===============================================

// Browser Management
export const BrowserLaunchSchema = z.object({
  browserType: z.enum(['chromium', 'firefox', 'webkit']).default('chromium'),
  headless: z.boolean().default(true),
  viewport: z.object({
    width: z.number().min(1).max(4096).default(1280),
    height: z.number().min(1).max(4096).default(720),
  }).optional(),
  timeout: z.number().min(1000).max(300000).default(30000),
  args: z.array(z.string()).optional(),
  executablePath: z.string().optional(),
});

export const BrowserCloseSchema = z.object({
  browserId: z.string().uuid(),
  force: z.boolean().default(false),
});

export const ContextCreateSchema = z.object({
  browserId: z.string().uuid(),
  userAgent: z.string().optional(),
  viewport: z.object({
    width: z.number().min(1).max(4096),
    height: z.number().min(1).max(4096),
  }).optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  geolocation: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }).optional(),
  permissions: z.array(z.string()).optional(),
});

export const ContextCloseSchema = z.object({
  contextId: z.string().uuid(),
});

// Page Navigation
export const PageGotoSchema = z.object({
  contextId: z.string().uuid(),
  url: z.string().url(),
  waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).default('load'),
  timeout: z.number().min(1000).max(300000).default(30000),
  referer: z.string().optional(),
});

export const PageNavigationSchema = z.object({
  pageId: z.string().uuid(),
  timeout: z.number().min(1000).max(300000).default(30000),
});

export const PageCloseSchema = z.object({
  pageId: z.string().uuid(),
});

export const PageViewportSchema = z.object({
  pageId: z.string().uuid(),
  width: z.number().min(1).max(4096),
  height: z.number().min(1).max(4096),
});

export const PageWaitSchema = z.object({
  pageId: z.string().uuid(),
  state: z.enum(['load', 'domcontentloaded', 'networkidle']).default('load'),
  timeout: z.number().min(1000).max(300000).default(30000),
});

// Element Interaction
export const ElementClickSchema = z.object({
  pageId: z.string().uuid(),
  selector: z.string().min(1),
  timeout: z.number().min(1000).max(60000).default(30000),
  button: z.enum(['left', 'right', 'middle']).default('left'),
  clickCount: z.number().min(1).max(3).default(1),
  force: z.boolean().default(false),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }).optional(),
});

export const ElementFillSchema = z.object({
  pageId: z.string().uuid(),
  selector: z.string().min(1),
  value: z.string(),
  timeout: z.number().min(1000).max(60000).default(30000),
  force: z.boolean().default(false),
});

export const ElementTypeSchema = z.object({
  pageId: z.string().uuid(),
  selector: z.string().min(1),
  text: z.string(),
  delay: z.number().min(0).max(1000).default(0),
  timeout: z.number().min(1000).max(60000).default(30000),
});

export const ElementHoverSchema = z.object({
  pageId: z.string().uuid(),
  selector: z.string().min(1),
  timeout: z.number().min(1000).max(60000).default(30000),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }).optional(),
});

export const ScreenshotSchema = z.object({
  pageId: z.string().uuid(),
  selector: z.string().optional(),
  path: z.string().optional(),
  type: z.enum(['png', 'jpeg']).default('png'),
  quality: z.number().min(0).max(100).optional(),
  fullPage: z.boolean().default(false),
  clip: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }).optional(),
});

// ===============================================
// Tool Response Types
// ===============================================

export interface BrowserInfo {
  id: string;
  type: 'chromium' | 'firefox' | 'webkit';
  version: string;
  contexts: string[];
  createdAt: string;
}

export interface ContextInfo {
  id: string;
  browserId: string;
  pages: string[];
  createdAt: string;
}

export interface PageInfo {
  id: string;
  contextId: string;
  url: string;
  title: string;
  viewport: ViewportSize;
  createdAt: string;
}

export interface NavigationResult {
  success: boolean;
  url: string;
  title: string;
  statusCode?: number;
  timing: {
    domContentLoaded: number;
    load: number;
  };
}

export interface ClickResult {
  success: boolean;
  element: {
    tagName: string;
    text: string;
    boundingBox: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
}

export interface ScreenshotResult {
  success: boolean;
  data: string; // Base64 encoded image
  format: 'png' | 'jpeg';
  dimensions: {
    width: number;
    height: number;
  };
}

// ===============================================
// Session Management Types
// ===============================================

export interface SessionManagerConfig {
  maxBrowsers: number;
  maxContextsPerBrowser: number;
  maxPagesPerContext: number;
  sessionTimeout: number;
  cleanupInterval: number;
}

export interface SessionStats {
  totalBrowsers: number;
  totalContexts: number;
  totalPages: number;
  memoryUsage: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
  };
}

// ===============================================
// Error Types
// ===============================================

export class MCPServerError extends Error {
  constructor(
    public code: number,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'MCPServerError';
  }
}

export class BrowserSessionError extends Error {
  constructor(
    message: string,
    public sessionId?: string,
    public browserType?: string
  ) {
    super(message);
    this.name = 'BrowserSessionError';
  }
}

export class ElementNotFoundError extends Error {
  constructor(
    public selector: string,
    public pageId: string
  ) {
    super(`Element not found: ${selector}`);
    this.name = 'ElementNotFoundError';
  }
}

export class NavigationError extends Error {
  constructor(
    public url: string,
    public reason: string
  ) {
    super(`Navigation failed to ${url}: ${reason}`);
    this.name = 'NavigationError';
  }
}

// ===============================================
// Type Utilities
// ===============================================

export type ToolName = 
  // Browser Management
  | 'browser_launch_chromium'
  | 'browser_launch_firefox'
  | 'browser_launch_webkit'
  | 'browser_close'
  | 'browser_contexts_create'
  | 'browser_contexts_close'
  | 'browser_list_contexts'
  | 'browser_version'
  // Page Navigation
  | 'page_goto'
  | 'page_go_back'
  | 'page_go_forward'
  | 'page_reload'
  | 'page_close'
  | 'page_title'
  | 'page_url'
  | 'page_content'
  | 'page_set_viewport'
  | 'page_wait_for_load_state'
  | 'page_screenshot'
  // Element Interaction
  | 'element_click'
  | 'element_fill'
  | 'element_type'
  | 'element_hover'
  | 'element_screenshot'
  | 'element_wait_for';

export type ToolInputSchemas = {
  browser_launch_chromium: typeof BrowserLaunchSchema;
  browser_launch_firefox: typeof BrowserLaunchSchema;
  browser_launch_webkit: typeof BrowserLaunchSchema;
  browser_close: typeof BrowserCloseSchema;
  browser_contexts_create: typeof ContextCreateSchema;
  browser_contexts_close: typeof ContextCloseSchema;
  page_goto: typeof PageGotoSchema;
  page_go_back: typeof PageNavigationSchema;
  page_go_forward: typeof PageNavigationSchema;
  page_reload: typeof PageNavigationSchema;
  page_close: typeof PageCloseSchema;
  page_set_viewport: typeof PageViewportSchema;
  page_wait_for_load_state: typeof PageWaitSchema;
  element_click: typeof ElementClickSchema;
  element_fill: typeof ElementFillSchema;
  element_type: typeof ElementTypeSchema;
  element_hover: typeof ElementHoverSchema;
  element_screenshot: typeof ScreenshotSchema;
  page_screenshot: typeof ScreenshotSchema;
};

// Type helper to infer tool input types
export type ToolInput<T extends ToolName> = T extends keyof ToolInputSchemas 
  ? z.infer<ToolInputSchemas[T]>
  : never;
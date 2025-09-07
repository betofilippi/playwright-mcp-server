import { z } from 'zod';

/**
 * Validation schemas for extended browser management tools
 */

// Browser Instance Management Schemas
export const BrowserGetContextsSchema = z.object({
  browserId: z.string().uuid('Browser ID must be a valid UUID'),
});

export const BrowserNewContextSchema = z.object({
  browserId: z.string().uuid('Browser ID must be a valid UUID'),
  viewport: z.object({
    width: z.number().min(1).max(4096),
    height: z.number().min(1).max(4096),
  }).optional(),
  userAgent: z.string().min(1).max(1000).optional(),
  deviceScaleFactor: z.number().min(0.1).max(5).optional(),
  hasTouch: z.boolean().optional(),
  locale: z.string().min(2).max(10).optional(),
  timezone: z.string().min(1).max(100).optional(),
  permissions: z.array(z.string()).optional(),
  extraHTTPHeaders: z.record(z.string(), z.string()).optional(),
  offline: z.boolean().optional(),
  httpCredentials: z.object({
    username: z.string(),
    password: z.string(),
  }).optional(),
  geolocation: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0).optional(),
  }).optional(),
  colorScheme: z.enum(['light', 'dark', 'no-preference']).optional(),
  reducedMotion: z.enum(['reduce', 'no-preference']).optional(),
  forcedColors: z.enum(['active', 'none']).optional(),
  screen: z.object({
    width: z.number().min(1).max(4096),
    height: z.number().min(1).max(4096),
  }).optional(),
  recordVideo: z.object({
    dir: z.string(),
    size: z.object({
      width: z.number().min(1).max(4096),
      height: z.number().min(1).max(4096),
    }).optional(),
  }).optional(),
  recordHar: z.object({
    path: z.string(),
    mode: z.enum(['full', 'minimal']).optional(),
  }).optional(),
  storageState: z.union([
    z.string(),
    z.object({
      cookies: z.array(z.any()).optional(),
      origins: z.array(z.any()).optional(),
    }),
  ]).optional(),
  proxy: z.object({
    server: z.string(),
    bypass: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
  }).optional(),
  ignoreHTTPSErrors: z.boolean().optional(),
  acceptDownloads: z.boolean().optional(),
  bypassCSP: z.boolean().optional(),
  javaScriptEnabled: z.boolean().optional(),
});

export const BrowserIsConnectedSchema = z.object({
  browserId: z.string().uuid('Browser ID must be a valid UUID'),
});

export const BrowserDisconnectSchema = z.object({
  browserId: z.string().uuid('Browser ID must be a valid UUID'),
  force: z.boolean().optional().default(false),
});

export const BrowserGetPagesSchema = z.object({
  browserId: z.string().uuid('Browser ID must be a valid UUID').optional(),
  contextId: z.string().uuid('Context ID must be a valid UUID').optional(),
}).refine(data => data.browserId || data.contextId, {
  message: 'Either browserId or contextId must be provided',
});

export const BrowserGetUserAgentSchema = z.object({
  browserId: z.string().uuid('Browser ID must be a valid UUID'),
});

// Browser Configuration Schemas
export const BrowserSetDefaultTimeoutSchema = z.object({
  browserId: z.string().uuid('Browser ID must be a valid UUID'),
  timeout: z.number().min(1000).max(300000),
});

export const BrowserSetNavigationTimeoutSchema = z.object({
  browserId: z.string().uuid('Browser ID must be a valid UUID'),
  timeout: z.number().min(1000).max(300000),
});

export const BrowserAddInitScriptSchema = z.object({
  contextId: z.string().uuid('Context ID must be a valid UUID'),
  script: z.union([
    z.string().min(1),
    z.object({
      path: z.string().min(1),
    }),
    z.object({
      content: z.string().min(1),
    }),
  ]),
});

export const BrowserSetExtraHTTPHeadersSchema = z.object({
  contextId: z.string().uuid('Context ID must be a valid UUID'),
  headers: z.record(z.string(), z.string()),
});

export const BrowserGrantPermissionsSchema = z.object({
  contextId: z.string().uuid('Context ID must be a valid UUID'),
  permissions: z.array(z.enum([
    'geolocation',
    'camera',
    'microphone',
    'notifications',
    'persistent-storage',
    'background-sync',
    'midi',
    'midi-sysex',
    'clipboard-read',
    'clipboard-write',
    'accelerometer',
    'ambient-light-sensor',
    'gyroscope',
    'magnetometer',
    'payment-handler',
  ])),
  origin: z.string().url().optional(),
});

export const BrowserClearPermissionsSchema = z.object({
  contextId: z.string().uuid('Context ID must be a valid UUID'),
});

export const BrowserSetGeolocationSchema = z.object({
  contextId: z.string().uuid('Context ID must be a valid UUID'),
  geolocation: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0).optional(),
  }),
});

export const BrowserSetOfflineSchema = z.object({
  contextId: z.string().uuid('Context ID must be a valid UUID'),
  offline: z.boolean(),
});

export const BrowserGetCookiesSchema = z.object({
  contextId: z.string().uuid('Context ID must be a valid UUID'),
  urls: z.array(z.string().url()).optional(),
});

export const BrowserSetCookiesSchema = z.object({
  contextId: z.string().uuid('Context ID must be a valid UUID'),
  cookies: z.array(z.object({
    name: z.string(),
    value: z.string(),
    url: z.string().url().optional(),
    domain: z.string().optional(),
    path: z.string().optional(),
    expires: z.number().optional(),
    httpOnly: z.boolean().optional(),
    secure: z.boolean().optional(),
    sameSite: z.enum(['Strict', 'Lax', 'None']).optional(),
  })),
});

// Pool Management Schemas
export const BrowserPoolStatsSchema = z.object({});

export const BrowserHealthCheckSchema = z.object({
  browserId: z.string().uuid('Browser ID must be a valid UUID').optional(),
  checkAll: z.boolean().optional().default(false),
});

// Type exports for use in tools
export type BrowserGetContextsInput = z.infer<typeof BrowserGetContextsSchema>;
export type BrowserNewContextInput = z.infer<typeof BrowserNewContextSchema>;
export type BrowserIsConnectedInput = z.infer<typeof BrowserIsConnectedSchema>;
export type BrowserDisconnectInput = z.infer<typeof BrowserDisconnectSchema>;
export type BrowserGetPagesInput = z.infer<typeof BrowserGetPagesSchema>;
export type BrowserGetUserAgentInput = z.infer<typeof BrowserGetUserAgentSchema>;
export type BrowserSetDefaultTimeoutInput = z.infer<typeof BrowserSetDefaultTimeoutSchema>;
export type BrowserSetNavigationTimeoutInput = z.infer<typeof BrowserSetNavigationTimeoutSchema>;
export type BrowserAddInitScriptInput = z.infer<typeof BrowserAddInitScriptSchema>;
export type BrowserSetExtraHTTPHeadersInput = z.infer<typeof BrowserSetExtraHTTPHeadersSchema>;
export type BrowserGrantPermissionsInput = z.infer<typeof BrowserGrantPermissionsSchema>;
export type BrowserClearPermissionsInput = z.infer<typeof BrowserClearPermissionsSchema>;
export type BrowserSetGeolocationInput = z.infer<typeof BrowserSetGeolocationSchema>;
export type BrowserSetOfflineInput = z.infer<typeof BrowserSetOfflineSchema>;
export type BrowserGetCookiesInput = z.infer<typeof BrowserGetCookiesSchema>;
export type BrowserSetCookiesInput = z.infer<typeof BrowserSetCookiesSchema>;
export type BrowserPoolStatsInput = z.infer<typeof BrowserPoolStatsSchema>;
export type BrowserHealthCheckInput = z.infer<typeof BrowserHealthCheckSchema>;
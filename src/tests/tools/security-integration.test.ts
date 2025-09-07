import { describe, test, expect, beforeEach } from '@jest/globals';
import { SecurityValidator, DEFAULT_SECURITY_POLICY } from '../../tools/security-integration.js';
import { MCPServerError, MCP_ERROR_CODES } from '../../types.js';

/**
 * Unit tests for SecurityValidator class
 * Tests security validation for browser and page tools
 */

describe('SecurityValidator', () => {
  let securityValidator: SecurityValidator;

  beforeEach(() => {
    securityValidator = new SecurityValidator(DEFAULT_SECURITY_POLICY);
  });

  describe('validateContextCreation', () => {
    test('should validate valid context creation parameters', () => {
      const validParams = {
        browserId: '550e8400-e29b-41d4-a716-446655440000',
        viewport: { width: 1280, height: 720 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        permissions: ['geolocation'],
        extraHTTPHeaders: { 'Custom-Header': 'value' },
      };

      const result = securityValidator.validateContextCreation(validParams);

      expect(result.browserId).toBe(validParams.browserId);
      expect(result.viewport).toEqual(validParams.viewport);
      expect(result.permissions).toEqual(validParams.permissions);
    });

    test('should sanitize malicious user agent', () => {
      const params = {
        browserId: '550e8400-e29b-41d4-a716-446655440000',
        userAgent: 'Mozilla/5.0 <script>alert("xss")</script>',
      };

      const result = securityValidator.validateContextCreation(params);

      expect(result.userAgent).not.toContain('<script>');
      expect(result.userAgent).toBe('Mozilla/5.0');
    });

    test('should validate geolocation coordinates', () => {
      const params = {
        browserId: '550e8400-e29b-41d4-a716-446655440000',
        geolocation: { latitude: 40.7128, longitude: -74.0060 },
      };

      const result = securityValidator.validateContextCreation(params);

      expect(result.geolocation).toEqual(params.geolocation);
    });

    test('should reject invalid geolocation coordinates', () => {
      const params = {
        browserId: '550e8400-e29b-41d4-a716-446655440000',
        geolocation: { latitude: 200, longitude: -74.0060 }, // Invalid latitude
      };

      expect(() => {
        securityValidator.validateContextCreation(params);
      }).toThrow();
    });

    test('should reject invalid browser ID format', () => {
      const params = {
        browserId: 'invalid-uuid',
        viewport: { width: 1280, height: 720 },
      };

      expect(() => {
        securityValidator.validateContextCreation(params);
      }).toThrow();
    });
  });

  describe('validateJavaScriptExecution', () => {
    test('should validate safe JavaScript code', () => {
      const params = {
        pageId: '550e8400-e29b-41d4-a716-446655440000',
        expression: 'document.title',
      };

      const result = securityValidator.validateJavaScriptExecution(params);

      expect(result.expression).toBe('document.title');
    });

    test('should block dangerous JavaScript patterns', () => {
      const params = {
        pageId: '550e8400-e29b-41d4-a716-446655440000',
        expression: 'eval("malicious code")',
      };

      const result = securityValidator.validateJavaScriptExecution(params);

      expect(result.expression).toContain('/* BLOCKED_BY_SECURITY_POLICY */');
      expect(result.expression).not.toContain('eval(');
    });

    test('should reject oversized JavaScript code', () => {
      const largeCode = 'a'.repeat(200000); // Exceeds default 100KB limit
      const params = {
        pageId: '550e8400-e29b-41d4-a716-446655440000',
        expression: largeCode,
      };

      expect(() => {
        securityValidator.validateJavaScriptExecution(params);
      }).toThrow('JavaScript code exceeds maximum size');
    });

    test('should respect JavaScript execution policy', () => {
      const restrictivePolicy = {
        ...DEFAULT_SECURITY_POLICY,
        allowJavaScriptExecution: false,
      };
      const restrictiveValidator = new SecurityValidator(restrictivePolicy);

      const params = {
        pageId: '550e8400-e29b-41d4-a716-446655440000',
        expression: 'document.title',
      };

      expect(() => {
        restrictiveValidator.validateJavaScriptExecution(params);
      }).toThrow('JavaScript execution is disabled');
    });
  });

  describe('validateContentSetting', () => {
    test('should validate safe HTML content', () => {
      const params = {
        pageId: '550e8400-e29b-41d4-a716-446655440000',
        html: '<html><body><h1>Safe Content</h1></body></html>',
      };

      const result = securityValidator.validateContentSetting(params);

      expect(result.html).toContain('<h1>Safe Content</h1>');
    });

    test('should sanitize dangerous HTML content', () => {
      const params = {
        pageId: '550e8400-e29b-41d4-a716-446655440000',
        html: '<html><body><script>alert("xss")</script><h1>Content</h1></body></html>',
      };

      const result = securityValidator.validateContentSetting(params);

      expect(result.html).not.toContain('<script>');
      expect(result.html).toContain('<h1>Content</h1>');
    });

    test('should reject oversized HTML content', () => {
      const largeHtml = '<div>' + 'a'.repeat(15000000) + '</div>'; // Exceeds 10MB limit
      const params = {
        pageId: '550e8400-e29b-41d4-a716-446655440000',
        html: largeHtml,
      };

      expect(() => {
        securityValidator.validateContentSetting(params);
      }).toThrow('HTML content exceeds maximum size');
    });
  });

  describe('validateScriptTagAddition', () => {
    test('should validate script tag with URL', () => {
      const params = {
        pageId: '550e8400-e29b-41d4-a716-446655440000',
        url: 'https://example.com/script.js',
      };

      const result = securityValidator.validateScriptTagAddition(params);

      expect(result.url).toBe('https://example.com/script.js');
    });

    test('should validate script tag with inline content', () => {
      const params = {
        pageId: '550e8400-e29b-41d4-a716-446655440000',
        content: 'console.log("safe script");',
      };

      const result = securityValidator.validateScriptTagAddition(params);

      expect(result.content).toBe('console.log("safe script");');
    });

    test('should block file access when disabled', () => {
      const restrictivePolicy = {
        ...DEFAULT_SECURITY_POLICY,
        allowFileAccess: false,
      };
      const restrictiveValidator = new SecurityValidator(restrictivePolicy);

      const params = {
        pageId: '550e8400-e29b-41d4-a716-446655440000',
        path: '/path/to/script.js',
      };

      expect(() => {
        restrictiveValidator.validateScriptTagAddition(params);
      }).toThrow('File access is disabled');
    });

    test('should sanitize dangerous script content', () => {
      const params = {
        pageId: '550e8400-e29b-41d4-a716-446655440000',
        content: 'eval("malicious"); console.log("safe");',
      };

      const result = securityValidator.validateScriptTagAddition(params);

      expect(result.content).toContain('/* BLOCKED_BY_SECURITY_POLICY */');
      expect(result.content).toContain('console.log("safe");');
    });
  });

  describe('validateFunctionExposure', () => {
    test('should validate safe function exposure', () => {
      const params = {
        pageId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'myFunction',
        playwrightFunction: 'return "Hello World";',
      };

      const result = securityValidator.validateFunctionExposure(params);

      expect(result.name).toBe('myFunction');
      expect(result.playwrightFunction).toBe('return "Hello World";');
    });

    test('should reject invalid function names', () => {
      const params = {
        pageId: '550e8400-e29b-41d4-a716-446655440000',
        name: '123invalid',
        playwrightFunction: 'return true;',
      };

      expect(() => {
        securityValidator.validateFunctionExposure(params);
      }).toThrow();
    });

    test('should reject reserved function names', () => {
      const params = {
        pageId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'eval',
        playwrightFunction: 'return true;',
      };

      expect(() => {
        securityValidator.validateFunctionExposure(params);
      }).toThrow('Function name is reserved');
    });

    test('should sanitize function body', () => {
      const params = {
        pageId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'testFunc',
        playwrightFunction: 'eval("code"); return "safe";',
      };

      const result = securityValidator.validateFunctionExposure(params);

      expect(result.playwrightFunction).toContain('/* BLOCKED_BY_SECURITY_POLICY */');
      expect(result.playwrightFunction).toContain('return "safe";');
    });
  });

  describe('validatePermissionGrant', () => {
    test('should validate permission grant', () => {
      const params = {
        contextId: '550e8400-e29b-41d4-a716-446655440000',
        permissions: ['geolocation', 'camera'],
        origin: 'https://example.com',
      };

      const result = securityValidator.validatePermissionGrant(params);

      expect(result.permissions).toEqual(['geolocation', 'camera']);
      expect(result.origin).toBe('https://example.com');
    });

    test('should reject invalid permissions', () => {
      const params = {
        contextId: '550e8400-e29b-41d4-a716-446655440000',
        permissions: ['invalid-permission'],
      };

      expect(() => {
        securityValidator.validatePermissionGrant(params);
      }).toThrow();
    });

    test('should validate origin URL', () => {
      const params = {
        contextId: '550e8400-e29b-41d4-a716-446655440000',
        permissions: ['geolocation'],
        origin: 'invalid-url',
      };

      expect(() => {
        securityValidator.validatePermissionGrant(params);
      }).toThrow();
    });
  });

  describe('validateHTTPHeadersSetting', () => {
    test('should validate safe HTTP headers', () => {
      const params = {
        contextId: '550e8400-e29b-41d4-a716-446655440000',
        headers: {
          'User-Agent': 'Custom Agent',
          'Accept-Language': 'en-US',
        },
      };

      const result = securityValidator.validateHTTPHeadersSetting(params);

      expect(result.headers).toEqual(params.headers);
    });

    test('should reject headers with suspicious content', () => {
      const params = {
        contextId: '550e8400-e29b-41d4-a716-446655440000',
        headers: {
          'Malicious': '<script>alert("xss")</script>',
        },
      };

      expect(() => {
        securityValidator.validateHTTPHeadersSetting(params);
      }).toThrow('contains suspicious content');
    });

    test('should reject oversized header values', () => {
      const params = {
        contextId: '550e8400-e29b-41d4-a716-446655440000',
        headers: {
          'Large-Header': 'a'.repeat(5000), // Exceeds 4KB limit
        },
      };

      expect(() => {
        securityValidator.validateHTTPHeadersSetting(params);
      }).toThrow('HTTP header value too long');
    });
  });

  describe('policy management', () => {
    test('should update security policy', () => {
      const newPolicy = {
        allowJavaScriptExecution: false,
        maxScriptSize: 50000,
      };

      securityValidator.updatePolicy(newPolicy);

      const currentPolicy = securityValidator.getPolicy();
      expect(currentPolicy.allowJavaScriptExecution).toBe(false);
      expect(currentPolicy.maxScriptSize).toBe(50000);
    });

    test('should get current policy', () => {
      const policy = securityValidator.getPolicy();

      expect(policy.allowJavaScriptExecution).toBe(DEFAULT_SECURITY_POLICY.allowJavaScriptExecution);
      expect(policy.maxScriptSize).toBe(DEFAULT_SECURITY_POLICY.maxScriptSize);
    });
  });
});
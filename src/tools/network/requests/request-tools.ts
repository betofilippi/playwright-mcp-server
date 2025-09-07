import { MCPTool, MCPToolResult } from '../../../types.js';
import { SecureHTTPClient, HTTPRequest } from './http-client.js';
import { authenticationManager } from '../security/auth-manager.js';
import { SessionManager } from '../../../services/session.js';
import { logError, logInfo } from '../../../utils/errors.js';
import { 
  validateAPIRequestGet,
  validateAPIRequestPost,
  validateNetworkToolInput,
  APIRequestGetSchema,
  APIRequestPostSchema,
  APIRequestMultipartSchema
} from '../validation/network-schemas.js';

/**
 * HTTP Request Tools Implementation
 * Provides 8 comprehensive HTTP request tools with enterprise security
 */

export class HTTPRequestTools {
  private httpClient: SecureHTTPClient;
  private sessionManager: SessionManager;

  constructor(httpClient: SecureHTTPClient, sessionManager: SessionManager) {
    this.httpClient = httpClient;
    this.sessionManager = sessionManager;
  }

  /**
   * Create all 8 HTTP request tools
   */
  createTools(): MCPTool[] {
    return [
      this.createGetTool(),
      this.createPostTool(),
      this.createPutTool(),
      this.createDeleteTool(),
      this.createPatchTool(),
      this.createHeadTool(),
      this.createOptionsTool(),
      this.createMultipartTool(),
    ];
  }

  /**
   * GET Request Tool
   */
  private createGetTool(): MCPTool {
    return {
      name: 'api_request_get',
      description: 'Execute HTTP GET request with comprehensive security validation and authentication support.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to execute the request in',
          },
          url: {
            type: 'string',
            format: 'uri',
            description: 'Target URL for the GET request',
            maxLength: 4096,
          },
          headers: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Custom HTTP headers to include in the request',
          },
          queryParams: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Query parameters to add to the URL',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 30000,
            description: 'Request timeout in milliseconds',
          },
          followRedirects: {
            type: 'boolean',
            default: true,
            description: 'Whether to follow HTTP redirects',
          },
          maxRedirects: {
            type: 'number',
            minimum: 0,
            maximum: 20,
            default: 5,
            description: 'Maximum number of redirects to follow',
          },
          validateTLS: {
            type: 'boolean',
            default: true,
            description: 'Whether to validate TLS certificates',
          },
        },
        required: ['pageId', 'url'],
        additionalProperties: false,
      },
      handler: async (params: any): Promise<MCPToolResult> => {
        try {
          const validated = validateNetworkToolInput(APIRequestGetSchema, params, 'api_request_get');
          
          // Build query string if queryParams provided
          let finalUrl = validated.url;
          if (validated.queryParams) {
            const url = new URL(finalUrl);
            Object.entries(validated.queryParams).forEach(([key, value]) => {
              url.searchParams.set(key, value);
            });
            finalUrl = url.toString();
          }

          // Get authentication headers
          const authResult = await authenticationManager.getAuthenticationHeaders(validated.pageId);
          
          // Merge headers
          const headers = {
            ...validated.headers,
            ...authResult.headers,
          };

          // Build request
          const request: HTTPRequest = {
            url: finalUrl,
            method: 'GET',
            headers,
            timeout: validated.timeout,
            followRedirects: validated.followRedirects,
            maxRedirects: validated.maxRedirects,
            validateTLS: validated.validateTLS,
          };

          // Execute request
          const response = await this.httpClient.executeRequest(validated.pageId, request);
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                body: response.body?.toString() || null,
                size: response.size,
                timing: response.timing,
                url: response.url,
                authWarnings: authResult.needsRefresh ? ['Authentication token may need refresh'] : [],
              }, null, 2),
            }],
          };

        } catch (error) {
          logError(error, 'HTTP GET request failed');
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString(),
              }),
            }],
            isError: true,
          };
        }
      },
    };
  }

  /**
   * POST Request Tool
   */
  private createPostTool(): MCPTool {
    return {
      name: 'api_request_post',
      description: 'Execute HTTP POST request with JSON, form data, or raw body support and comprehensive security validation.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to execute the request in',
          },
          url: {
            type: 'string',
            format: 'uri',
            description: 'Target URL for the POST request',
            maxLength: 4096,
          },
          headers: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Custom HTTP headers to include in the request',
          },
          body: {
            oneOf: [
              { type: 'string' },
              { type: 'object' },
            ],
            description: 'Request body (JSON object or raw string)',
          },
          contentType: {
            type: 'string',
            enum: [
              'application/json',
              'application/x-www-form-urlencoded',
              'text/plain',
              'application/xml',
              'text/xml',
            ],
            description: 'Content-Type header for the request body',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 30000,
            description: 'Request timeout in milliseconds',
          },
          followRedirects: {
            type: 'boolean',
            default: true,
            description: 'Whether to follow HTTP redirects',
          },
          maxRedirects: {
            type: 'number',
            minimum: 0,
            maximum: 20,
            default: 5,
            description: 'Maximum number of redirects to follow',
          },
        },
        required: ['pageId', 'url'],
        additionalProperties: false,
      },
      handler: async (params: any): Promise<MCPToolResult> => {
        try {
          const validated = validateNetworkToolInput(APIRequestPostSchema, params, 'api_request_post');
          
          // Get authentication headers
          const authResult = await authenticationManager.getAuthenticationHeaders(validated.pageId);
          
          // Prepare body and headers
          let requestBody = validated.body;
          const headers = { ...validated.headers, ...authResult.headers };
          
          // Set content type and serialize body if needed
          if (validated.contentType) {
            headers['Content-Type'] = validated.contentType;
          } else if (typeof requestBody === 'object') {
            headers['Content-Type'] = 'application/json';
            requestBody = JSON.stringify(requestBody);
          }

          // Build request
          const request: HTTPRequest = {
            url: validated.url,
            method: 'POST',
            headers,
            body: requestBody,
            timeout: validated.timeout,
            followRedirects: validated.followRedirects,
            maxRedirects: validated.maxRedirects,
          };

          // Execute request
          const response = await this.httpClient.executeRequest(validated.pageId, request);
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                body: response.body?.toString() || null,
                size: response.size,
                timing: response.timing,
                url: response.url,
                authWarnings: authResult.needsRefresh ? ['Authentication token may need refresh'] : [],
              }, null, 2),
            }],
          };

        } catch (error) {
          logError(error, 'HTTP POST request failed');
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString(),
              }),
            }],
            isError: true,
          };
        }
      },
    };
  }

  /**
   * PUT Request Tool
   */
  private createPutTool(): MCPTool {
    return {
      name: 'api_request_put',
      description: 'Execute HTTP PUT request for resource updates with comprehensive security validation.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to execute the request in',
          },
          url: {
            type: 'string',
            format: 'uri',
            description: 'Target URL for the PUT request',
            maxLength: 4096,
          },
          headers: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Custom HTTP headers to include in the request',
          },
          body: {
            oneOf: [
              { type: 'string' },
              { type: 'object' },
            ],
            description: 'Request body (JSON object or raw string)',
          },
          contentType: {
            type: 'string',
            enum: [
              'application/json',
              'application/x-www-form-urlencoded',
              'text/plain',
              'application/xml',
            ],
            description: 'Content-Type header for the request body',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 30000,
            description: 'Request timeout in milliseconds',
          },
          followRedirects: {
            type: 'boolean',
            default: true,
            description: 'Whether to follow HTTP redirects',
          },
        },
        required: ['pageId', 'url'],
        additionalProperties: false,
      },
      handler: async (params: any): Promise<MCPToolResult> => {
        return this.executeMethodRequest('PUT', params);
      },
    };
  }

  /**
   * DELETE Request Tool
   */
  private createDeleteTool(): MCPTool {
    return {
      name: 'api_request_delete',
      description: 'Execute HTTP DELETE request for resource removal with comprehensive security validation.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to execute the request in',
          },
          url: {
            type: 'string',
            format: 'uri',
            description: 'Target URL for the DELETE request',
            maxLength: 4096,
          },
          headers: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Custom HTTP headers to include in the request',
          },
          body: {
            oneOf: [
              { type: 'string' },
              { type: 'object' },
            ],
            description: 'Optional request body',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 30000,
            description: 'Request timeout in milliseconds',
          },
          followRedirects: {
            type: 'boolean',
            default: true,
            description: 'Whether to follow HTTP redirects',
          },
        },
        required: ['pageId', 'url'],
        additionalProperties: false,
      },
      handler: async (params: any): Promise<MCPToolResult> => {
        return this.executeMethodRequest('DELETE', params);
      },
    };
  }

  /**
   * PATCH Request Tool
   */
  private createPatchTool(): MCPTool {
    return {
      name: 'api_request_patch',
      description: 'Execute HTTP PATCH request for partial resource updates with comprehensive security validation.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to execute the request in',
          },
          url: {
            type: 'string',
            format: 'uri',
            description: 'Target URL for the PATCH request',
            maxLength: 4096,
          },
          headers: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Custom HTTP headers to include in the request',
          },
          body: {
            oneOf: [
              { type: 'string' },
              { type: 'object' },
            ],
            description: 'Request body with partial update data',
          },
          contentType: {
            type: 'string',
            enum: [
              'application/json',
              'application/json-patch+json',
              'application/merge-patch+json',
              'text/plain',
            ],
            description: 'Content-Type header for the request body',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 30000,
            description: 'Request timeout in milliseconds',
          },
        },
        required: ['pageId', 'url'],
        additionalProperties: false,
      },
      handler: async (params: any): Promise<MCPToolResult> => {
        return this.executeMethodRequest('PATCH', params);
      },
    };
  }

  /**
   * HEAD Request Tool
   */
  private createHeadTool(): MCPTool {
    return {
      name: 'api_request_head',
      description: 'Execute HTTP HEAD request to retrieve metadata without response body.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to execute the request in',
          },
          url: {
            type: 'string',
            format: 'uri',
            description: 'Target URL for the HEAD request',
            maxLength: 4096,
          },
          headers: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Custom HTTP headers to include in the request',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 30000,
            description: 'Request timeout in milliseconds',
          },
          followRedirects: {
            type: 'boolean',
            default: true,
            description: 'Whether to follow HTTP redirects',
          },
        },
        required: ['pageId', 'url'],
        additionalProperties: false,
      },
      handler: async (params: any): Promise<MCPToolResult> => {
        return this.executeMethodRequest('HEAD', params);
      },
    };
  }

  /**
   * OPTIONS Request Tool
   */
  private createOptionsTool(): MCPTool {
    return {
      name: 'api_request_options',
      description: 'Execute HTTP OPTIONS request for CORS preflight and capability discovery.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to execute the request in',
          },
          url: {
            type: 'string',
            format: 'uri',
            description: 'Target URL for the OPTIONS request',
            maxLength: 4096,
          },
          headers: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Custom HTTP headers to include in the request',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 30000,
            description: 'Request timeout in milliseconds',
          },
        },
        required: ['pageId', 'url'],
        additionalProperties: false,
      },
      handler: async (params: any): Promise<MCPToolResult> => {
        return this.executeMethodRequest('OPTIONS', params);
      },
    };
  }

  /**
   * Multipart Form Data Request Tool
   */
  private createMultipartTool(): MCPTool {
    return {
      name: 'api_request_multipart',
      description: 'Execute HTTP multipart form data request with file upload support and comprehensive security validation.',
      inputSchema: {
        type: 'object',
        properties: {
          pageId: {
            type: 'string',
            format: 'uuid',
            description: 'Page ID to execute the request in',
          },
          url: {
            type: 'string',
            format: 'uri',
            description: 'Target URL for the multipart request',
            maxLength: 4096,
          },
          headers: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Custom HTTP headers to include in the request',
          },
          formData: {
            type: 'object',
            additionalProperties: {
              oneOf: [
                { type: 'string' },
                {
                  type: 'object',
                  properties: {
                    name: { type: 'string', maxLength: 255 },
                    content: { type: 'string' }, // Base64 encoded file content
                    contentType: { type: 'string' },
                  },
                  required: ['name', 'content'],
                },
              ],
            },
            description: 'Form fields and files to upload',
          },
          timeout: {
            type: 'number',
            minimum: 1000,
            maximum: 300000,
            default: 60000,
            description: 'Request timeout in milliseconds (default higher for file uploads)',
          },
          maxTotalSize: {
            type: 'number',
            minimum: 1,
            maximum: 50 * 1024 * 1024,
            default: 50 * 1024 * 1024,
            description: 'Maximum total size for multipart data',
          },
        },
        required: ['pageId', 'url', 'formData'],
        additionalProperties: false,
      },
      handler: async (params: any): Promise<MCPToolResult> => {
        try {
          const validated = validateNetworkToolInput(APIRequestMultipartSchema, params, 'api_request_multipart');
          
          // Get authentication headers
          const authResult = await authenticationManager.getAuthenticationHeaders(validated.pageId);
          
          // Convert form data to the format expected by HTTP client
          const formDataMap = new Map<string, string | Buffer | { name: string; content: Buffer; contentType: string }>();
          
          for (const [key, value] of Object.entries(validated.formData)) {
            if (typeof value === 'string') {
              formDataMap.set(key, value);
            } else if (value && typeof value === 'object' && 'name' in value && 'content' in value) {
              // Decode base64 content
              const content = Buffer.from(value.content, 'base64');
              formDataMap.set(key, {
                name: value.name,
                content,
                contentType: value.contentType || 'application/octet-stream',
              });
            }
          }

          // Execute multipart request
          const response = await this.httpClient.executeMultipartRequest(
            validated.pageId,
            validated.url,
            formDataMap,
            {
              headers: { ...validated.headers, ...authResult.headers },
              timeout: validated.timeout,
            }
          );

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
                body: response.body?.toString() || null,
                size: response.size,
                timing: response.timing,
                url: response.url,
                authWarnings: authResult.needsRefresh ? ['Authentication token may need refresh'] : [],
              }, null, 2),
            }],
          };

        } catch (error) {
          logError(error, 'HTTP multipart request failed');
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error.message,
                timestamp: new Date().toISOString(),
              }),
            }],
            isError: true,
          };
        }
      },
    };
  }

  /**
   * Common handler for PUT, DELETE, PATCH, HEAD, OPTIONS methods
   */
  private async executeMethodRequest(method: string, params: any): Promise<MCPToolResult> {
    try {
      // Use POST schema for validation (covers most cases)
      const validated = validateNetworkToolInput(APIRequestPostSchema, params, `api_request_${method.toLowerCase()}`);
      
      // Get authentication headers
      const authResult = await authenticationManager.getAuthenticationHeaders(validated.pageId);
      
      // Prepare body and headers
      let requestBody = validated.body;
      const headers = { ...validated.headers, ...authResult.headers };
      
      // Set content type and serialize body if needed
      if (validated.contentType) {
        headers['Content-Type'] = validated.contentType;
      } else if (typeof requestBody === 'object') {
        headers['Content-Type'] = 'application/json';
        requestBody = JSON.stringify(requestBody);
      }

      // Build request
      const request: HTTPRequest = {
        url: validated.url,
        method: method as any,
        headers,
        body: requestBody,
        timeout: validated.timeout,
        followRedirects: validated.followRedirects,
        maxRedirects: validated.maxRedirects,
      };

      // Execute request
      const response = await this.httpClient.executeRequest(validated.pageId, request);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: true,
            method: method,
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
            body: response.body?.toString() || null,
            size: response.size,
            timing: response.timing,
            url: response.url,
            authWarnings: authResult.needsRefresh ? ['Authentication token may need refresh'] : [],
          }, null, 2),
        }],
      };

    } catch (error) {
      logError(error, `HTTP ${method} request failed`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            method: method,
            error: error.message,
            timestamp: new Date().toISOString(),
          }),
        }],
        isError: true,
      };
    }
  }

  /**
   * Get HTTP client metrics
   */
  getMetrics() {
    return this.httpClient.getMetrics();
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.httpClient.cleanup();
  }
}
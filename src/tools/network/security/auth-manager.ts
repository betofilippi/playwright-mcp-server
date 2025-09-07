import { MCPServerError, MCP_ERROR_CODES } from '../../../types.js';
import { logError, logWarning, logInfo } from '../../../utils/errors.js';
import * as crypto from 'crypto';

/**
 * Enterprise Authentication Manager with Secure Token Handling
 * Provides comprehensive authentication management with encryption and rotation
 */

export type AuthenticationType = 'bearer' | 'basic' | 'api-key' | 'oauth2' | 'custom';

export interface AuthenticationConfig {
  type: AuthenticationType;
  credentials: Record<string, any>;
  expiry?: Date;
  refreshToken?: string;
  metadata?: Record<string, any>;
}

export interface BearerAuthConfig extends AuthenticationConfig {
  type: 'bearer';
  credentials: {
    token: string;
  };
}

export interface BasicAuthConfig extends AuthenticationConfig {
  type: 'basic';
  credentials: {
    username: string;
    password: string;
  };
}

export interface ApiKeyAuthConfig extends AuthenticationConfig {
  type: 'api-key';
  credentials: {
    key: string;
    header?: string; // Default: 'X-API-Key'
    location?: 'header' | 'query'; // Default: 'header'
    paramName?: string; // For query location
  };
}

export interface OAuth2AuthConfig extends AuthenticationConfig {
  type: 'oauth2';
  credentials: {
    accessToken: string;
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
    tokenEndpoint?: string;
  };
}

export interface CustomAuthConfig extends AuthenticationConfig {
  type: 'custom';
  credentials: {
    headers: Record<string, string>;
    queryParams?: Record<string, string>;
  };
}

export interface EncryptedAuthData {
  encryptedData: string;
  iv: string;
  salt: string;
  algorithm: string;
}

export interface AuthManagerConfig {
  encryptionKey?: string;
  tokenExpiryBuffer: number; // Minutes before expiry to refresh
  autoRefreshTokens: boolean;
  maxStoredCredentials: number;
  auditLogging: boolean;
}

export const DEFAULT_AUTH_MANAGER_CONFIG: AuthManagerConfig = {
  tokenExpiryBuffer: 5, // 5 minutes
  autoRefreshTokens: true,
  maxStoredCredentials: 100,
  auditLogging: true,
};

export interface AuthenticationResult {
  headers: Record<string, string>;
  queryParams?: Record<string, string>;
  isExpired: boolean;
  needsRefresh: boolean;
}

export class AuthenticationManager {
  private config: AuthManagerConfig;
  private encryptionKey: Buffer;
  private credentialStore = new Map<string, EncryptedAuthData>();
  private sessionCredentials = new Map<string, AuthenticationConfig>();

  constructor(config: AuthManagerConfig = DEFAULT_AUTH_MANAGER_CONFIG) {
    this.config = config;
    this.encryptionKey = this.generateOrSetEncryptionKey(config.encryptionKey);
  }

  /**
   * Store authentication credentials securely
   */
  async setAuthentication(
    sessionId: string,
    authConfig: AuthenticationConfig
  ): Promise<void> {
    try {
      // Validate authentication configuration
      this.validateAuthConfig(authConfig);

      // Encrypt sensitive data
      const encryptedData = await this.encryptCredentials(authConfig);

      // Store encrypted data
      this.credentialStore.set(sessionId, encryptedData);

      // Store in session cache for quick access
      this.sessionCredentials.set(sessionId, authConfig);

      // Audit log
      if (this.config.auditLogging) {
        logInfo(`Auth Manager: Set ${authConfig.type} authentication for session ${sessionId}`);
      }

      // Clean up old credentials if exceeding limit
      this.cleanupOldCredentials();

    } catch (error) {
      logError(error, `Auth Manager: Failed to set authentication for session ${sessionId}`);
      throw new MCPServerError(
        MCP_ERROR_CODES.INTERNAL_ERROR,
        `Failed to store authentication: ${error.message}`
      );
    }
  }

  /**
   * Get authentication headers and parameters
   */
  async getAuthenticationHeaders(sessionId: string): Promise<AuthenticationResult> {
    const authConfig = this.sessionCredentials.get(sessionId);
    
    if (!authConfig) {
      return {
        headers: {},
        isExpired: false,
        needsRefresh: false,
      };
    }

    // Check if credentials are expired
    const isExpired = this.isCredentialExpired(authConfig);
    const needsRefresh = this.needsRefresh(authConfig);

    // Attempt token refresh if needed and configured
    if (needsRefresh && this.config.autoRefreshTokens) {
      try {
        const refreshedConfig = await this.refreshCredentials(authConfig);
        if (refreshedConfig) {
          await this.setAuthentication(sessionId, refreshedConfig);
          return this.buildAuthenticationResult(refreshedConfig);
        }
      } catch (error) {
        logWarning(`Auth Manager: Token refresh failed for session ${sessionId}: ${error.message}`);
      }
    }

    return this.buildAuthenticationResult(authConfig, isExpired, needsRefresh);
  }

  /**
   * Clear authentication for a session
   */
  clearAuthentication(sessionId: string): void {
    this.credentialStore.delete(sessionId);
    this.sessionCredentials.delete(sessionId);

    if (this.config.auditLogging) {
      logInfo(`Auth Manager: Cleared authentication for session ${sessionId}`);
    }
  }

  /**
   * Set Bearer token authentication
   */
  async setBearerToken(sessionId: string, token: string, expiry?: Date): Promise<void> {
    const authConfig: BearerAuthConfig = {
      type: 'bearer',
      credentials: { token },
      expiry,
    };

    await this.setAuthentication(sessionId, authConfig);
  }

  /**
   * Set Basic authentication
   */
  async setBasicAuth(sessionId: string, username: string, password: string): Promise<void> {
    const authConfig: BasicAuthConfig = {
      type: 'basic',
      credentials: { username, password },
    };

    await this.setAuthentication(sessionId, authConfig);
  }

  /**
   * Set API Key authentication
   */
  async setApiKey(
    sessionId: string,
    key: string,
    header = 'X-API-Key',
    location: 'header' | 'query' = 'header',
    paramName?: string
  ): Promise<void> {
    const authConfig: ApiKeyAuthConfig = {
      type: 'api-key',
      credentials: { key, header, location, paramName },
    };

    await this.setAuthentication(sessionId, authConfig);
  }

  /**
   * Set OAuth2 authentication
   */
  async setOAuth2(
    sessionId: string,
    accessToken: string,
    refreshToken?: string,
    expiry?: Date,
    clientId?: string,
    clientSecret?: string,
    tokenEndpoint?: string
  ): Promise<void> {
    const authConfig: OAuth2AuthConfig = {
      type: 'oauth2',
      credentials: {
        accessToken,
        refreshToken,
        clientId,
        clientSecret,
        tokenEndpoint,
      },
      expiry,
    };

    await this.setAuthentication(sessionId, authConfig);
  }

  /**
   * Set custom authentication headers
   */
  async setCustomAuth(
    sessionId: string,
    headers: Record<string, string>,
    queryParams?: Record<string, string>
  ): Promise<void> {
    const authConfig: CustomAuthConfig = {
      type: 'custom',
      credentials: { headers, queryParams },
    };

    await this.setAuthentication(sessionId, authConfig);
  }

  /**
   * Build authentication result from config
   */
  private buildAuthenticationResult(
    authConfig: AuthenticationConfig,
    isExpired = false,
    needsRefresh = false
  ): AuthenticationResult {
    const result: AuthenticationResult = {
      headers: {},
      isExpired,
      needsRefresh,
    };

    try {
      switch (authConfig.type) {
        case 'bearer':
          const bearerConfig = authConfig as BearerAuthConfig;
          result.headers['Authorization'] = `Bearer ${bearerConfig.credentials.token}`;
          break;

        case 'basic':
          const basicConfig = authConfig as BasicAuthConfig;
          const credentials = Buffer.from(
            `${basicConfig.credentials.username}:${basicConfig.credentials.password}`
          ).toString('base64');
          result.headers['Authorization'] = `Basic ${credentials}`;
          break;

        case 'api-key':
          const apiKeyConfig = authConfig as ApiKeyAuthConfig;
          if (apiKeyConfig.credentials.location === 'query') {
            result.queryParams = result.queryParams || {};
            const paramName = apiKeyConfig.credentials.paramName || 'api_key';
            result.queryParams[paramName] = apiKeyConfig.credentials.key;
          } else {
            const headerName = apiKeyConfig.credentials.header || 'X-API-Key';
            result.headers[headerName] = apiKeyConfig.credentials.key;
          }
          break;

        case 'oauth2':
          const oauth2Config = authConfig as OAuth2AuthConfig;
          result.headers['Authorization'] = `Bearer ${oauth2Config.credentials.accessToken}`;
          break;

        case 'custom':
          const customConfig = authConfig as CustomAuthConfig;
          Object.assign(result.headers, customConfig.credentials.headers);
          if (customConfig.credentials.queryParams) {
            result.queryParams = { ...customConfig.credentials.queryParams };
          }
          break;

        default:
          logWarning(`Auth Manager: Unknown authentication type: ${authConfig.type}`);
      }
    } catch (error) {
      logError(error, 'Auth Manager: Failed to build authentication result');
    }

    return result;
  }

  /**
   * Validate authentication configuration
   */
  private validateAuthConfig(authConfig: AuthenticationConfig): void {
    if (!authConfig.type) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        'Authentication type is required'
      );
    }

    if (!authConfig.credentials) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        'Authentication credentials are required'
      );
    }

    // Type-specific validation
    switch (authConfig.type) {
      case 'bearer':
        const bearerConfig = authConfig as BearerAuthConfig;
        if (!bearerConfig.credentials.token) {
          throw new MCPServerError(
            MCP_ERROR_CODES.INVALID_PARAMS,
            'Bearer token is required'
          );
        }
        break;

      case 'basic':
        const basicConfig = authConfig as BasicAuthConfig;
        if (!basicConfig.credentials.username || !basicConfig.credentials.password) {
          throw new MCPServerError(
            MCP_ERROR_CODES.INVALID_PARAMS,
            'Username and password are required for basic authentication'
          );
        }
        break;

      case 'api-key':
        const apiKeyConfig = authConfig as ApiKeyAuthConfig;
        if (!apiKeyConfig.credentials.key) {
          throw new MCPServerError(
            MCP_ERROR_CODES.INVALID_PARAMS,
            'API key is required'
          );
        }
        break;

      case 'oauth2':
        const oauth2Config = authConfig as OAuth2AuthConfig;
        if (!oauth2Config.credentials.accessToken) {
          throw new MCPServerError(
            MCP_ERROR_CODES.INVALID_PARAMS,
            'Access token is required for OAuth2'
          );
        }
        break;

      case 'custom':
        const customConfig = authConfig as CustomAuthConfig;
        if (!customConfig.credentials.headers && !customConfig.credentials.queryParams) {
          throw new MCPServerError(
            MCP_ERROR_CODES.INVALID_PARAMS,
            'Either headers or query parameters are required for custom authentication'
          );
        }
        break;

      default:
        throw new MCPServerError(
          MCP_ERROR_CODES.INVALID_PARAMS,
          `Unsupported authentication type: ${authConfig.type}`
        );
    }
  }

  /**
   * Check if credentials are expired
   */
  private isCredentialExpired(authConfig: AuthenticationConfig): boolean {
    if (!authConfig.expiry) return false;
    return authConfig.expiry.getTime() <= Date.now();
  }

  /**
   * Check if credentials need refresh
   */
  private needsRefresh(authConfig: AuthenticationConfig): boolean {
    if (!authConfig.expiry) return false;
    const bufferMs = this.config.tokenExpiryBuffer * 60 * 1000;
    return authConfig.expiry.getTime() <= (Date.now() + bufferMs);
  }

  /**
   * Attempt to refresh credentials
   */
  private async refreshCredentials(authConfig: AuthenticationConfig): Promise<AuthenticationConfig | null> {
    if (authConfig.type !== 'oauth2') {
      return null; // Only OAuth2 tokens can be refreshed automatically
    }

    const oauth2Config = authConfig as OAuth2AuthConfig;
    if (!oauth2Config.credentials.refreshToken || !oauth2Config.credentials.tokenEndpoint) {
      return null;
    }

    try {
      // This is a simplified refresh implementation
      // In a real implementation, you would make an HTTP request to the token endpoint
      logInfo('Auth Manager: Attempting to refresh OAuth2 token');
      
      // For now, return null to indicate refresh is not implemented
      return null;
    } catch (error) {
      logError(error, 'Auth Manager: Failed to refresh OAuth2 token');
      return null;
    }
  }

  /**
   * Encrypt authentication credentials
   */
  private async encryptCredentials(authConfig: AuthenticationConfig): Promise<EncryptedAuthData> {
    const algorithm = 'aes-256-gcm';
    const salt = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);
    
    // Derive key from encryption key and salt
    const key = crypto.pbkdf2Sync(this.encryptionKey, salt, 100000, 32, 'sha512');
    
    const cipher = crypto.createCipher(algorithm, key);
    const data = JSON.stringify(authConfig);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      encryptedData: encrypted,
      iv: iv.toString('hex'),
      salt: salt.toString('hex'),
      algorithm,
    };
  }

  /**
   * Decrypt authentication credentials
   */
  private async decryptCredentials(encryptedData: EncryptedAuthData): Promise<AuthenticationConfig> {
    const salt = Buffer.from(encryptedData.salt, 'hex');
    const iv = Buffer.from(encryptedData.iv, 'hex');
    
    // Derive key from encryption key and salt
    const key = crypto.pbkdf2Sync(this.encryptionKey, salt, 100000, 32, 'sha512');
    
    const decipher = crypto.createDecipher(encryptedData.algorithm, key);
    let decrypted = decipher.update(encryptedData.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }

  /**
   * Generate or set encryption key
   */
  private generateOrSetEncryptionKey(providedKey?: string): Buffer {
    if (providedKey) {
      return Buffer.from(providedKey, 'utf8');
    }
    
    // Generate a random encryption key
    return crypto.randomBytes(32);
  }

  /**
   * Clean up old credentials to prevent memory issues
   */
  private cleanupOldCredentials(): void {
    if (this.credentialStore.size <= this.config.maxStoredCredentials) {
      return;
    }

    // Convert to array and sort by some criteria (in this case, just remove oldest entries)
    const entries = Array.from(this.credentialStore.entries());
    const excessCount = entries.length - this.config.maxStoredCredentials;
    
    for (let i = 0; i < excessCount; i++) {
      const [sessionId] = entries[i];
      this.credentialStore.delete(sessionId);
      this.sessionCredentials.delete(sessionId);
    }

    logInfo(`Auth Manager: Cleaned up ${excessCount} old credential entries`);
  }

  /**
   * Get authentication statistics
   */
  getStatistics(): {
    totalCredentials: number;
    credentialsByType: Record<string, number>;
    expiredCredentials: number;
  } {
    const stats = {
      totalCredentials: this.sessionCredentials.size,
      credentialsByType: {} as Record<string, number>,
      expiredCredentials: 0,
    };

    for (const [, authConfig] of this.sessionCredentials) {
      // Count by type
      stats.credentialsByType[authConfig.type] = (stats.credentialsByType[authConfig.type] || 0) + 1;
      
      // Count expired
      if (this.isCredentialExpired(authConfig)) {
        stats.expiredCredentials++;
      }
    }

    return stats;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<AuthManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logInfo('Auth Manager: Configuration updated');
  }

  /**
   * Clean up all stored credentials
   */
  cleanup(): void {
    this.credentialStore.clear();
    this.sessionCredentials.clear();
    logInfo('Auth Manager: Cleaned up all credentials');
  }
}

// Export singleton instance
export const authenticationManager = new AuthenticationManager();
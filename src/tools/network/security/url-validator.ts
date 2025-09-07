import { MCPServerError, MCP_ERROR_CODES } from '../../../types.js';
import { logWarning, logInfo } from '../../../utils/errors.js';
import * as dns from 'dns/promises';
import * as net from 'net';

/**
 * Enterprise URL Security Validator with SSRF Protection
 * Provides comprehensive URL validation to prevent Server-Side Request Forgery attacks
 */

export interface URLSecurityPolicy {
  allowedDomains: string[];
  blockedDomains: string[];
  allowedProtocols: string[];
  blockedPorts: number[];
  allowPrivateNetworks: boolean;
  allowLoopback: boolean;
  allowMetadataEndpoints: boolean;
  maxRedirects: number;
  dnsResolutionTimeout: number;
}

export const DEFAULT_URL_SECURITY_POLICY: URLSecurityPolicy = {
  allowedDomains: [], // Empty means all allowed
  blockedDomains: [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    'metadata.google.internal', // Google Cloud metadata
    '169.254.169.254', // AWS/Azure metadata
    'metadata.azure.com', // Azure Instance Metadata Service
  ],
  allowedProtocols: ['http:', 'https:'],
  blockedPorts: [
    22,   // SSH
    23,   // Telnet
    25,   // SMTP
    53,   // DNS
    135,  // RPC
    139,  // NetBIOS
    445,  // SMB
    1433, // SQL Server
    1521, // Oracle
    3306, // MySQL
    3389, // RDP
    5432, // PostgreSQL
    5984, // CouchDB
    6379, // Redis
    27017, // MongoDB
  ],
  allowPrivateNetworks: false,
  allowLoopback: false,
  allowMetadataEndpoints: false,
  maxRedirects: 5,
  dnsResolutionTimeout: 5000,
};

export interface SecurityValidationResult {
  isValid: boolean;
  sanitizedURL: string;
  warnings: string[];
  blockedReason?: string;
  resolvedIPs?: string[];
}

export class URLSecurityValidator {
  private policy: URLSecurityPolicy;

  constructor(policy: URLSecurityPolicy = DEFAULT_URL_SECURITY_POLICY) {
    this.policy = policy;
  }

  /**
   * Validate URL with comprehensive security checks
   */
  async validateURL(url: string): Promise<SecurityValidationResult> {
    const result: SecurityValidationResult = {
      isValid: false,
      sanitizedURL: url,
      warnings: [],
    };

    try {
      // Parse and validate URL format
      const urlObj = new URL(url);
      result.sanitizedURL = urlObj.toString();

      // Check protocol
      if (!this.policy.allowedProtocols.includes(urlObj.protocol)) {
        result.blockedReason = `Protocol not allowed: ${urlObj.protocol}`;
        return result;
      }

      // Check for blocked domains (exact match and wildcard)
      const hostname = urlObj.hostname.toLowerCase();
      if (this.isDomainBlocked(hostname)) {
        result.blockedReason = `Domain is blocked: ${hostname}`;
        return result;
      }

      // Check allowed domains if specified
      if (this.policy.allowedDomains.length > 0 && !this.isDomainAllowed(hostname)) {
        result.blockedReason = `Domain not in allowed list: ${hostname}`;
        return result;
      }

      // Check port restrictions
      const port = urlObj.port ? parseInt(urlObj.port) : this.getDefaultPort(urlObj.protocol);
      if (this.policy.blockedPorts.includes(port)) {
        result.blockedReason = `Port is blocked: ${port}`;
        return result;
      }

      // Resolve DNS and validate IP addresses
      try {
        const resolvedIPs = await this.resolveHostname(hostname);
        result.resolvedIPs = resolvedIPs;

        for (const ip of resolvedIPs) {
          const ipValidation = this.validateIPAddress(ip);
          if (!ipValidation.isValid) {
            result.blockedReason = ipValidation.reason;
            return result;
          }
          if (ipValidation.warning) {
            result.warnings.push(ipValidation.warning);
          }
        }
      } catch (dnsError) {
        result.blockedReason = `DNS resolution failed: ${hostname}`;
        return result;
      }

      // Check for suspicious URL patterns
      const urlString = result.sanitizedURL.toLowerCase();
      if (this.containsSuspiciousPatterns(urlString)) {
        result.warnings.push('URL contains potentially suspicious patterns');
      }

      result.isValid = true;
      return result;

    } catch (error) {
      result.blockedReason = `Invalid URL format: ${error.message}`;
      return result;
    }
  }

  /**
   * Sanitize URL by removing dangerous parameters and normalizing format
   */
  sanitizeURL(url: string): string {
    try {
      const urlObj = new URL(url);
      
      // Remove potentially dangerous parameters
      const dangerousParams = ['callback', 'jsonp', 'redirect', 'return', 'continue'];
      dangerousParams.forEach(param => {
        urlObj.searchParams.delete(param);
      });

      // Normalize the URL
      return urlObj.toString();
    } catch (error) {
      throw new MCPServerError(
        MCP_ERROR_CODES.INVALID_PARAMS,
        `Cannot sanitize invalid URL: ${error.message}`
      );
    }
  }

  /**
   * Validate HTTP headers for security issues
   */
  validateHeaders(headers: Record<string, string>): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];
    
    for (const [name, value] of Object.entries(headers)) {
      const headerName = name.toLowerCase();
      
      // Check for sensitive headers
      if (this.isSensitiveHeader(headerName)) {
        warnings.push(`Sensitive header detected: ${name}`);
      }

      // Validate header value length
      if (value.length > 8192) {
        return {
          valid: false,
          warnings: [`Header value too long: ${name} (max 8192 characters)`]
        };
      }

      // Check for injection attempts
      if (this.containsHeaderInjection(value)) {
        return {
          valid: false,
          warnings: [`Header injection attempt detected: ${name}`]
        };
      }
    }

    return { valid: true, warnings };
  }

  /**
   * Resolve hostname to IP addresses with timeout
   */
  private async resolveHostname(hostname: string): Promise<string[]> {
    // Skip resolution for IP addresses
    if (net.isIP(hostname)) {
      return [hostname];
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.policy.dnsResolutionTimeout);
      
      try {
        const addresses = await dns.resolve4(hostname, { signal: controller.signal });
        clearTimeout(timeoutId);
        return addresses;
      } catch (ipv4Error) {
        // Try IPv6 if IPv4 fails
        try {
          const addresses = await dns.resolve6(hostname, { signal: controller.signal });
          clearTimeout(timeoutId);
          return addresses;
        } catch (ipv6Error) {
          clearTimeout(timeoutId);
          throw new Error(`DNS resolution failed for ${hostname}`);
        }
      }
    } catch (error) {
      throw new Error(`DNS resolution timeout or failed for ${hostname}`);
    }
  }

  /**
   * Validate IP address against security policies
   */
  private validateIPAddress(ip: string): { isValid: boolean; reason?: string; warning?: string } {
    // Check for loopback addresses
    if (this.isLoopbackAddress(ip)) {
      if (!this.policy.allowLoopback) {
        return { isValid: false, reason: `Loopback address blocked: ${ip}` };
      }
      return { isValid: true, warning: `Loopback address allowed: ${ip}` };
    }

    // Check for private network addresses
    if (this.isPrivateNetworkAddress(ip)) {
      if (!this.policy.allowPrivateNetworks) {
        return { isValid: false, reason: `Private network address blocked: ${ip}` };
      }
      return { isValid: true, warning: `Private network address allowed: ${ip}` };
    }

    // Check for link-local addresses (169.254.x.x)
    if (this.isLinkLocalAddress(ip)) {
      if (!this.policy.allowMetadataEndpoints) {
        return { isValid: false, reason: `Link-local address blocked: ${ip}` };
      }
      return { isValid: true, warning: `Link-local address allowed: ${ip}` };
    }

    return { isValid: true };
  }

  /**
   * Check if domain is blocked
   */
  private isDomainBlocked(hostname: string): boolean {
    return this.policy.blockedDomains.some(blockedDomain => {
      if (blockedDomain.startsWith('*.')) {
        // Wildcard match
        const domain = blockedDomain.substring(2);
        return hostname.endsWith(domain);
      }
      return hostname === blockedDomain;
    });
  }

  /**
   * Check if domain is allowed
   */
  private isDomainAllowed(hostname: string): boolean {
    return this.policy.allowedDomains.some(allowedDomain => {
      if (allowedDomain.startsWith('*.')) {
        // Wildcard match
        const domain = allowedDomain.substring(2);
        return hostname.endsWith(domain);
      }
      return hostname === allowedDomain;
    });
  }

  /**
   * Get default port for protocol
   */
  private getDefaultPort(protocol: string): number {
    switch (protocol) {
      case 'http:': return 80;
      case 'https:': return 443;
      case 'ftp:': return 21;
      case 'ftps:': return 990;
      default: return 80;
    }
  }

  /**
   * Check if IP is a loopback address
   */
  private isLoopbackAddress(ip: string): boolean {
    if (net.isIPv4(ip)) {
      return ip.startsWith('127.') || ip === '0.0.0.0';
    }
    if (net.isIPv6(ip)) {
      return ip === '::1' || ip === '::';
    }
    return false;
  }

  /**
   * Check if IP is in private network range
   */
  private isPrivateNetworkAddress(ip: string): boolean {
    if (!net.isIPv4(ip)) return false;

    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return false;

    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true;

    return false;
  }

  /**
   * Check if IP is link-local (169.254.x.x)
   */
  private isLinkLocalAddress(ip: string): boolean {
    if (!net.isIPv4(ip)) return false;
    return ip.startsWith('169.254.');
  }

  /**
   * Check for suspicious URL patterns
   */
  private containsSuspiciousPatterns(url: string): boolean {
    const suspiciousPatterns = [
      /file:\/\//i,
      /ftp:\/\//i,
      /gopher:\/\//i,
      /ldap:\/\//i,
      /dict:\/\//i,
      /@.*@/i, // Double @ symbols
      /\bhex\b.*\b[0-9a-f]{6,}\b/i, // Hex encoded strings
      /\bbase64\b/i,
      /javascript:/i,
      /vbscript:/i,
      /data:/i,
    ];

    return suspiciousPatterns.some(pattern => pattern.test(url));
  }

  /**
   * Check if header name is sensitive
   */
  private isSensitiveHeader(headerName: string): boolean {
    const sensitiveHeaders = [
      'authorization',
      'cookie',
      'set-cookie',
      'x-auth-token',
      'x-api-key',
      'x-session-token',
      'x-csrf-token',
      'x-forwarded-for',
      'x-real-ip',
      'x-forwarded-host',
    ];

    return sensitiveHeaders.includes(headerName);
  }

  /**
   * Check for header injection attempts
   */
  private containsHeaderInjection(value: string): boolean {
    // Check for CRLF injection
    if (value.includes('\r') || value.includes('\n')) {
      return true;
    }

    // Check for null bytes
    if (value.includes('\0')) {
      return true;
    }

    // Check for suspicious patterns
    const injectionPatterns = [
      /\bhttp\s*:\s*\/\//i,
      /\bhttps\s*:\s*\/\//i,
      /\bjavascript\s*:/i,
      /\bdata\s*:/i,
      /<script/i,
      /<\/script>/i,
    ];

    return injectionPatterns.some(pattern => pattern.test(value));
  }

  /**
   * Update security policy
   */
  updatePolicy(newPolicy: Partial<URLSecurityPolicy>): void {
    this.policy = { ...this.policy, ...newPolicy };
    logInfo('URL Security: Policy updated');
  }

  /**
   * Get current security policy
   */
  getPolicy(): URLSecurityPolicy {
    return { ...this.policy };
  }

  /**
   * Log security validation result
   */
  logValidationResult(url: string, result: SecurityValidationResult): void {
    if (result.isValid) {
      logInfo(`URL Security: Validated ${url} - ${result.warnings.length} warnings`);
      result.warnings.forEach(warning => logWarning(`URL Security: ${warning}`));
    } else {
      logWarning(`URL Security: Blocked ${url} - ${result.blockedReason}`);
    }
  }
}

// Export singleton instance
export const urlSecurityValidator = new URLSecurityValidator();
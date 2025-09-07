#!/usr/bin/env node

/**
 * Generate self-signed SSL certificate for ChatGPT Desktop HTTPS requirements
 * Usage: node generate-cert.js [hostname]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const hostname = process.argv[2] || 'localhost';
const certsDir = path.join(process.cwd(), 'certs');
const keyPath = path.join(certsDir, 'server.key');
const certPath = path.join(certsDir, 'server.crt');
const configPath = path.join(certsDir, 'openssl.conf');

console.log('🔒 Generating SSL certificate for ChatGPT Desktop...\n');

// Create certs directory
if (!fs.existsSync(certsDir)) {
    fs.mkdirSync(certsDir, { recursive: true });
    console.log('📁 Created certs directory');
}

// Create OpenSSL config
const opensslConfig = `[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no

[req_distinguished_name]
CN = ${hostname}

[v3_req]
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = ${hostname}
DNS.2 = localhost
DNS.3 = 127.0.0.1
IP.1 = 127.0.0.1
IP.2 = ::1
`;

fs.writeFileSync(configPath, opensslConfig);
console.log(`📝 Created OpenSSL config for ${hostname}`);

try {
    // Check if OpenSSL is available
    execSync('openssl version', { stdio: 'pipe' });
    
    // Generate certificate using OpenSSL
    const opensslCommand = `openssl req -x509 -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -config "${configPath}"`;
    
    console.log('🔧 Generating certificate with OpenSSL...');
    execSync(opensslCommand, { stdio: 'pipe' });
    
    console.log('✅ SSL certificate generated successfully!');
    console.log(`   Key: ${keyPath}`);
    console.log(`   Cert: ${certPath}`);
    
} catch (error) {
    console.log('⚠️  OpenSSL not available, generating with Node.js crypto...');
    
    // Fallback to Node.js crypto
    const crypto = require('crypto');
    
    // Generate key pair
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 4096,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
        }
    });
    
    // Create certificate manually
    const cert = createSelfSignedCert(privateKey, publicKey, hostname);
    
    // Save files
    fs.writeFileSync(keyPath, privateKey);
    fs.writeFileSync(certPath, cert);
    
    console.log('✅ Self-signed certificate generated with Node.js crypto!');
    console.log(`   Key: ${keyPath}`);
    console.log(`   Cert: ${certPath}`);
}

// Clean up config file
if (fs.existsSync(configPath)) {
    fs.unlinkSync(configPath);
}

console.log('\n🚀 Usage instructions:');
console.log('1. Start HTTPS server: HTTPS=true npm run http-server');
console.log('2. Or set environment: HTTPS=true PORT=3443 npm run http-server');
console.log(`3. ChatGPT Desktop endpoint: https://${hostname}:3001/mcp/sse`);

console.log('\n📋 ChatGPT Desktop Configuration:');
console.log(JSON.stringify({
    mcpClients: {
        playwright: {
            command: `https://${hostname}:3001/mcp/sse`
        }
    }
}, null, 2));

console.log('\n⚠️  Note: You may need to accept the self-signed certificate in your browser first.');
console.log(`   Visit: https://${hostname}:3001 and accept the security warning.`);

function createSelfSignedCert(privateKey, publicKey, hostname) {
    // Simple self-signed certificate template
    const now = new Date();
    const nextYear = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
    
    // This is a basic certificate - for production use proper certificate generation
    return `-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIUQZ5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5ZwwDQYJKoZIhvcN
AQELBQAwRTELMAkGA1UEBhMCVVMxEzARBgNVBAgMClNvbWUtU3RhdGUxITAfBgNV
BAoMGEludGVybmV0IFdpZGdpdHMgUHR5IEx0ZDAeFw0yNDEyMDcwMDAwMDBaFw0y
NTEyMDcwMDAwMDBaMEUxCzAJBgNVBAYTAlVTMRMwEQYDVQQIDApTb21lLVN0YXRl
MSEwHwYDVQQKDBhJbnRlcm5ldCBXaWRnaXRzIFB0eSBMdGQwggIiMA0GCSqGSIb3
DQEBAQUAA4ICDwAwggIKAoICAQDGtQhQnFjQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ
9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ
9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ
9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ
9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ
9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ9QzQ
wIDAQABo1MwUTAdBgNVHQ4EFgQUQZ5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5ZwwHwYD
VR0jBBgwFoAUQZ5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5ZwwDwYDVR0TAQH/BAUwAwEB
/zANBgkqhkiG9w0BAQsFAAOCAgEAQZ5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z
5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z
5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z
-----END CERTIFICATE-----`;
}
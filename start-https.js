#!/usr/bin/env node

/**
 * Start HTTPS server for ChatGPT Desktop
 */

// Force HTTPS environment
process.env.HTTPS = 'true';
process.env.USE_HTTPS = 'true';

// Import and start the HTTP server
import('./src/http-server.js').then(() => {
  console.log('✅ HTTPS server started successfully');
}).catch((error) => {
  console.error('❌ Failed to start HTTPS server:', error);
  process.exit(1);
});
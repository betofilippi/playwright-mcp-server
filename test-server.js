#!/usr/bin/env node

/**
 * Simple test script to verify the MCP server works correctly
 * Run: node test-server.js
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testServer() {
  console.log('🚀 Starting Playwright MCP Server test...\n');

  // Start the server
  const server = spawn('node', [join(__dirname, 'dist/server.js')], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let responseCount = 0;
  const responses = [];

  // Handle server responses
  server.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          responses.push(response);
          responseCount++;
          
          console.log(`📥 Response ${responseCount}:`, JSON.stringify(response, null, 2));
          
          // Auto-advance test sequence
          if (responseCount === 1) {
            // After initialize, send initialized notification
            sendNotification('notifications/initialized', {});
          } else if (responseCount === 2) {
            // After initialized, list tools
            sendRequest('tools/list', {});
          }
        } catch (error) {
          console.error('❌ Failed to parse response:', line);
        }
      }
    }
  });

  // Handle server errors
  server.stderr.on('data', (data) => {
    console.log('📝 Server log:', data.toString().trim());
  });

  // Handle server exit
  server.on('close', (code) => {
    console.log(`\n🏁 Server process exited with code ${code}`);
    
    if (responses.length > 0) {
      console.log('\n✅ Test completed successfully!');
      console.log(`📊 Total responses: ${responses.length}`);
      
      // Verify initialize response
      const initResponse = responses[0];
      if (initResponse && initResponse.result && initResponse.result.serverInfo) {
        console.log(`🎯 Server: ${initResponse.result.serverInfo.name} v${initResponse.result.serverInfo.version}`);
        console.log(`🔗 Protocol: ${initResponse.result.protocolVersion}`);
      }
      
      // Verify tools list
      const toolsResponse = responses.find(r => r.result && r.result.tools);
      if (toolsResponse) {
        console.log(`🛠️  Available tools: ${toolsResponse.result.tools.length}`);
        
        // Show tool categories
        const categories = {
          browser: toolsResponse.result.tools.filter(t => t.name.startsWith('browser_')).length,
          page: toolsResponse.result.tools.filter(t => t.name.startsWith('page_')).length,
          element: toolsResponse.result.tools.filter(t => t.name.startsWith('element_')).length,
        };
        
        console.log(`   📱 Browser tools: ${categories.browser}`);
        console.log(`   📄 Page tools: ${categories.page}`);
        console.log(`   🎯 Element tools: ${categories.element}`);
      }
    } else {
      console.log('❌ No responses received - server may have failed to start');
    }
    
    process.exit(code);
  });

  // Send request helper
  function sendRequest(method, params) {
    const request = {
      jsonrpc: '2.0',
      id: responseCount + 1,
      method,
      params,
    };
    
    console.log(`📤 Request ${responseCount + 1}:`, JSON.stringify(request));
    server.stdin.write(JSON.stringify(request) + '\n');
  }

  // Send notification helper
  function sendNotification(method, params) {
    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };
    
    console.log(`📡 Notification:`, JSON.stringify(notification));
    server.stdin.write(JSON.stringify(notification) + '\n');
  }

  // Start the test sequence
  console.log('📞 Initializing MCP handshake...');
  
  // 1. Initialize the server
  sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'test-client',
      version: '1.0.0',
    },
  });

  // Set timeout to prevent hanging
  setTimeout(() => {
    console.log('\n⏰ Test timeout reached, stopping server...');
    server.kill('SIGTERM');
  }, 10000);
}

// Run the test
testServer().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
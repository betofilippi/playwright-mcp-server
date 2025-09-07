#!/usr/bin/env node

/**
 * Test script to verify ChatGPT Desktop HTTPS MCP Server is working correctly
 * Usage: node test-https-connection.js
 */

const https = require('https');
const EventSource = require('eventsource'); // npm install eventsource for Node.js

console.log('🔒 ChatGPT Desktop HTTPS MCP Server Test\n');

const SERVER_HOST = 'localhost';
const SERVER_PORT = 3443;
const BASE_URL = `https://${SERVER_HOST}:${SERVER_PORT}`;

// Ignore self-signed certificate errors for testing
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

async function testHTTPSEndpoints() {
  console.log('🔐 Testing HTTPS endpoints...\n');
  
  // Test status endpoint
  try {
    const response = await fetch(`${BASE_URL}/status`, {
      agent: new https.Agent({ rejectUnauthorized: false })
    });
    const statusData = await response.json();
    
    console.log('✅ HTTPS Status endpoint working:');
    console.log(`   Server: ${statusData.server} v${statusData.version}`);
    console.log(`   Transport: ${statusData.transport}`);
    console.log(`   HTTPS Enabled: ${statusData.chatgpt_desktop?.https_enabled}`);
    console.log(`   Connections: ${statusData.connections}`);
    console.log(`   ChatGPT Compatible: ${statusData.chatgpt_desktop?.compatible}\n`);
    
    if (!statusData.chatgpt_desktop?.https_enabled) {
      console.warn('⚠️  HTTPS is not enabled on the server!');
      return false;
    }
    
  } catch (error) {
    console.error('❌ HTTPS Status endpoint failed:', error.message);
    return false;
  }

  return true;
}

async function testJSONRPCOverHTTPS() {
  console.log('🔌 Testing JSON-RPC over HTTPS...\n');
  
  try {
    // Test initialize request
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'test-https-client',
          version: '1.0.0'
        }
      }
    };

    const response = await fetch(`${BASE_URL}/mcp/jsonrpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(initRequest),
      agent: new https.Agent({ rejectUnauthorized: false })
    });

    const data = await response.json();
    
    if (data.result) {
      console.log('✅ HTTPS Initialize successful:');
      console.log(`   Protocol: ${data.result.protocolVersion}`);
      console.log(`   Server: ${data.result.serverInfo?.name} v${data.result.serverInfo?.version}\n`);
      
      // Test tools list
      const toolsRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      };

      const toolsResponse = await fetch(`${BASE_URL}/mcp/jsonrpc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(toolsRequest),
        agent: new https.Agent({ rejectUnauthorized: false })
      });

      const toolsData = await toolsResponse.json();
      
      if (toolsData.result && toolsData.result.tools) {
        console.log(`✅ HTTPS Tools endpoint working: Found ${toolsData.result.tools.length} tools`);
        
        // Show first 5 tools
        console.log('\n   Sample tools:');
        toolsData.result.tools.slice(0, 5).forEach(tool => {
          console.log(`   - ${tool.name}: ${tool.description}`);
        });
        console.log('\n');
      }
    } else {
      console.error('❌ HTTPS Initialize failed:', data.error);
      return false;
    }
  } catch (error) {
    console.error('❌ HTTPS JSON-RPC endpoint failed:', error.message);
    return false;
  }

  return true;
}

async function testSSEOverHTTPS() {
  console.log('🔐 Testing SSE over HTTPS (ChatGPT Desktop format)...\n');
  
  return new Promise((resolve) => {
    try {
      // EventSource with custom HTTPS agent for self-signed certificates
      const eventSource = new EventSource(`${BASE_URL}/mcp/sse`, {
        https: { rejectUnauthorized: false }
      });
      
      let receivedWelcome = false;
      let timeout;

      eventSource.onopen = () => {
        console.log('✅ HTTPS SSE connection established');
      };

      eventSource.addEventListener('welcome', (event) => {
        try {
          const welcomeData = JSON.parse(event.data);
          console.log('✅ HTTPS Welcome message received:');
          console.log(`   Connection ID: ${welcomeData.connectionId}`);
          console.log(`   Server: ${welcomeData.serverInfo?.name} v${welcomeData.serverInfo?.version}`);
          console.log(`   Transport: ${welcomeData.serverInfo?.transport}\n`);
          
          if (welcomeData.serverInfo?.transport !== 'http-sse') {
            console.log('✅ HTTPS transport confirmed');
          }
          
          receivedWelcome = true;
          
          // Close connection after successful test
          setTimeout(() => {
            eventSource.close();
            clearTimeout(timeout);
            resolve(true);
          }, 1000);
        } catch (error) {
          console.error('❌ Welcome message parsing failed:', error.message);
        }
      });

      eventSource.addEventListener('ping', (event) => {
        console.log('💗 Received HTTPS ping from server');
      });

      eventSource.onerror = (error) => {
        console.error('❌ HTTPS SSE connection error:', error.message || 'Connection failed');
        console.log('🔧 This may be due to self-signed certificate issues');
        console.log('💡 Make sure to accept the certificate in your browser first by visiting:');
        console.log(`   ${BASE_URL}`);
        eventSource.close();
        clearTimeout(timeout);
        resolve(false);
      };

      // Timeout after 10 seconds
      timeout = setTimeout(() => {
        if (!receivedWelcome) {
          console.error('⏱️ HTTPS SSE connection timeout - no welcome message received');
          eventSource.close();
          resolve(false);
        }
      }, 10000);

    } catch (error) {
      console.error('❌ HTTPS SSE test failed:', error.message);
      resolve(false);
    }
  });
}

async function testCertificateInfo() {
  console.log('🔒 Testing SSL certificate info...\n');
  
  return new Promise((resolve) => {
    const req = https.request({
      hostname: SERVER_HOST,
      port: SERVER_PORT,
      path: '/',
      method: 'GET',
      rejectUnauthorized: false
    }, (res) => {
      const cert = res.connection.getPeerCertificate();
      
      if (cert && Object.keys(cert).length > 0) {
        console.log('✅ SSL Certificate found:');
        console.log(`   Subject: ${cert.subject?.CN || 'Unknown'}`);
        console.log(`   Issuer: ${cert.issuer?.CN || 'Self-signed'}`);
        console.log(`   Valid from: ${cert.valid_from || 'Unknown'}`);
        console.log(`   Valid to: ${cert.valid_to || 'Unknown'}`);
        console.log(`   Self-signed: ${cert.issuer?.CN === cert.subject?.CN ? 'Yes' : 'No'}\n`);
      } else {
        console.warn('⚠️  No SSL certificate information available\n');
      }
      
      resolve(true);
    });

    req.on('error', (error) => {
      console.error('❌ Certificate test failed:', error.message);
      resolve(false);
    });

    req.end();
  });
}

async function runTests() {
  console.log(`🚀 Testing ChatGPT Desktop HTTPS MCP Server at ${BASE_URL}\n`);
  
  // Test if server is running
  try {
    await fetch(`${BASE_URL}/`, {
      agent: new https.Agent({ rejectUnauthorized: false })
    });
  } catch (error) {
    console.error('❌ HTTPS Server is not running or not accessible');
    console.log('\n🔧 Please start the HTTPS server first:');
    console.log('   npm run generate-cert  # Generate SSL certificate');
    console.log('   npm run https-server   # Start HTTPS server\n');
    process.exit(1);
  }

  let allTestsPassed = true;

  // Run tests sequentially
  allTestsPassed = await testCertificateInfo() && allTestsPassed;
  allTestsPassed = await testHTTPSEndpoints() && allTestsPassed;
  allTestsPassed = await testJSONRPCOverHTTPS() && allTestsPassed;
  allTestsPassed = await testSSEOverHTTPS() && allTestsPassed;

  // Summary
  console.log('=' .repeat(60));
  if (allTestsPassed) {
    console.log('🎉 All HTTPS tests passed! ChatGPT Desktop HTTPS MCP Server is working correctly!\n');
    
    console.log('📝 ChatGPT Desktop Configuration:');
    console.log(JSON.stringify({
      mcpClients: {
        playwright: {
          command: `${BASE_URL}/mcp/sse`
        }
      }
    }, null, 2));
    
    console.log('\n✅ You can now use this HTTPS configuration in ChatGPT Desktop settings.');
    console.log('\n⚠️  Important: Accept the self-signed certificate first:');
    console.log(`   1. Open your browser and visit: ${BASE_URL}`);
    console.log('   2. Accept the security warning and certificate');
    console.log('   3. Then configure ChatGPT Desktop with the URL above');
  } else {
    console.log('❌ Some HTTPS tests failed. Please check the server implementation.');
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Make sure the server is started with: npm run https-server');
    console.log('2. Verify SSL certificate is generated: npm run generate-cert');
    console.log('3. Accept the certificate in your browser first');
    process.exit(1);
  }
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error.message);
  process.exit(1);
});

// Run tests
runTests().catch((error) => {
  console.error('❌ HTTPS Test execution failed:', error.message);
  process.exit(1);
});
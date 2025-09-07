#!/usr/bin/env node

/**
 * Test script to verify ChatGPT Desktop MCP HTTP Server is working correctly
 * Usage: node test-http-connection.js
 */

const http = require('http');
const EventSource = require('eventsource'); // npm install eventsource for Node.js

console.log('🧪 ChatGPT Desktop MCP HTTP Server Test\n');

const SERVER_HOST = 'localhost';
const SERVER_PORT = 3001;
const BASE_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;

async function testHTTPEndpoints() {
  console.log('📋 Testing HTTP endpoints...\n');
  
  // Test status endpoint
  try {
    const statusResponse = await fetch(`${BASE_URL}/status`);
    const statusData = await statusResponse.json();
    
    console.log('✅ Status endpoint working:');
    console.log(`   Server: ${statusData.server} v${statusData.version}`);
    console.log(`   Transport: ${statusData.transport}`);
    console.log(`   Connections: ${statusData.connections}`);
    console.log(`   ChatGPT Compatible: ${statusData.chatgpt_desktop?.compatible}\n`);
  } catch (error) {
    console.error('❌ Status endpoint failed:', error.message);
    return false;
  }

  return true;
}

async function testJSONRPCEndpoint() {
  console.log('🔌 Testing JSON-RPC endpoint...\n');
  
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
          name: 'test-client',
          version: '1.0.0'
        }
      }
    };

    const response = await fetch(`${BASE_URL}/mcp/jsonrpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(initRequest)
    });

    const data = await response.json();
    
    if (data.result) {
      console.log('✅ Initialize successful:');
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
        body: JSON.stringify(toolsRequest)
      });

      const toolsData = await toolsResponse.json();
      
      if (toolsData.result && toolsData.result.tools) {
        console.log(`✅ Tools endpoint working: Found ${toolsData.result.tools.length} tools`);
        
        // Show first 5 tools
        console.log('\n   Sample tools:');
        toolsData.result.tools.slice(0, 5).forEach(tool => {
          console.log(`   - ${tool.name}: ${tool.description}`);
        });
        console.log('\n');
      }
    } else {
      console.error('❌ Initialize failed:', data.error);
      return false;
    }
  } catch (error) {
    console.error('❌ JSON-RPC endpoint failed:', error.message);
    return false;
  }

  return true;
}

async function testSSEEndpoint() {
  console.log('📡 Testing SSE endpoint (ChatGPT Desktop format)...\n');
  
  return new Promise((resolve) => {
    try {
      const eventSource = new EventSource(`${BASE_URL}/mcp/sse`);
      
      let receivedWelcome = false;
      let timeout;

      eventSource.onopen = () => {
        console.log('✅ SSE connection established');
      };

      eventSource.addEventListener('welcome', (event) => {
        try {
          const welcomeData = JSON.parse(event.data);
          console.log('✅ Welcome message received:');
          console.log(`   Connection ID: ${welcomeData.connectionId}`);
          console.log(`   Server: ${welcomeData.serverInfo?.name} v${welcomeData.serverInfo?.version}`);
          console.log(`   Transport: ${welcomeData.serverInfo?.transport}\n`);
          
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
        console.log('💗 Received ping from server');
      });

      eventSource.onerror = (error) => {
        console.error('❌ SSE connection error:', error.message || 'Connection failed');
        eventSource.close();
        clearTimeout(timeout);
        resolve(false);
      };

      // Timeout after 10 seconds
      timeout = setTimeout(() => {
        if (!receivedWelcome) {
          console.error('⏱️ SSE connection timeout - no welcome message received');
          eventSource.close();
          resolve(false);
        }
      }, 10000);

    } catch (error) {
      console.error('❌ SSE test failed:', error.message);
      resolve(false);
    }
  });
}

async function runTests() {
  console.log(`🚀 Testing ChatGPT Desktop MCP Server at ${BASE_URL}\n`);
  
  // Test if server is running
  try {
    await fetch(`${BASE_URL}/`);
  } catch (error) {
    console.error('❌ Server is not running or not accessible');
    console.log('\n🔧 Please start the server first:');
    console.log('   npm run http-server\n');
    process.exit(1);
  }

  let allTestsPassed = true;

  // Run tests sequentially
  allTestsPassed = await testHTTPEndpoints() && allTestsPassed;
  allTestsPassed = await testJSONRPCEndpoint() && allTestsPassed;
  allTestsPassed = await testSSEEndpoint() && allTestsPassed;

  // Summary
  console.log('=' .repeat(60));
  if (allTestsPassed) {
    console.log('🎉 All tests passed! ChatGPT Desktop MCP Server is working correctly!\n');
    
    console.log('📝 ChatGPT Desktop Configuration:');
    console.log(JSON.stringify({
      mcpClients: {
        playwright: {
          command: `${BASE_URL}/mcp/sse`
        }
      }
    }, null, 2));
    
    console.log('\n✅ You can now use this configuration in ChatGPT Desktop settings.');
  } else {
    console.log('❌ Some tests failed. Please check the server implementation.');
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
  console.error('❌ Test execution failed:', error.message);
  process.exit(1);
});
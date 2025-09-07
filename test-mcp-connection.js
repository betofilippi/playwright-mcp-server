#!/usr/bin/env node

/**
 * Test script to verify MCP server is working correctly
 * Usage: node test-mcp-connection.js
 */

const { spawn } = require('child_process');
const readline = require('readline');

console.log('🧪 MCP Server Connection Test\n');
console.log('Starting Playwright MCP Server...\n');

// Start the server
const serverProcess = spawn('npm', ['run', 'serve'], {
  cwd: __dirname,
  stdio: ['pipe', 'pipe', 'pipe']
});

// Create readline interface for sending commands
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Track if initialized
let initialized = false;
let requestId = 1;

// Helper to send JSON-RPC message
function sendMessage(method, params = {}) {
  const message = JSON.stringify({
    jsonrpc: '2.0',
    id: requestId++,
    method,
    params
  });
  
  console.log(`\n📤 Sending: ${method}`);
  serverProcess.stdin.write(message + '\n');
}

// Handle server output
serverProcess.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(line => line.trim());
  
  lines.forEach(line => {
    try {
      const response = JSON.parse(line);
      
      if (response.result) {
        console.log(`\n✅ Response received:`);
        
        if (response.result.protocolVersion) {
          console.log(`   Protocol: ${response.result.protocolVersion}`);
          console.log(`   Server: ${response.result.serverInfo?.name} v${response.result.serverInfo?.version}`);
          initialized = true;
          
          // After initialization, request tools list
          setTimeout(() => {
            console.log('\n📋 Requesting tools list...');
            sendMessage('tools/list');
          }, 500);
        } else if (response.result.tools) {
          console.log(`   Found ${response.result.tools.length} tools available!`);
          
          // Show first 5 tools as examples
          console.log('\n   Sample tools:');
          response.result.tools.slice(0, 5).forEach(tool => {
            console.log(`   - ${tool.name}: ${tool.description}`);
          });
          
          console.log('\n🎉 MCP Server is working correctly!');
          console.log('\n📝 You can now configure ChatGPT Desktop with:');
          console.log(JSON.stringify({
            mcpServers: {
              playwright: {
                command: 'npm',
                args: ['run', 'serve'],
                cwd: __dirname.replace(/\\/g, '/')
              }
            }
          }, null, 2));
          
          // Success - exit
          setTimeout(() => {
            process.exit(0);
          }, 1000);
        }
      } else if (response.error) {
        console.error(`\n❌ Error: ${response.error.message}`);
      }
    } catch (e) {
      // Not JSON, might be debug output
      if (line.includes('error') || line.includes('Error')) {
        console.error(`\n⚠️ Server message: ${line}`);
      }
    }
  });
});

// Handle server errors
serverProcess.stderr.on('data', (data) => {
  console.error(`\n❌ Server error: ${data}`);
});

// Handle server exit
serverProcess.on('close', (code) => {
  if (code !== 0) {
    console.error(`\n❌ Server exited with code ${code}`);
    console.log('\n🔧 Troubleshooting tips:');
    console.log('1. Run "npm install" to ensure dependencies are installed');
    console.log('2. Check that Node.js version is 18 or higher');
    console.log('3. Ensure TypeScript files are compiled with "npm run build"');
  }
  process.exit(code);
});

// Send initial handshake after a short delay
setTimeout(() => {
  console.log('🤝 Sending MCP handshake...');
  sendMessage('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'test-client',
      version: '1.0.0'
    }
  });
}, 1000);

// Timeout if no response
setTimeout(() => {
  if (!initialized) {
    console.error('\n⏱️ Timeout: No response from server');
    console.log('\n🔧 Troubleshooting tips:');
    console.log('1. Check if the server file exists: src/server.ts');
    console.log('2. Ensure tsx is installed: npm install --save-dev tsx');
    console.log('3. Try running directly: npx tsx src/server.ts');
    process.exit(1);
  }
}, 10000);

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n👋 Stopping test...');
  serverProcess.kill();
  process.exit(0);
});
#!/usr/bin/env node

/**
 * Acceptance tests for jamulus-json-rpc-api-gateway
 * 
 * These tests run against the Docker container in a black-box manner,
 * testing the gateway's HTTP API without modifying the application code.
 */

import { strict as assert } from 'assert';
import http from 'http';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3434';
const API_KEY = process.env.API_KEY || 'test-api-key-123';
const INVALID_API_KEY = 'invalid-api-key-xyz';

// Color codes for test output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.tests = [];
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('\n' + '='.repeat(60));
    console.log('Running Acceptance Tests for jamulus-json-rpc-api-gateway');
    console.log('='.repeat(60) + '\n');

    for (const { name, fn } of this.tests) {
      try {
        process.stdout.write(`  ${name} ... `);
        await fn();
        this.passed++;
        console.log(`${GREEN}✓ PASS${RESET}`);
      } catch (err) {
        this.failed++;
        console.log(`${RED}✗ FAIL${RESET}`);
        console.error(`    ${RED}Error: ${err.message}${RESET}`);
        if (err.stack) {
          console.error(`    ${err.stack.split('\n').slice(1).join('\n    ')}`);
        }
      }
    }

    console.log('\n' + '-'.repeat(60));
    console.log(`Results: ${GREEN}${this.passed} passed${RESET}, ${this.failed > 0 ? RED : ''}${this.failed} failed${RESET}`);
    console.log('-'.repeat(60) + '\n');

    return this.failed === 0;
  }
}

// Helper function to make HTTP requests
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const body = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, headers: res.headers, body });
        } catch (err) {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

// Wait for service to be ready
async function waitForService(url, maxAttempts = 30, delay = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await httpRequest(url);
      if (response.status === 200) {
        return true;
      }
    } catch (err) {
      // Service not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw new Error(`Service at ${url} did not become ready after ${maxAttempts} attempts`);
}

// Create test suite
const runner = new TestRunner();

// Test: Gateway health check
runner.test('GET / returns health check response', async () => {
  const response = await httpRequest(GATEWAY_URL);
  assert.equal(response.status, 200);
  assert.ok(response.body);
  assert.equal(response.body.message, 'This is jamulus-json-rpc-api-gateway');
});

// Test: Missing API key
runner.test('POST /rpc/jamulus/getMode without API key returns error', async () => {
  const response = await httpRequest(`${GATEWAY_URL}/rpc/jamulus/getMode`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: {}
  });
  
  assert.equal(response.status, 500);
  assert.ok(response.body);
  assert.ok(response.body.message);
  assert.ok(response.body.message.includes('Missing X-API-Key header'));
});

// Test: Invalid API key
runner.test('POST /rpc/jamulus/getMode with invalid API key returns error', async () => {
  const response = await httpRequest(`${GATEWAY_URL}/rpc/jamulus/getMode`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': INVALID_API_KEY
    },
    body: {}
  });
  
  assert.equal(response.status, 500);
  assert.ok(response.body);
  assert.ok(response.body.message);
  assert.ok(response.body.message.includes('Invalid X-API-Key header'));
});

// Test: Valid request to jamulus/getMode
runner.test('POST /rpc/jamulus/getMode with valid API key returns response', async () => {
  const response = await httpRequest(`${GATEWAY_URL}/rpc/jamulus/getMode`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    },
    body: {}
  });
  
  assert.equal(response.status, 200);
  assert.ok(response.body);
  assert.equal(response.body.jsonrpc, '2.0');
  assert.ok(response.body.result);
  assert.equal(response.body.result.mode, 'server');
});

// Test: Valid request to jamulus/getVersion
runner.test('POST /rpc/jamulus/getVersion with valid API key returns response', async () => {
  const response = await httpRequest(`${GATEWAY_URL}/rpc/jamulus/getVersion`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    },
    body: {}
  });
  
  assert.equal(response.status, 200);
  assert.ok(response.body);
  assert.equal(response.body.jsonrpc, '2.0');
  assert.ok(response.body.result);
  assert.ok(response.body.result.version);
});

// Test: Request with params
runner.test('POST /rpc/jamulusclient/getChannelInfo with params returns response', async () => {
  const response = await httpRequest(`${GATEWAY_URL}/rpc/jamulusclient/getChannelInfo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY
    },
    body: {
      params: {}
    }
  });
  
  assert.equal(response.status, 200);
  assert.ok(response.body);
  assert.equal(response.body.jsonrpc, '2.0');
  assert.ok(response.body.result);
  assert.ok(response.body.result.name);
});

// Test: Multiple sequential requests (verifies connection handling)
runner.test('Multiple sequential requests work correctly', async () => {
  for (let i = 0; i < 3; i++) {
    const response = await httpRequest(`${GATEWAY_URL}/rpc/jamulus/getMode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: {}
    });
    
    assert.equal(response.status, 200);
    assert.ok(response.body);
    assert.equal(response.body.result.mode, 'server');
  }
});

// Main execution
(async () => {
  try {
    console.log('Waiting for gateway to be ready...');
    await waitForService(GATEWAY_URL);
    console.log('Gateway is ready!\n');

    const success = await runner.run();
    process.exit(success ? 0 : 1);
  } catch (err) {
    console.error(`${RED}Fatal error: ${err.message}${RESET}`);
    process.exit(1);
  }
})();

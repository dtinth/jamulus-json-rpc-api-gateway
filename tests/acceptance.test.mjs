#!/usr/bin/env node

/**
 * Acceptance tests for jamulus-json-rpc-api-gateway
 * 
 * These tests run against the Docker container in a black-box manner,
 * testing the gateway's HTTP API without modifying the application code.
 * 
 * Uses Node.js built-in test runner (available since v18).
 */

import { describe, it, before } from 'node:test';
import { strict as assert } from 'node:assert';
import http from 'node:http';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3434';
const API_KEY = process.env.API_KEY || 'test-api-key-123';
const INVALID_API_KEY = 'invalid-api-key-xyz';

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

// Wait for gateway before running tests
before(async () => {
  console.log('Waiting for gateway to be ready...');
  await waitForService(GATEWAY_URL);
  console.log('Gateway is ready!\n');
});

describe('jamulus-json-rpc-api-gateway acceptance tests', () => {
  it('GET / returns health check response', async () => {
    const response = await httpRequest(GATEWAY_URL);
    assert.equal(response.status, 200);
    assert.ok(response.body);
    assert.equal(response.body.message, 'This is jamulus-json-rpc-api-gateway');
  });

  it('POST /rpc/jamulus/getMode without API key returns error', async () => {
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

  it('POST /rpc/jamulus/getMode with invalid API key returns error', async () => {
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

  it('POST /rpc/jamulus/getMode with valid API key returns response', async () => {
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

  it('POST /rpc/jamulus/getVersion with valid API key returns response', async () => {
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

  it('POST /rpc/jamulusclient/getChannelInfo with params returns response', async () => {
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

  it('Multiple sequential requests work correctly', async () => {
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
});

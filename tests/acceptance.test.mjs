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
import crypto from 'node:crypto';
import { importPKCS8, SignJWT } from 'jose';

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3434';
const API_KEY = process.env.API_KEY || 'test-api-key-123';
const INVALID_API_KEY = 'invalid-api-key-xyz';
const JWT_PRIVATE_KEY_BASE64 = process.env.JWT_PRIVATE_KEY_BASE64;
const jwtPrivateKeyPem = JWT_PRIVATE_KEY_BASE64
  ? Buffer.from(JWT_PRIVATE_KEY_BASE64, 'base64').toString('utf8')
  : null;
const jwtPrivateKeyPromise = jwtPrivateKeyPem
  ? importPKCS8(jwtPrivateKeyPem, 'Ed25519')
  : null;
const jwtEnabled = Boolean(jwtPrivateKeyPromise);

async function createJwt(method, params = {}, overrides = {}) {
  if (!jwtPrivateKeyPromise) {
    throw new Error('JWT private key not configured');
  }
  const key = await jwtPrivateKeyPromise;
  const exp = overrides.exp ?? Math.floor(Date.now() / 1000) + 60;
  const jti = overrides.jti ?? crypto.randomUUID();
  const builder = new SignJWT({
    method,
    params,
    jti,
  })
    .setProtectedHeader({ alg: 'EdDSA' })
    .setExpirationTime(exp);
  if (overrides.nbf !== undefined) {
    builder.setNotBefore(overrides.nbf);
  }
  return builder.sign(key);
}

async function buildRpcRequest(method, params = {}, options = {}) {
  const useJsonBody = options.forceJsonBody || !jwtEnabled;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.apiKey !== undefined ? { 'X-API-Key': options.apiKey } : options.skipApiKey ? {} : { 'X-API-Key': API_KEY }),
    ...(options.headers || {}),
  };
  const body = useJsonBody
    ? { params }
    : { jwt: await createJwt(method, params, options.jwtOverrides || {}) };
  return { headers, body };
}

async function callRpc(method, params = {}, options = {}) {
  const { headers, body } = await buildRpcRequest(method, params, options);
  return httpRequest(`${GATEWAY_URL}/rpc/${method}`, {
    method: 'POST',
    headers,
    body,
  });
}

// Helper function to make HTTP requests
async function httpRequest(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: options.headers || {},
    body:
      typeof options.body === 'string'
        ? options.body
        : options.body
          ? JSON.stringify(options.body)
          : undefined,
  });

  let body;
  const text = await response.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch (err) {
    body = text;
  }

  return {
    status: response.status,
    headers: response.headers,
    body
  };
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
    const response = await callRpc('jamulus/getMode', {}, { skipApiKey: true });
    
    assert.equal(response.status, 500);
    assert.ok(response.body);
    assert.ok(response.body.message);
    assert.ok(response.body.message.includes('Missing X-API-Key header'));
  });

  it('POST /rpc/jamulus/getMode with invalid API key returns error', async () => {
    const response = await callRpc('jamulus/getMode', {}, { apiKey: INVALID_API_KEY });
    
    assert.equal(response.status, 500);
    assert.ok(response.body);
    assert.ok(response.body.message);
    assert.ok(response.body.message.includes('Invalid X-API-Key header'));
  });

  it('POST /rpc/jamulus/getMode with valid API key returns response', async () => {
    const response = await callRpc('jamulus/getMode');
    
    assert.equal(response.status, 200);
    assert.ok(response.body);
    assert.equal(response.body.jsonrpc, '2.0');
    assert.ok(response.body.result);
    assert.equal(response.body.result.mode, 'server');
  });

  it('POST /rpc/jamulus/getVersion with valid API key returns response', async () => {
    const response = await callRpc('jamulus/getVersion');
    
    assert.equal(response.status, 200);
    assert.ok(response.body);
    assert.equal(response.body.jsonrpc, '2.0');
    assert.ok(response.body.result);
    assert.ok(response.body.result.version);
  });

  it('POST /rpc/jamulusclient/getChannelInfo with params returns response', async () => {
    const response = await callRpc('jamulusclient/getChannelInfo', {});
    
    assert.equal(response.status, 200);
    assert.ok(response.body);
    assert.equal(response.body.jsonrpc, '2.0');
    assert.ok(response.body.result);
    assert.ok(response.body.result.name);
  });

  it('Multiple sequential requests work correctly', async () => {
    for (let i = 0; i < 3; i++) {
      const response = await callRpc('jamulus/getMode');
      
      assert.equal(response.status, 200);
      assert.ok(response.body);
      assert.equal(response.body.result.mode, 'server');
    }
  });

  if (jwtEnabled) {
    it('rejects plain JSON body when JWT is required', async () => {
      const response = await callRpc('jamulus/getMode', {}, { forceJsonBody: true });

      assert.equal(response.status, 500);
      assert.ok(response.body);
      assert.ok(response.body.message.includes('Expected jwt'));
    });

    it('rejects replayed JWT tokens', async () => {
      const jwtOverrides = {
        jti: 'replay-test-token',
        exp: Math.floor(Date.now() / 1000) + 60,
      };
      const first = await callRpc('jamulus/getMode', {}, { jwtOverrides });
      assert.equal(first.status, 200);

      const second = await callRpc('jamulus/getMode', {}, { jwtOverrides });
      assert.equal(second.status, 500);
      assert.ok(second.body);
      assert.ok(second.body.message.includes('already been used'));
    });

    it('rejects JWT exp too far in future', async () => {
      const response = await callRpc('jamulus/getMode', {}, {
        jwtOverrides: {
          exp: Math.floor(Date.now() / 1000) + 600,
        }
      });
      assert.equal(response.status, 500);
      assert.ok(response.body);
      assert.ok(response.body.message.includes('exp too far'));
    });
  }
});

#!/usr/bin/env node

/**
 * Mock Jamulus JSON-RPC Server for testing
 * 
 * This server implements the Jamulus JSON-RPC protocol:
 * - Listens on TCP socket
 * - Uses NDJSON (newline-delimited JSON) format
 * - Implements authentication flow (jamulus/apiAuth)
 * - Responds to basic JSON-RPC methods for testing
 */

import net from 'net';
import { createInterface } from 'readline';

const PORT = process.env.JAMULUS_PORT || 22222;
const HOST = process.env.JAMULUS_HOST || '0.0.0.0';
const SECRET = process.env.JAMULUS_SECRET || 'test-secret-1234567890';

// Mock data for responses
const MOCK_RESPONSES = {
  'jamulus/getMode': {
    mode: 'server'
  },
  'jamulus/getVersion': {
    version: '3.9.1'
  },
  'jamulusclient/getChannelInfo': {
    id: 0,
    name: 'Test User',
    skillLevel: 'intermediate',
    countryId: 225,
    country: 'United States'
  }
};

class MockJamulusServer {
  constructor(port, host, secret) {
    this.port = port;
    this.host = host;
    this.secret = secret;
    this.server = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        console.log('Client connected:', socket.remoteAddress);
        this.handleConnection(socket);
      });

      this.server.on('error', (err) => {
        console.error('Server error:', err);
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        console.log(`Mock Jamulus server listening on ${this.host}:${this.port}`);
        console.log(`Secret: ${this.secret}`);
        resolve();
      });
    });
  }

  handleConnection(socket) {
    let authenticated = false;
    
    const rl = createInterface({
      input: socket,
      crlfDelay: Infinity
    });

    rl.on('line', (line) => {
      try {
        const request = JSON.parse(line);
        console.log('Received request:', JSON.stringify(request));

        const response = this.handleRequest(request, authenticated);
        
        // Update authentication state if this was a successful auth request
        if (request.method === 'jamulus/apiAuth' && !response.error) {
          authenticated = true;
        }

        console.log('Sending response:', JSON.stringify(response));
        socket.write(JSON.stringify(response) + '\n');
      } catch (err) {
        console.error('Error processing request:', err);
        const errorResponse = {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32700,
            message: 'Parse error'
          }
        };
        socket.write(JSON.stringify(errorResponse) + '\n');
      }
    });

    socket.on('error', (err) => {
      console.error('Socket error:', err);
    });

    socket.on('end', () => {
      console.log('Client disconnected');
    });
  }

  handleRequest(request, authenticated) {
    const { id, method, params } = request;

    // Handle authentication request
    if (method === 'jamulus/apiAuth') {
      if (params && params.secret === this.secret) {
        return {
          jsonrpc: '2.0',
          id,
          result: 'ok'
        };
      } else {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32000,
            message: 'Authentication failed: Invalid secret'
          }
        };
      }
    }

    // Check if authenticated for other methods
    if (!authenticated) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32001,
          message: 'Not authenticated. Call jamulus/apiAuth first.'
        }
      };
    }

    // Handle other methods
    if (MOCK_RESPONSES[method]) {
      return {
        jsonrpc: '2.0',
        id,
        result: MOCK_RESPONSES[method]
      };
    }

    // Method not found
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`
      }
    };
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('Mock Jamulus server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new MockJamulusServer(PORT, HOST, SECRET);
  
  server.start().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down...');
    await server.stop();
    process.exit(0);
  });
}

export default MockJamulusServer;

# Acceptance Tests

This directory contains comprehensive black-box acceptance tests for the jamulus-json-rpc-api-gateway.

## Contents

- **`mock-jamulus-server.mjs`** - Mock implementation of the Jamulus JSON-RPC server
  - Listens on TCP socket
  - Implements NDJSON (newline-delimited JSON) protocol
  - Handles authentication (`jamulus/apiAuth`)
  - Responds to test JSON-RPC methods

- **`acceptance.test.mjs`** - Test suite that validates:
  - Basic JSON-RPC calls through HTTP API
  - Authentication with API keys
  - Error handling (missing/invalid API keys)
  - Request forwarding and response handling
  - Multiple sequential requests

- **`docker-compose.test.yml`** - Docker Compose configuration for testing
  - Sets up mock Jamulus server
  - Runs API gateway container
  - Executes tests in isolated environment

- **`run-local-tests.sh`** - Script to run tests locally without Docker

## Running Tests

### Prerequisites

This project uses **pnpm**. First install dependencies:

```bash
corepack enable
pnpm install
```

### Option 1: Local Testing (Recommended for Development)

Run tests locally without Docker:

```bash
bash tests/run-local-tests.sh
```

This script:
1. Starts the mock Jamulus server
2. Starts the API gateway
3. Runs the acceptance tests
4. Cleans up all processes

### Option 2: Docker Compose Testing

Test the actual Docker container:

```bash
# Build the Docker image
docker build -t jamulus-json-rpc-api-gateway:test .

# Run tests with Docker Compose
cd tests
docker compose -f docker-compose.test.yml up --exit-code-from test-runner

# Cleanup
docker compose -f docker-compose.test.yml down -v
```

### Option 3: Manual Testing

Test the mock server independently:

```bash
# Terminal 1: Start mock Jamulus server
JAMULUS_PORT=22222 JAMULUS_SECRET="test-secret" node tests/mock-jamulus-server.mjs

# Terminal 2: Test with netcat
(echo '{"id":1,"jsonrpc":"2.0","method":"jamulus/apiAuth","params":{"secret":"test-secret"}}' && \
 echo '{"id":2,"jsonrpc":"2.0","method":"jamulus/getMode","params":{}}') | nc localhost 22222
```

## CI/CD

The GitHub Actions workflow `.github/workflows/acceptance-tests.yml` automatically runs these tests on every push and pull request.

## Mock Server Details

The mock Jamulus server implements the following JSON-RPC methods:

- `jamulus/apiAuth` - Authentication (required before other calls)
- `jamulus/getMode` - Returns `{"mode": "server"}`
- `jamulus/getVersion` - Returns `{"version": "3.9.1"}`
- `jamulusclient/getChannelInfo` - Returns mock channel information

## Test Coverage

The test suite validates:

1. ✅ Health check endpoint (`GET /`)
2. ✅ Missing API key returns error
3. ✅ Invalid API key returns error
4. ✅ Valid requests with authentication
5. ✅ Multiple methods (`getMode`, `getVersion`, `getChannelInfo`)
6. ✅ Multiple sequential requests
7. ✅ Proper JSON-RPC response format

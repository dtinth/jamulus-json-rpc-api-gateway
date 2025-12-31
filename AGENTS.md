# Agent Learnings

This file contains important information about the project that agents should know when working on this codebase.

## Project Overview

This is a **jamulus-json-rpc-api-gateway** that provides a stateless HTTP API gateway for Jamulus' JSON-RPC API. The gateway makes it easier to interact with Jamulus servers by:
- Converting HTTP requests to JSON-RPC over TCP
- Managing authentication with the Jamulus server
- Providing API key-based access control

## Technology Stack

- **Runtime**: Node.js 20.10.0
- **Package Manager**: **pnpm** (NOT npm!) - Always use `pnpm install`, `pnpm add`, etc.
- **Framework**: Fastify (web server)
- **Language**: JavaScript (ES modules with .mjs extension)
- **Deployment**: Docker (Alpine-based image)

## Key Commands

### Installation
```bash
corepack enable
pnpm install
```

### Running the Application
```bash
node src/server.mjs
```

Required environment variables:
- `JAMULUS_SECRET` - Secret for Jamulus authentication
- `JAMULUS_HOST` - Jamulus server host (default: 127.0.0.1)
- `JAMULUS_PORT` - Jamulus server port (default: 22222)
- `API_KEYS` - Comma-separated list of valid API keys
- `PORT` - Gateway listen port (default: 3434)
- `LISTEN_HOST` - Gateway bind address (default: 0.0.0.0)

### Testing
```bash
# Run acceptance tests locally
bash tests/run-local-tests.sh

# Or run directly with Node.js built-in test runner
node --test tests/acceptance.test.mjs

# Run with Docker Compose
docker build -t jamulus-json-rpc-api-gateway:test .
cd tests && docker compose -f docker-compose.test.yml up --exit-code-from test-runner
```

## Architecture Details

### Application Code (DO NOT MODIFY for acceptance tests)
- **`src/server.mjs`** - Main application file
  - Creates Fastify HTTP server
  - Implements API key validation
  - Connects to Jamulus JSON-RPC server via TCP
  - Uses NDJSON (newline-delimited JSON) protocol
  - Each request creates a new TCP connection to Jamulus
  - Authenticates with `jamulus/apiAuth` before each JSON-RPC call

### Acceptance Tests (Black-box Testing)
- **`tests/mock-jamulus-server.mjs`** - Mock Jamulus server implementation
  - Implements TCP server with NDJSON protocol
  - Handles authentication flow
  - Responds to test JSON-RPC methods
  
- **`tests/acceptance.test.mjs`** - Test suite
  - Tests HTTP API without modifying application code
  - Validates authentication, error handling, and request forwarding
  - **Uses Node.js built-in test runner** (`node:test`, available since v18)
  - Simple HTTP client implementation (no external dependencies)
  
- **`tests/docker-compose.test.yml`** - Container orchestration for testing
  - Defines mock-jamulus, gateway, and test-runner services
  - Uses health checks to ensure proper startup order
  
- **`tests/run-local-tests.sh`** - Local test runner
  - Starts mock server, gateway, and runs tests
  - Handles cleanup on exit

## Jamulus JSON-RPC Protocol

The Jamulus JSON-RPC API uses:
- **Transport**: TCP with NDJSON (newline-delimited JSON)
- **Protocol**: JSON-RPC 2.0
- **Authentication**: Required before any other calls via `jamulus/apiAuth` method
- **Format**: Each request/response is a single line of JSON followed by `\n`

Example authentication flow:
```json
{"id":1,"jsonrpc":"2.0","method":"jamulus/apiAuth","params":{"secret":"..."}}
{"id":1,"jsonrpc":"2.0","result":"ok"}
```

## Gateway API Usage

The gateway exposes JSON-RPC methods as HTTP endpoints:

```bash
# Call jamulus/getMode
curl -X POST http://localhost:3434/rpc/jamulus/getMode \
  -H "x-api-key: your-api-key"

# Call with parameters
curl -X POST http://localhost:3434/rpc/jamulus/someMethod \
  -H "x-api-key: your-api-key" \
  -H "content-type: application/json" \
  -d '{"params": {"key": "value"}}'
```

## Important Notes

1. **Use pnpm**: This project uses pnpm as its package manager. Never use npm commands.

2. **Application code is read-only for acceptance tests**: The tests validate the gateway in a black-box manner without modifying `src/` files.

3. **Fastify body parsing**: When sending POST requests with `Content-Type: application/json`, you must include a valid JSON body (even if it's `{}`). Empty bodies will cause a 400 error.

4. **Connection pattern**: The gateway creates a new TCP connection to Jamulus for each HTTP request and closes it after receiving the response.

5. **Authentication**: Each request to Jamulus requires authentication via `jamulus/apiAuth` before the actual method call.

6. **Docker build**: The Dockerfile uses `corepack enable` to ensure pnpm is available, then runs `pnpm install` to install dependencies.

7. **CI/CD**: Two GitHub Actions workflows:
   - `.github/workflows/docker-publish.yml` - Builds and publishes Docker image
   - `.github/workflows/acceptance-tests.yml` - Runs acceptance tests on PR/push

## Testing Strategy

The acceptance tests follow a black-box approach:
1. Mock the Jamulus server to avoid dependency on real Jamulus
2. Test the gateway through its HTTP API only
3. Validate all error conditions (missing/invalid API keys)
4. Verify proper protocol implementation (authentication, NDJSON, JSON-RPC)
5. Test multiple requests to ensure connection handling works correctly

## Docker Compose Testing

When running tests with Docker Compose from the `tests/` directory:
- **Volume mounts**: Use `.:/app` to mount the current directory (tests/) as /app
- **Commands**: Reference files directly without subdirectory paths (e.g., `node mock-jamulus-server.mjs` not `node tests/mock-jamulus-server.mjs`)
- **Version field**: The `version` field in docker-compose.yml is obsolete in modern Docker Compose and should be omitted
- **Pre-built images**: Use pre-built images (e.g., `jamulus-json-rpc-api-gateway:test`) instead of building in docker-compose to avoid context path issues

## HTTP Client Implementation

- **Use fetch**: Node.js 18+ has built-in `fetch` support - use it instead of custom HTTP client implementations
- **Simplicity**: fetch is simpler and more familiar than low-level http.request()
- **Async/await**: fetch naturally works with async/await, making test code cleaner

## Future Considerations

- Consider adding integration tests with a real Jamulus server
- Add performance/load testing for the gateway
- Add monitoring/metrics endpoints
- Consider connection pooling to Jamulus for better performance

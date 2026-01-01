#!/bin/bash

# Local test runner for acceptance tests
# This script runs the tests locally without Docker for development
# NOTE: This project uses pnpm. Run 'corepack enable && pnpm install' first.

set -e

echo "======================================"
echo "Local Acceptance Test Runner"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
JAMULUS_PORT=22223
JAMULUS_SECRET="test-secret-1234567890"
GATEWAY_PORT=3435
API_KEY="test-api-key-123"
JWT_PUBLIC_KEY_BASE64="LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUNvd0JRWURLMlZ3QXlFQTZFdmh1cnlkYmlSOWZGQThWVEM0RFBGYjMzZk13aWV5dnphZTZyTjNxajQ9Ci0tLS0tRU5EIFBVQkxJQyBLRVktLS0tLQo="
JWT_PRIVATE_KEY_BASE64="LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1DNENBUUF3QlFZREsyVndCQ0lFSUM4MFNBZ05TSlF2MTM2a2tpSjZEL3R0N0ZoZ2RFRndnRHZNcElONWgwT0gKLS0tLS1FTkQgUFJJVkFURSBLRVktLS0tLQo="

echo "Starting mock Jamulus server on port ${JAMULUS_PORT}..."
JAMULUS_PORT=${JAMULUS_PORT} JAMULUS_SECRET="${JAMULUS_SECRET}" node tests/mock-jamulus-server.mjs &
JAMULUS_PID=$!

# Wait for mock server to start
sleep 2

echo "Starting API gateway on port ${GATEWAY_PORT}..."
cd "$(dirname "$0")/.."
PORT=${GATEWAY_PORT} \
  LISTEN_HOST=127.0.0.1 \
  JAMULUS_SECRET="${JAMULUS_SECRET}" \
  JAMULUS_HOST=127.0.0.1 \
  JAMULUS_PORT=${JAMULUS_PORT} \
  API_KEYS="${API_KEY},another-key" \
  JWT_PUBLIC_KEY="${JWT_PUBLIC_KEY_BASE64}" \
  node src/server.mjs &
GATEWAY_PID=$!

# Function to cleanup on exit
cleanup() {
  echo ""
  echo "Cleaning up..."
  if [ ! -z "$GATEWAY_PID" ]; then
    kill $GATEWAY_PID 2>/dev/null || true
  fi
  if [ ! -z "$JAMULUS_PID" ]; then
    kill $JAMULUS_PID 2>/dev/null || true
  fi
  wait 2>/dev/null || true
  echo "Cleanup complete"
}

trap cleanup EXIT INT TERM

# Wait for services to be ready
sleep 3

echo ""
echo "Running acceptance tests..."
echo ""

# Run tests with Node.js built-in test runner
GATEWAY_URL="http://127.0.0.1:${GATEWAY_PORT}" \
  API_KEY="${API_KEY}" \
  JWT_PRIVATE_KEY_BASE64="${JWT_PRIVATE_KEY_BASE64}" \
  node --test tests/acceptance.test.mjs
TEST_RESULT=$?

if [ $TEST_RESULT -eq 0 ]; then
  echo ""
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo ""
  echo -e "${RED}✗ Tests failed!${NC}"
  exit 1
fi

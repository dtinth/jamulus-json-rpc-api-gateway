# jamulus-json-rpc-api-gateway

This repository contains the source code for the Jamulus JSON-RPC API Gateway. The API Gateway makes [Jamulus’ JSON-RPC API](https://github.com/jamulussoftware/jamulus/blob/main/docs/JSON-RPC.md) easier to use by exposing a stateless HTTP API that can be easily called from any programming language.

## Usage

Sample `.env` file:

```sh
# The Jamulus JSON API connection details
JAMULUS_SECRET=
JAMULUS_HOST=
JAMULUS_PORT=

# Comma-separated list of API keys that are allowed to access the API
API_KEYS=

# The port and host the API Gateway should listen on
PORT=
LISTEN_HOST=
```

Sample `docker-compose.yml` file:

```yml
services:
  gateway:
    image: ghcr.io/dtinth/jamulus-json-rpc-api-gateway:main
    network_mode: host
    restart: unless-stopped
    env_file:
      - .env
```

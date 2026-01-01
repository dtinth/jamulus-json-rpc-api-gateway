# jamulus-json-rpc-api-gateway

This repository contains the source code for the Jamulus JSON-RPC API Gateway. The API Gateway makes [Jamulus’ JSON-RPC API](https://github.com/jamulussoftware/jamulus/blob/main/docs/JSON-RPC.md) easier to use by exposing a stateless HTTP API that can be easily called from any programming language.

## Usage

Sample `.env` file:

```sh
# The Jamulus JSON API connection details
JAMULUS_SECRET=  # Can be the secret string, or an absolute path to a file containing the secret
JAMULUS_HOST=
JAMULUS_PORT=

# Comma-separated list of API keys that are allowed to access the API
API_KEYS=

# Optional Ed25519 public key (PEM or JWK). Accepts:
# - Base64-encoded PEM (string)
# - PEM contents
# - Absolute path to PEM file
# - JWK JSON string (public key)
# When provided, request bodies must carry a signed JWT.
JWT_PUBLIC_KEY=

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

After the service is up, you can run any [Jamulus JSON-RPC method](https://github.com/jamulussoftware/jamulus/blob/main/docs/JSON-RPC.md) by making an HTTP request to the gateway:

```sh
curl -X POST http://localhost:$PORT/rpc/jamulus/getMode -H "x-api-key: $API_KEY"
```

## JWT request mode

If the `JWT_PUBLIC_KEY` environment variable is set, the gateway requires POST bodies to be JSON with a `jwt` field:

```json
{ "jwt": "<signed token>" }
```

The JWT must be signed with the corresponding Ed25519 private key and include:

- `method`: the RPC path (for example `jamulus/getMode`)
- `params`: optional RPC params object
- `exp`: expiration timestamp (seconds since epoch)
- `jti`: unique token ID (replay protection)
- Optional `nbf`: not-before timestamp

Recommendations:
- Keep `exp` within 3 minutes; the gateway rejects tokens expiring more than 5 minutes in the future to bound replay cache size.

The `X-API-Key` header is still required. Example payload (before signing):

```json
{
  "method": "jamulus/getMode",
  "params": {},
  "exp": 1700000000,
  "jti": "unique-token-id"
}
```

import { Env } from "@(-.-)/env";
import { createPublicKey, randomUUID, verify } from "crypto";
import Fastify from "fastify";
import fs from "fs";
import ndjson from "ndjson";
import net from "net";
import path from "path";
import { z } from "zod";

const env = Env(
  z.object({
    PORT: z.coerce.number().default(3434),
    LISTEN_HOST: z.string().default("0.0.0.0"),
    JAMULUS_SECRET: z.string(),
    JAMULUS_HOST: z.string().default("127.0.0.1"),
    JAMULUS_PORT: z.coerce.number().default(22222),
    API_KEYS: z
      .string()
      .min(1)
      .transform((value) => value.split(",")),
    JWT_PUBLIC_KEY: z.string().optional(),
  })
);

env.validate();

// Get the Jamulus secret, potentially reading from a file
let jamulusSecret = env.JAMULUS_SECRET;
// Check if JAMULUS_SECRET is an absolute path and read it if it exists
if (path.isAbsolute(env.JAMULUS_SECRET) && fs.existsSync(env.JAMULUS_SECRET)) {
  try {
    jamulusSecret = fs.readFileSync(env.JAMULUS_SECRET, "utf8").trim();
    console.log(`Read Jamulus secret from file: ${env.JAMULUS_SECRET}`);
  } catch (error) {
    console.error(`Error reading JAMULUS_SECRET from file: ${error.message}`);
    process.exit(1);
  }
}

const fastify = Fastify({ logger: true });

fastify.addContentTypeParser(
  "application/jwt",
  { parseAs: "string" },
  (request, body, done) => {
    done(null, body);
  }
);

let jwtVerifier = null;
if (env.JWT_PUBLIC_KEY) {
  try {
    jwtVerifier = createJwtVerifier(env.JWT_PUBLIC_KEY);
  } catch (error) {
    console.error(`Error initializing JWT verifier: ${error.message}`);
    process.exit(1);
  }
}

const jamulusClient = createJamulusClient();

function createJamulusClient() {
  return {
    request: async (method, params) => {
      const socket = await new Promise((resolve, reject) => {
        const conn = net.connect({
          host: env.JAMULUS_HOST,
          port: env.JAMULUS_PORT,
        });
        conn.on("error", reject);
        conn.on("connect", () => {
          resolve(conn);
        });
      });
      const stream = socket.pipe(ndjson.parse());
      try {
        const makeRequest = async (method, params) => {
          const id = randomUUID();
          const request = { jsonrpc: "2.0", method, params, id };
          const promise = new Promise((resolve, reject) => {
            stream.on("data", (response) => {
              if (response.id === id) {
                resolve(response);
              }
            });
            stream.on("error", reject);
          });
          socket.write(JSON.stringify(request) + "\n");
          return await promise;
        };
        const authResult = await makeRequest("jamulus/apiAuth", {
          secret: jamulusSecret,
        });
        if (authResult.error) {
          throw new Error(
            `Unable to authenticate: ${authResult.error.message}`
          );
        }
        return await makeRequest(method, params);
      } finally {
        socket.end();
      }
    },
  };
}

fastify.get("/", async () => ({
  message: "This is jamulus-json-rpc-api-gateway",
}));

fastify.post("/rpc/*", async (request) => {
  const apiKey = request.headers["x-api-key"];
  if (!apiKey) {
    throw new Error("Missing X-API-Key header");
  }
  if (!env.API_KEYS.includes(apiKey)) {
    throw new Error("Invalid X-API-Key header");
  }
  const method = String(request.params["*"]);
  const params = jwtVerifier
    ? jwtVerifier.verify(request.body, method).params || {}
    : request.body?.params || {};
  return jamulusClient.request(method, params);
});

function createJwtVerifier(publicKeyInput) {
  const publicKey = createPublicKey(readPublicKey(publicKeyInput));
  const usedJtis = new Map();
  const replayCacheState = { lastCleanup: 0 };
  return {
    verify(token, expectedMethod) {
      if (typeof token !== "string" || token.length === 0) {
        throw new Error("Expected JWT body");
      }
      const segments = token.split(".");
      if (segments.length !== 3) {
        throw new Error("Invalid JWT format");
      }
      const [headerSegment, payloadSegment, signatureSegment] = segments;
      const header = parseJwtSegment(headerSegment);
      if (header.alg !== "EdDSA") {
        throw new Error("Invalid JWT algorithm");
      }
      const signedData = Buffer.from(`${headerSegment}.${payloadSegment}`);
      const signature = base64UrlDecode(signatureSegment);
      const verified = verify(null, signedData, publicKey, signature);
      if (!verified) {
        throw new Error("Invalid JWT signature");
      }
      const payload = parseJwtSegment(payloadSegment);
      const now = Math.floor(Date.now() / 1000);
      if (typeof payload.exp !== "number") {
        throw new Error("JWT payload missing exp");
      }
      if (payload.exp <= now) {
        throw new Error("JWT expired");
      }
      if (payload.nbf && payload.nbf > now) {
        throw new Error("JWT not yet valid");
      }
      if (!payload.jti) {
        throw new Error("JWT payload missing jti");
      }
      cleanupReplayCache(usedJtis, now, replayCacheState);
      const replayExpiration = usedJtis.get(payload.jti);
      if (replayExpiration && replayExpiration > now) {
        throw new Error("JWT has already been used");
      }
      usedJtis.set(payload.jti, payload.exp);
      if (!payload.method) {
        throw new Error("JWT payload missing method");
      }
      if (payload.method !== expectedMethod) {
        throw new Error("JWT method mismatch");
      }
      if (
        payload.params !== undefined &&
        (payload.params === null ||
          typeof payload.params !== "object" ||
          Array.isArray(payload.params))
      ) {
        throw new Error("JWT params must be an object");
      }
      return payload;
    },
  };
}

function cleanupReplayCache(cache, now, state) {
  if (now - state.lastCleanup < 60) {
    return;
  }
  for (const [key, expiry] of cache) {
    if (expiry <= now) {
      cache.delete(key);
    }
  }
  state.lastCleanup = now;
}

function parseJwtSegment(segment) {
  return JSON.parse(base64UrlDecode(segment).toString("utf8"));
}

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4;
  const padded =
    padding === 0 ? normalized : normalized.padEnd(normalized.length + (4 - padding), "=");
  return Buffer.from(padded, "base64");
}

function readPublicKey(value) {
  const trimmed = value.trim();
  if (path.isAbsolute(trimmed) && fs.existsSync(trimmed)) {
    const fileContent = fs.readFileSync(trimmed, "utf8").trim();
    if (!isPemPublicKey(fileContent)) {
      throw new Error("JWT_PUBLIC_KEY file must contain a PEM public key");
    }
    return fileContent;
  }
  if (isPemPublicKey(trimmed)) {
    return trimmed;
  }
  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8").trim();
    if (isPemPublicKey(decoded)) {
      return decoded;
    }
  } catch (error) {
    // fall through to error below
  }
  throw new Error("Invalid JWT_PUBLIC_KEY format");
}

function isPemPublicKey(content) {
  return /^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----$/.test(
    content.trim()
  );
}

fastify.listen({ port: env.PORT, host: env.LISTEN_HOST });

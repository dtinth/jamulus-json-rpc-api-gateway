import fs from "fs";
import { importJWK, importSPKI, jwtVerify } from "jose";
import path from "path";

const MAX_FUTURE_EXP_SECONDS = 300; // hard cap to keep replay cache bounded
const CACHE_CLEAN_INTERVAL_SECONDS = 60;

export async function createJwtVerifier(publicKeyInput) {
  const publicKey = await loadPublicKey(publicKeyInput);
  const usedJtis = new Map();
  let lastCleanup = 0;

  return {
    async verifyJwt(token, expectedMethod) {
      if (typeof token !== "string" || token.length === 0) {
        throw new Error("Expected jwt string");
      }

      const { payload } = await jwtVerify(token, publicKey, {
        algorithms: ["EdDSA"],
      });
      const now = Math.floor(Date.now() / 1000);

      if (typeof payload.exp !== "number") {
        throw new Error("JWT payload missing exp");
      }
      if (payload.exp <= now) {
        throw new Error("JWT expired");
      }
      if (payload.exp - now > MAX_FUTURE_EXP_SECONDS) {
        throw new Error("JWT exp too far in the future");
      }
      if (payload.nbf && payload.nbf > now) {
        throw new Error("JWT not yet valid");
      }
      if (!payload.jti || typeof payload.jti !== "string") {
        throw new Error("JWT payload missing jti");
      }

      if (now - lastCleanup >= CACHE_CLEAN_INTERVAL_SECONDS) {
        for (const [key, exp] of usedJtis) {
          if (exp <= now) {
            usedJtis.delete(key);
          }
        }
        lastCleanup = now;
      }
      if (usedJtis.has(payload.jti)) {
        throw new Error("JWT has already been used");
      }
      usedJtis.set(payload.jti, payload.exp);

      if (!payload.method || typeof payload.method !== "string") {
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

      return { params: payload.params || {} };
    },
  };
}

async function loadPublicKey(value) {
  const trimmed = value.trim();
  if (path.isAbsolute(trimmed) && fs.existsSync(trimmed)) {
    const fileContent = fs.readFileSync(trimmed, "utf8").trim();
    return importKeyFromString(fileContent, true);
  }
  return importKeyFromString(trimmed, false);
}

async function importKeyFromString(content, fromFile) {
  const trimmed = content.trim();
  if (isPemPublicKey(trimmed)) {
    return importSPKI(trimmed, "Ed25519");
  }
  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf8").trim();
    if (isPemPublicKey(decoded)) {
      return importSPKI(decoded, "Ed25519");
    }
  } catch (error) {
    // fallthrough
  }
  try {
    const parsed = JSON.parse(trimmed);
    return importJWK(parsed, "Ed25519");
  } catch (error) {
    throw new Error(
      fromFile
        ? "JWT_PUBLIC_KEY file must contain a PEM public key or JWK JSON"
        : `Invalid JWT_PUBLIC_KEY format: ${error.message}`
    );
  }
}

function isPemPublicKey(content) {
  return /^-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----$/.test(
    content.trim()
  );
}

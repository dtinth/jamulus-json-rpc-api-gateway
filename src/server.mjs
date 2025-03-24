import { Env } from "@(-.-)/env";
import { randomUUID } from "crypto";
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
  return jamulusClient.request(
    String(request.params["*"]),
    request.body?.params || {}
  );
});

fastify.listen({ port: env.PORT, host: env.LISTEN_HOST });

import Fastify from "fastify";
import net from "net";
import ndjson from "ndjson";
import { randomUUID } from "crypto";
import { Env } from "@(-.-)/env";
import { z } from "zod";

const env = Env(
  z.object({
    PORT: z.coerce.number().default(3434),
    JAMULUS_SECRET: z.string(),
    JAMULUS_HOST: z.string().default("127.0.0.1"),
    JAMULUS_PORT: z.coerce.number().default(22222),
  })
);

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
          secret: env.JAMULUS_SECRET,
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

fastify.get("/whee", async () =>
  jamulusClient.request("jamulusserver/getClients", {})
);

fastify.listen({ port: env.PORT });

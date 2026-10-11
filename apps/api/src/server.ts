import Fastify from "fastify";
import { ZodError } from "zod";
import {
  createAuthenticator,
  AuthenticationError,
  type AuthConfig,
} from "./auth";
import { registerRoutes } from "./projects/routes";
export async function createServer(config: AuthConfig) {
  const authenticate = await createAuthenticator(config);
  const app = Fastify({ logger: false, bodyLimit: 1_048_576 });
  app.addHook("onRequest", async (req, reply) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer "))
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    try {
      req.principal = await authenticate(header.slice(7));
    } catch (error) {
      return error instanceof AuthenticationError
        ? reply.code(401).send({ error: "UNAUTHORIZED" })
        : reply.code(503).send({ error: "UNAVAILABLE" });
    }
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError)
      return reply.code(422).send({ error: "INVALID_INPUT" });
    if (error instanceof Error && error.message === "NOT_FOUND")
      return reply.code(404).send({ error: "NOT_FOUND" });
    return reply.code(500).send({ error: "INTERNAL_ERROR" });
  });
  registerRoutes(app, config.db);
  return app;
}

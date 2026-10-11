import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { z } from "zod";
import {
  commandSchema,
  filterSchema,
} from "../../../../packages/core/src/contracts";
import { getSnapshot, listProjects, readRequest } from "./queries";
import { applyCommand } from "./mutate";
import type { Principal, Command } from "../../../../packages/core/src/model";
declare module "fastify" {
  interface FastifyRequest {
    principal: Principal;
  }
}
export function registerRoutes(app: FastifyInstance, db: Pool) {
  app.get("/session", async (req) => req.principal);
  app.get("/projects", async (req) =>
    listProjects(
      db,
      req.principal,
      filterSchema.parse({
        state: "active",
        query: "",
        sort: "updatedDesc",
        ...(req.query as object),
      }),
    ),
  );
  app.get("/projects/:id", async (req) =>
    getSnapshot(
      db,
      req.principal,
      z.uuid().parse((req.params as { id: string }).id),
    ),
  );
  app.get("/requests/:id", async (req) =>
    readRequest(
      db,
      req.principal,
      z.uuid().parse((req.params as { id: string }).id),
    ),
  );
  app.post("/commands", async (req, reply) => {
    const c = commandSchema.parse(req.body) as Command;
    const result = await applyCommand(db, req.principal, c);
    const status =
      result.kind === "applied"
        ? 200
        : result.kind === "conflict"
          ? 409
          : result.code === "NOT_FOUND"
            ? 404
            : ["INVALID_INPUT", "REQUEST_ID_REUSED"].includes(result.code)
              ? 422
              : 409;
    return reply.code(status).send(result);
  });
}

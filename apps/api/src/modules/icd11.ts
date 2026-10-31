import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, parse } from "../http.js";
import { searchIcd11 } from "../icd11.js";

const querySchema = z.object({
  q: z.string().trim().max(80).optional().transform((value) => value ?? ""),
});

export function registerIcd11(app: FastifyInstance) {
  app.get("/api/icd11", { preHandler: authenticate }, async (request) => {
    const query = parse(querySchema, request.query);
    return { items: searchIcd11(query.q) };
  });
}

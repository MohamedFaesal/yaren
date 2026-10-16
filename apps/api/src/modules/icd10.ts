import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, parse } from "../http.js";
import { searchIcd10 } from "../icd10.js";

const querySchema = z.object({
  q: z.string().trim().max(80).optional().transform((value) => value ?? ""),
});

export function registerIcd10(app: FastifyInstance) {
  app.get("/api/icd10", { preHandler: authenticate }, async (request) => {
    const query = parse(querySchema, request.query);
    return { items: searchIcd10(query.q) };
  });
}

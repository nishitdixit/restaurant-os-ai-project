import type { FastifyError, FastifyInstance } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";
import { CartValidationError, InvalidOrderTransitionError } from "@restaurant-os/domain";
import { isUniqueViolation } from "../db/pool.ts";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const notFound = (what: string, code = "NOT_FOUND") => new ApiError(404, code, `${what} not found.`);

function body(requestId: string, code: string, message: string, details: Record<string, unknown> = {}) {
  return { error: { code, message, details, requestId } };
}

/** Maps every failure to the documented error envelope (docs/API_ERROR_CONVENTIONS.md). */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const requestId = String(request.id);
    if (error instanceof ApiError) {
      if (error.status >= 500) request.log.error({ err: error }, "api error");
      return reply.status(error.status).send(body(requestId, error.code, error.message, error.details));
    }
    if (hasZodFastifySchemaValidationErrors(error)) {
      const fields: Record<string, string> = {};
      for (const issue of error.validation) {
        const zodPath = (issue.params as { issue?: { path?: PropertyKey[] } } | undefined)?.issue?.path;
        const path = (issue.instancePath || "").replace(/^\//, "").replace(/\//g, ".") || (zodPath ? zodPath.map(String).join(".") : "");
        fields[path || "_"] ??= issue.message ?? "Invalid value.";
      }
      return reply.status(400).send(body(requestId, "VALIDATION_FAILED", "Some fields are invalid.", { fields }));
    }
    if (error instanceof CartValidationError) {
      return reply.status(422).send(body(requestId, error.code, error.message, error.details));
    }
    if (error instanceof InvalidOrderTransitionError) {
      return reply.status(409).send(body(requestId, error.code, error.message));
    }
    if (isUniqueViolation(error)) {
      return reply.status(409).send(body(requestId, "CONFLICT", "That value is already in use.", { constraint: (error as { constraint?: string }).constraint }));
    }
    if (error.statusCode === 429) {
      return reply.status(429).send(body(requestId, "RATE_LIMITED", "Too many requests. Please wait a moment and try again."));
    }
    if (error.code === "FST_REQ_FILE_TOO_LARGE") {
      return reply.status(413).send(body(requestId, "FILE_TOO_LARGE", "That file is too large."));
    }
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.status(error.statusCode).send(body(requestId, "BAD_REQUEST", error.message));
    }
    request.log.error({ err: error }, "unhandled error");
    return reply.status(500).send(body(requestId, "INTERNAL_ERROR", "An unexpected error occurred."));
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(body(String(request.id), "ROUTE_NOT_FOUND", `No route for ${request.method} ${request.url.split("?")[0]}.`));
  });
}

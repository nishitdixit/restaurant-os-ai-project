import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { CancelOrderInputSchema, DeliveryUpdateInputSchema, DispatchInputSchema, OrderListQuerySchema, OrderNoteInputSchema, RefundInputSchema, TransitionInputSchema } from "@restaurant-os/types";
import { ApiError } from "../../lib/errors.ts";
import { actorOf, requirePermission, tenantOf } from "../../auth/context.ts";
import { refundOrder } from "../payments/service.ts";
import { addNote, cancelOrder, dispatchOrder, listOrders, orderDetail, transitionOrder, updateDelivery } from "./admin.ts";

const Id = z.object({ id: z.uuid() });
const tags = ["orders"];

export async function orderRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get("/v1/admin/orders", { preValidation: requirePermission("order.read"), schema: { tags, querystring: OrderListQuerySchema } }, async (req) => listOrders(tenantOf(req).tenantId, req.query));
  r.get("/v1/admin/orders/:id", { preValidation: requirePermission("order.read"), schema: { tags, params: Id } }, async (req) => orderDetail(tenantOf(req).tenantId, req.params.id, tenantOf(req).role));
  r.post("/v1/admin/orders/:id/transition", { preValidation: requirePermission("order.manage"), schema: { tags, params: Id, body: TransitionInputSchema } }, async (req) => transitionOrder(actorOf(req), tenantOf(req).role, req.params.id, req.body.to));
  r.post("/v1/admin/orders/:id/cancel", { preValidation: requirePermission("order.manage"), schema: { tags, params: Id, body: CancelOrderInputSchema } }, async (req) => cancelOrder(actorOf(req), tenantOf(req).role, req.params.id, req.body));
  r.post("/v1/admin/orders/:id/dispatch", { preValidation: requirePermission("delivery.manage"), schema: { tags, params: Id, body: DispatchInputSchema } }, async (req) => dispatchOrder(actorOf(req), tenantOf(req).role, req.params.id, req.body));
  r.post("/v1/admin/orders/:id/delivery", { preValidation: requirePermission("order.manage"), schema: { tags, params: Id, body: DeliveryUpdateInputSchema } }, async (req) => updateDelivery(actorOf(req), tenantOf(req).role, req.params.id, req.body));
  r.post("/v1/admin/orders/:id/notes", { preValidation: requirePermission("order.read"), schema: { tags, params: Id, body: OrderNoteInputSchema } }, async (req, reply) => {
    await addNote(actorOf(req), req.params.id, req.body.body);
    return reply.status(201).send(await orderDetail(tenantOf(req).tenantId, req.params.id, tenantOf(req).role));
  });
  r.post("/v1/admin/orders/:id/refunds", {
    preValidation: requirePermission("order.manage"),
    schema: { tags, params: Id, body: RefundInputSchema, headers: z.object({ "idempotency-key": z.string().min(8).max(120) }).loose() },
  }, async (req, reply) => {
    const t = tenantOf(req);
    if (!["OWNER", "MANAGER", "PLATFORM_ADMIN"].includes(t.role)) throw new ApiError(403, "FORBIDDEN", "Only an owner or manager can issue refunds.");
    const result = await refundOrder(actorOf(req), req.params.id, { amountMinor: req.body.amountMinor, reason: req.body.reason, idempotencyKey: req.headers["idempotency-key"] });
    return reply.status(result.duplicate ? 200 : 201).send({ ...result, order: await orderDetail(t.tenantId, req.params.id, t.role) });
  });
}

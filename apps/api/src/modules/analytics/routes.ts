// Owner analytics (PRD 5.11, specs/analytics, docs/ANALYTICS.md). Financial figures come from order
// and payment records, never from behavioural events, so every number reconciles to orders.
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { AnalyticsQuerySchema, type AnalyticsDashboard } from "@restaurant-os/types";
import { pool } from "../../db/pool.ts";
import { requirePermission, tenantOf } from "../../auth/context.ts";

export const METRIC_DEFINITIONS: Record<string, string> = {
  paidOrders: "Orders whose payment was captured in the period, excluding orders cancelled afterwards. Orders are dated by when they were placed.",
  grossSalesMinor: "Sum of order totals (items − discounts + delivery fees) for paid orders.",
  discountsMinor: "Coupon discounts given on paid orders.",
  feesMinor: "Delivery fees charged on paid orders.",
  refundsMinor: "Refunds issued in the period on any order (partial and full).",
  netSalesMinor: "Gross sales minus refunds.",
  averageOrderValueMinor: "Gross sales ÷ paid orders.",
  completedOrders: "Paid orders marked delivered/collected.",
  cancelledOrders: "Orders cancelled in the period, including unpaid orders that expired.",
  refundedOrders: "Orders with at least one refund issued in the period.",
  newCustomers: "Customers whose first paid order was in the period.",
  repeatCustomers: "Customers with a paid order in the period who had also ordered before it.",
};

const RANGE_DAYS: Record<string, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };

export async function analyticsRoutes(app: FastifyInstance) {
  app.withTypeProvider<ZodTypeProvider>().get("/v1/admin/analytics", {
    preValidation: requirePermission("analytics.read"),
    schema: { tags: ["analytics"], querystring: AnalyticsQuerySchema },
  }, async (req): Promise<AnalyticsDashboard> => {
    const { tenantId } = tenantOf(req);
    const db = pool();
    const meta = await db.query<{ tz: string; currency: string }>(
      `SELECT coalesce((SELECT timezone FROM outlets WHERE tenant_id = $1 ORDER BY created_at LIMIT 1), 'Asia/Kolkata') AS tz, trim(default_currency) AS currency FROM tenants WHERE id = $1`, [tenantId]);
    const { tz, currency } = meta.rows[0]!;
    const days = RANGE_DAYS[req.query.range] ?? 30;
    // Period boundaries are whole local days in the outlet timezone.
    const bounds = await db.query<{ from: Date; to: Date; prev_from: Date }>(
      `SELECT (date_trunc('day', now() AT TIME ZONE $1) - make_interval(days => $2 - 1)) AT TIME ZONE $1 AS from,
              now() AS to,
              (date_trunc('day', now() AT TIME ZONE $1) - make_interval(days => 2 * $2 - 1)) AT TIME ZONE $1 AS prev_from`, [tz, days]);
    const { from, to, prev_from: prevFrom } = bounds.rows[0]!;
    const P = [tenantId, from, to];
    const PAID = `o.tenant_id = $1 AND o.created_at >= $2 AND o.created_at < $3 AND o.payment_status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED') AND o.status <> 'CANCELLED'`;

    const [summary, previous, refunds, cancelled, awaiting, customers, daily, statuses, channels, fulfilment, top] = await Promise.all([
      db.query<{ orders: number; gross: number; discounts: number; fees: number; completed: number }>(
        `SELECT count(*) AS orders, coalesce(sum(o.total_minor), 0) AS gross, coalesce(sum(o.discount_minor), 0) AS discounts, coalesce(sum(o.fee_minor), 0) AS fees,
                count(*) FILTER (WHERE o.status = 'DELIVERED') AS completed FROM orders o WHERE ${PAID}`, P),
      db.query<{ orders: number; gross: number }>(
        `SELECT count(*) AS orders, coalesce(sum(o.total_minor), 0) AS gross FROM orders o
         WHERE o.tenant_id = $1 AND o.created_at >= $2 AND o.created_at < $3 AND o.payment_status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED') AND o.status <> 'CANCELLED'`, [tenantId, prevFrom, from]),
      db.query<{ total: number; orders: number }>(
        `SELECT coalesce(sum(r.amount_minor), 0) AS total, count(DISTINCT p.order_id) AS orders FROM payment_refunds r JOIN payments p ON p.id = r.payment_id
         WHERE r.tenant_id = $1 AND r.created_at >= $2 AND r.created_at < $3`, P),
      db.query<{ n: number }>(`SELECT count(*) AS n FROM orders o WHERE o.tenant_id = $1 AND o.status = 'CANCELLED' AND coalesce(o.cancelled_at, o.updated_at) >= $2 AND coalesce(o.cancelled_at, o.updated_at) < $3`, P),
      db.query<{ n: number }>(`SELECT count(*) AS n FROM orders o WHERE o.tenant_id = $1 AND o.status = 'NEW' AND o.payment_status NOT IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED')`, [tenantId]),
      db.query<{ new_customers: number; repeat_customers: number }>(
        `WITH period AS (SELECT DISTINCT o.customer_id FROM orders o WHERE ${PAID} AND o.customer_id IS NOT NULL),
              earlier AS (SELECT DISTINCT o.customer_id FROM orders o WHERE o.tenant_id = $1 AND o.created_at < $2 AND o.payment_status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED') AND o.status <> 'CANCELLED')
         SELECT count(*) FILTER (WHERE e.customer_id IS NULL) AS new_customers, count(*) FILTER (WHERE e.customer_id IS NOT NULL) AS repeat_customers
         FROM period p LEFT JOIN earlier e ON e.customer_id = p.customer_id`, P),
      db.query<{ date: string; gross: number; orders: number }>(
        `WITH days AS (SELECT generate_series(date_trunc('day', $2::timestamptz AT TIME ZONE $4), date_trunc('day', $3::timestamptz AT TIME ZONE $4), interval '1 day')::date AS d)
         SELECT to_char(days.d, 'YYYY-MM-DD') AS date, coalesce(sum(o.total_minor), 0) AS gross, count(o.id) AS orders
         FROM days LEFT JOIN orders o ON (o.created_at AT TIME ZONE $4)::date = days.d AND ${PAID}
         GROUP BY days.d ORDER BY days.d`, [...P, tz]),
      db.query<{ status: AnalyticsDashboard["statusBreakdown"][number]["status"]; count: number }>(
        `SELECT o.status, count(*) AS count FROM orders o WHERE o.tenant_id = $1 AND o.created_at >= $2 AND o.created_at < $3
           AND (o.payment_status IN ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED') OR o.status = 'CANCELLED') GROUP BY o.status ORDER BY o.status`, P),
      db.query<{ channel: string; orders: number; gross: number }>(`SELECT o.channel, count(*) AS orders, coalesce(sum(o.total_minor), 0) AS gross FROM orders o WHERE ${PAID} GROUP BY o.channel ORDER BY orders DESC`, P),
      db.query<{ fulfillment_type: "DELIVERY" | "PICKUP"; orders: number }>(`SELECT o.fulfillment_type, count(*) AS orders FROM orders o WHERE ${PAID} GROUP BY 1 ORDER BY 2 DESC`, P),
      db.query<{ name: string; quantity: number; revenue: number }>(
        `SELECT i.product_name_snapshot AS name, sum(i.quantity)::int AS quantity, sum(i.line_total_minor) AS revenue FROM order_items i JOIN orders o ON o.id = i.order_id
         WHERE ${PAID} GROUP BY 1 ORDER BY 2 DESC, 3 DESC LIMIT 10`, P),
    ]);

    const s = summary.rows[0]!;
    const prev = previous.rows[0]!;
    const refund = refunds.rows[0]!;
    return {
      range: { from: from.toISOString(), to: to.toISOString(), timezone: tz },
      currency,
      summary: {
        grossSalesMinor: s.gross, discountsMinor: s.discounts, feesMinor: s.fees, refundsMinor: refund.total, netSalesMinor: s.gross - refund.total,
        paidOrders: s.orders, averageOrderValueMinor: s.orders ? Math.round(s.gross / s.orders) : 0, completedOrders: s.completed,
        cancelledOrders: cancelled.rows[0]!.n, refundedOrders: refund.orders, awaitingPaymentOrders: awaiting.rows[0]!.n,
        newCustomers: customers.rows[0]!.new_customers, repeatCustomers: customers.rows[0]!.repeat_customers,
      },
      previous: { grossSalesMinor: prev.gross, paidOrders: prev.orders, averageOrderValueMinor: prev.orders ? Math.round(prev.gross / prev.orders) : 0 },
      daily: daily.rows.map((d) => ({ date: d.date, grossSalesMinor: d.gross, orders: d.orders })),
      statusBreakdown: statuses.rows,
      channelMix: channels.rows.map((c) => ({ channel: c.channel, orders: c.orders, grossSalesMinor: c.gross })),
      fulfillmentMix: fulfilment.rows.map((f) => ({ fulfillmentType: f.fulfillment_type, orders: f.orders })),
      topProducts: top.rows.map((t) => ({ name: t.name, quantity: t.quantity, revenueMinor: t.revenue })),
      definitions: METRIC_DEFINITIONS,
    };
  });
}

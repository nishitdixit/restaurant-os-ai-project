export type Role = "OWNER" | "MANAGER" | "KITCHEN" | "STAFF" | "PLATFORM_ADMIN";

export type Permission =
  | "tenant.read"
  | "tenant.manage"
  | "catalog.read"
  | "catalog.manage"
  | "availability.manage"
  | "order.read"
  | "order.manage"
  | "customer.read"
  | "customer.manage"
  | "promotion.manage"
  | "delivery.manage"
  | "analytics.read"
  | "integration.manage"
  | "billing.manage"
  | "audit.read";

export interface TenantContext {
  readonly userId: string;
  readonly tenantId: string;
  readonly membershipId: string;
  readonly role: Role;
  readonly permissions: ReadonlySet<Permission>;
}

export interface AuthenticatedIdentity {
  readonly userId: string;
}

export interface MembershipResolver {
  resolve(userId: string, tenantId: string): Promise<TenantContext | null>;
}

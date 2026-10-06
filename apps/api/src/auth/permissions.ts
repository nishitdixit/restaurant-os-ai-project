import type { Permission, Role, TenantContext } from "./types";

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: [
    "tenant.read", "tenant.manage", "catalog.read", "catalog.manage", "availability.manage",
    "order.read", "order.manage", "customer.read", "customer.manage", "promotion.manage",
    "delivery.manage", "analytics.read", "integration.manage", "billing.manage", "audit.read",
  ],
  MANAGER: [
    "tenant.read", "catalog.read", "catalog.manage", "availability.manage", "order.read", "order.manage",
    "customer.read", "customer.manage", "promotion.manage", "delivery.manage", "analytics.read",
  ],
  KITCHEN: ["catalog.read", "availability.manage", "order.read", "order.manage"],
  STAFF: ["catalog.read", "order.read", "order.manage"],
  PLATFORM_ADMIN: [
    "tenant.read", "tenant.manage", "catalog.read", "catalog.manage", "availability.manage", "order.read",
    "order.manage", "customer.read", "customer.manage", "promotion.manage", "delivery.manage",
    "analytics.read", "integration.manage", "billing.manage", "audit.read",
  ],
};

export function permissionsForRole(role: Role): ReadonlySet<Permission> {
  return new Set(ROLE_PERMISSIONS[role]);
}

export function hasPermission(context: TenantContext, permission: Permission): boolean {
  return context.permissions.has(permission);
}

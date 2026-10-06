// Response shapes returned by the API. Money: integer minor units + currency code.

export type OrderStatus = "NEW" | "ACCEPTED" | "PREPARING" | "READY" | "PACKED" | "DISPATCHED" | "DELIVERED" | "CANCELLED";
export type PaymentStatus = "INITIATED" | "CREATED" | "PENDING" | "REQUIRES_ACTION" | "AUTHORIZED" | "CAPTURED" | "FAILED" | "EXPIRED" | "CANCELLED" | "REFUNDED" | "PARTIALLY_REFUNDED";
export type FulfillmentType = "DELIVERY" | "PICKUP";
export type Dietary = "VEG" | "NON_VEG" | "EGG" | "VEGAN";
export type Role = "OWNER" | "MANAGER" | "KITCHEN" | "STAFF" | "PLATFORM_ADMIN";
export type DeliveryStatus = "PENDING" | "ASSIGNED" | "PICKED_UP" | "DELIVERED" | "FAILED" | "CANCELLED";

export interface ApiErrorBody {
  error: { code: string; message: string; details: Record<string, unknown>; requestId: string };
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

// Storefront ---------------------------------------------------------------------------------

export interface BrandLinks { whatsapp: string; swiggy: string; zomato: string; instagram: string; website: string }

export interface StoreConfig {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  cuisines: string[];
  logoUrl: string | null;
  primaryColor: string;
  links: BrandLinks;
  currency: string;
  locale: string;
  outlet: {
    name: string;
    phone: string | null;
    address: { line1: string; line2: string; city: string; region: string; postalCode: string };
    location: { latitude: number; longitude: number } | null;
    hours: Record<string, [string, string][]>;
    timezone: string;
    openNow: boolean;
    nextOpening: string | null;
    acceptingOrders: boolean;
    deliveryEnabled: boolean;
    pickupEnabled: boolean;
    prepMinutes: number;
  } | null;
  deliveryAreas: { name: string; postalCodes: string[]; radiusKm: number | null; feeMinor: number; minimumOrderMinor: number; etaMin: number; etaMax: number }[];
  updatedAt: string;
  published: boolean;
}

export interface MenuModifierGroup {
  id: string;
  name: string;
  description: string;
  minSelections: number;
  maxSelections: number;
  modifiers: { id: string; name: string; priceDeltaMinor: number; available: boolean }[];
}

export interface MenuProduct {
  id: string;
  slug: string;
  name: string;
  description: string;
  longDescription: string;
  priceMinor: number;
  currency: string;
  imageUrl: string | null;
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  dietary: Dietary | null;
  spiceLevel: number | null;
  allergens: string[];
  tags: string[];
  available: boolean;
  unavailableReason: string | null;
  modifierGroups: MenuModifierGroup[];
  updatedAt: string;
}

export interface MenuCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  products: MenuProduct[];
}

export interface Menu {
  categories: MenuCategory[];
}

export interface PublicOffer {
  code: string;
  title: string;
  description: string;
  summary: string;
  endsAt: string;
  newCustomerOnly: boolean;
}

export interface QuoteLine {
  productId: string;
  name: string;
  quantity: number;
  modifiers: { modifierId: string; groupName: string; name: string; priceDeltaMinor: number }[];
  unitPriceMinor: number;
  lineTotalMinor: number;
  available: boolean;
  problem: string | null;
}

export interface QuoteIssue {
  code: string;
  message: string;
  field?: string;
}

export interface Quote {
  currency: string;
  lines: QuoteLine[];
  subtotalMinor: number;
  discountMinor: number;
  feeMinor: number;
  taxMinor: number;
  totalMinor: number;
  promotion: { code: string; title: string; discountMinor: number } | null;
  promotionError: string | null;
  delivery: { zoneName: string; feeMinor: number; minimumOrderMinor: number; etaMin: number; etaMax: number } | null;
  /** Blocking problems; the order cannot be placed while any exist. */
  issues: QuoteIssue[];
  canPlaceOrder: boolean;
}

export interface PaymentAction {
  type: "MOCK_CHECKOUT" | "REDIRECT" | "NONE";
  url: string | null;
}

export interface PublicOrderItem {
  productId: string | null;
  modifierIds: string[];
  name: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  modifiers: { groupName: string; name: string; priceDeltaMinor: number }[];
}

export interface PublicOrder {
  token: string;
  number: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentType: FulfillmentType;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  feeMinor: number;
  taxMinor: number;
  totalMinor: number;
  promotionCode: string | null;
  items: PublicOrderItem[];
  customerName: string;
  address: { line1: string; line2: string; landmark: string; city: string; postalCode: string } | null;
  customerNote: string | null;
  etaMin: number | null;
  etaMax: number | null;
  createdAt: string;
  paidAt: string | null;
  timeline: { status: OrderStatus; at: string }[];
  delivery: { status: DeliveryStatus; riderName: string | null; riderPhone: string | null; trackingReference: string | null } | null;
  cancelReason: string | null;
  refundedMinor: number;
  canRetryPayment: boolean;
  paymentExpiresAt: string | null;
  store: { name: string; phone: string | null; whatsapp: string };
}

export interface PlaceOrderResult {
  order: PublicOrder;
  payment: { status: PaymentStatus; action: PaymentAction };
  duplicate: boolean;
}

// Admin --------------------------------------------------------------------------------------

export interface SessionMembership {
  tenantId: string;
  tenantName: string;
  role: Role;
  permissions: string[];
  brandSlug: string | null;
}

export interface Session {
  user: { id: string; email: string | null } | null;
  memberships: SessionMembership[];
  selfSignupEnabled: boolean;
}

export interface ChecklistStep {
  key: "business" | "brand" | "outlet" | "hours" | "delivery" | "catalog" | "publish";
  label: string;
  complete: boolean;
  blocker: string | null;
  href: string;
}

export interface SetupStatus {
  steps: ChecklistStep[];
  progress: number;
  published: boolean;
  storefrontUrl: string | null;
}

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: "ACTIVE" | "INACTIVE" | "DRAFT" | "ARCHIVED";
  sortOrder: number;
  productCount: number;
}

export interface AdminProduct {
  id: string;
  categoryId: string;
  categoryName: string;
  name: string;
  slug: string;
  description: string;
  longDescription: string;
  basePriceMinor: number;
  currency: string;
  imageAssetId: string | null;
  imageUrl: string | null;
  dietary: Dietary | null;
  spiceLevel: number | null;
  allergens: string[];
  tags: string[];
  status: "DRAFT" | "ACTIVE" | "ARCHIVED" | "INACTIVE";
  sortOrder: number;
  available: boolean;
  unavailableReason: string | null;
  unavailableUntil: string | null;
  modifierGroupIds: string[];
  updatedAt: string;
}

export interface AdminModifierGroup {
  id: string;
  name: string;
  description: string;
  minSelections: number;
  maxSelections: number;
  modifiers: { id: string; name: string; priceDeltaMinor: number; active: boolean }[];
  productCount: number;
}

export interface AdminDeliveryZone {
  id: string;
  name: string;
  ruleType: "POSTAL_CODE" | "RADIUS";
  postalCodes: string[];
  radiusKm: number | null;
  feeMinor: number;
  minimumOrderMinor: number;
  etaMin: number;
  etaMax: number;
  active: boolean;
}

export interface AdminPromotion {
  id: string;
  code: string;
  title: string;
  description: string;
  type: "FIXED" | "PERCENTAGE";
  value: number;
  minimumOrderMinor: number;
  maxDiscountMinor: number | null;
  startsAt: string;
  endsAt: string;
  usageCap: number | null;
  usageCount: number;
  newCustomerOnly: boolean;
  oncePerCustomer: boolean;
  isPublic: boolean;
  active: boolean;
  state: "ACTIVE" | "PAUSED" | "SCHEDULED" | "EXPIRED" | "EXHAUSTED";
  discountGivenMinor: number;
}

export interface AdminOrderSummary {
  id: string;
  number: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentType: FulfillmentType;
  channel: string;
  customerName: string;
  customerPhone: string | null;
  totalMinor: number;
  currency: string;
  itemCount: number;
  itemsPreview: string;
  createdAt: string;
  paidAt: string | null;
  acceptedAt: string | null;
  etaMax: number | null;
  postalCode: string | null;
  deliveryStatus: DeliveryStatus | null;
}

export interface AdminOrderDetail extends AdminOrderSummary {
  token: string;
  subtotalMinor: number;
  discountMinor: number;
  feeMinor: number;
  taxMinor: number;
  promotionCode: string | null;
  customerId: string | null;
  customerEmail: string | null;
  customerNote: string | null;
  address: { line1: string; line2: string; landmark: string; city: string; postalCode: string } | null;
  items: PublicOrderItem[];
  payments: { id: string; provider: string; providerPaymentId: string | null; status: PaymentStatus; amountMinor: number; createdAt: string; capturedAt: string | null }[];
  refunds: { id: string; amountMinor: number; status: string; reason: string | null; createdAt: string }[];
  refundableMinor: number;
  delivery: { id: string; status: DeliveryStatus; provider: string; riderName: string | null; riderPhone: string | null; trackingReference: string | null; notes: string | null; assignedAt: string | null; pickedUpAt: string | null; deliveredAt: string | null; failureReason: string | null } | null;
  timeline: { kind: "status" | "delivery" | "note" | "payment" | "audit"; label: string; detail: string | null; actor: string | null; at: string }[];
  notes: { id: string; body: string; author: string | null; createdAt: string }[];
  allowedTransitions: OrderStatus[];
  cancelReasonCode: string | null;
  cancelNote: string | null;
}

export interface AdminCustomerSummary {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  orderCount: number;
  totalSpentMinor: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  marketingConsent: boolean;
}

export interface AdminCustomerDetail extends AdminCustomerSummary {
  createdAt: string;
  notes: string;
  addresses: { id: string; line1: string; line2: string | null; city: string; postalCode: string; lastUsedAt: string }[];
  orders: AdminOrderSummary[];
  favouriteProducts: { name: string; quantity: number }[];
  couponsUsed: { code: string; discountMinor: number; at: string }[];
}

export interface AnalyticsDashboard {
  range: { from: string; to: string; timezone: string };
  currency: string;
  summary: {
    grossSalesMinor: number;
    discountsMinor: number;
    feesMinor: number;
    refundsMinor: number;
    netSalesMinor: number;
    paidOrders: number;
    averageOrderValueMinor: number;
    completedOrders: number;
    cancelledOrders: number;
    refundedOrders: number;
    awaitingPaymentOrders: number;
    newCustomers: number;
    repeatCustomers: number;
  };
  previous: { grossSalesMinor: number; paidOrders: number; averageOrderValueMinor: number };
  daily: { date: string; grossSalesMinor: number; orders: number }[];
  statusBreakdown: { status: OrderStatus; count: number }[];
  channelMix: { channel: string; orders: number; grossSalesMinor: number }[];
  fulfillmentMix: { fulfillmentType: FulfillmentType; orders: number }[];
  topProducts: { name: string; quantity: number; revenueMinor: number }[];
  definitions: Record<string, string>;
}

export interface TeamMember {
  membershipId: string;
  userId: string;
  email: string | null;
  role: Role;
  status: "ACTIVE" | "DEACTIVATED";
  invited: boolean;
  isYou: boolean;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  eventName: string;
  entityType: string | null;
  entityId: string | null;
  actor: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface NotificationEntry {
  id: string;
  audience: "CUSTOMER" | "MERCHANT";
  channel: string;
  template: string;
  recipient: string;
  subject: string | null;
  body: string | null;
  status: "PENDING" | "SENT" | "FAILED" | "CANCELLED";
  attemptCount: number;
  lastError: string | null;
  orderId: string | null;
  orderNumber: number | null;
  createdAt: string;
  sentAt: string | null;
}

export interface MediaAsset {
  id: string;
  url: string;
  contentType: string;
  byteSize: number;
}

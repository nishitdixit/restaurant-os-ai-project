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

import type { DisplayBadge, ExperienceCheck, LocalizedText, ProductBadge, StoreExperience, StoreTheme, ThemeCheck } from "@restaurant-os/domain";
export type { DisplayBadge, ExperienceCheck, ExperienceIssue, LocalizedText, ProductBadge, Section, SectionType, StoreExperience, StoreTheme, ThemeCheck, ThemeIssue } from "@restaurant-os/domain";

/** A media asset as referenced by storefront content: URL plus alt text. */
export interface MediaRef {
  url: string;
  alt: string;
}

export type PolicyKey = "refund" | "terms" | "privacy" | "delivery";

// Storefront ---------------------------------------------------------------------------------

export interface BrandLinks { whatsapp: string; swiggy: string; zomato: string; instagram: string; website: string }

export interface StoreConfig {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  cuisines: string[];
  logoUrl: string | null;
  /** The theme's brand colour (kept for share images and the browser theme colour). */
  primaryColor: string;
  /** Published theme, or the saved draft when requested by a merchant preview. Always normalised. */
  theme: StoreTheme;
  /** Published experience (homepage composition, menu and site settings), or the saved draft in a merchant preview. */
  experience: StoreExperience;
  /** Every image the experience uses, by media id. */
  media: Record<string, MediaRef>;
  /** Real figures for highlights; null when there isn't enough data to show honestly. */
  stats: { paidOrders: number | null };
  credentials: { legalName: string; fssai: string; gstin: string };
  /** Policy pages the restaurant has written. */
  policies: { key: PolicyKey; title: string }[];
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
  deliveryAreas: { name: string; postalCodes: string[]; radiusKm: number | null; feeMinor: number; minimumOrderMinor: number; freeDeliveryMinimumMinor: number | null; etaMin: number; etaMax: number }[];
  updatedAt: string;
  published: boolean;
  /** True when this response was rendered for a verified merchant preview. */
  preview: boolean;
}

export interface PolicyPage {
  key: PolicyKey;
  title: string;
  body: LocalizedText;
  updatedAt: string | null;
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
  /** Hindi name/description ("" when not translated). */
  nameHi: string;
  descriptionHi: string;
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
  /** Bestseller (computed from paid orders) first, then the merchant's badges. */
  badges: DisplayBadge[];
  bestseller: boolean;
  /** Extra photos after the main one. */
  gallery: MediaRef[];
  updatedAt: string;
}

export interface MenuCategory {
  id: string;
  slug: string;
  name: string;
  nameHi: string;
  description: string;
  descriptionHi: string;
  imageUrl: string | null;
  products: MenuProduct[];
}

export interface Menu {
  categories: MenuCategory[];
  /** Dish ids ranked by real sales (empty until enough paid orders exist). */
  bestsellerIds: string[];
}

export interface PublicOffer {
  code: string;
  title: string;
  description: string;
  summary: string;
  endsAt: string;
  newCustomerOnly: boolean;
  minimumOrderMinor: number;
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
  delivery: { zoneName: string; feeMinor: number; minimumOrderMinor: number; freeDeliveryMinimumMinor: number | null; etaMin: number; etaMax: number } | null;
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
  nameHi: string;
  descriptionHi: string;
  imageAssetId: string | null;
  imageUrl: string | null;
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
  nameHi: string;
  descriptionHi: string;
  badges: ProductBadge[];
  /** Extra photos after the main one, in order. */
  gallery: { id: string; url: string; alt: string }[];
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
  freeDeliveryMinimumMinor: number | null;
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
  /** Who can use it (ADR-014). */
  audience: PromotionAudience;
  active: boolean;
  state: "ACTIVE" | "PAUSED" | "SCHEDULED" | "EXPIRED" | "EXHAUSTED";
  discountGivenMinor: number;
  /** Times used on website orders vs orders staff entered (current uses, cancelled orders excluded). */
  usageBySource: { website: number; staff: number };
  /** Staff members who applied it, most uses first. */
  appliedBy: { staff: string; uses: number }[];
}

export type PromotionAudience = "PUBLIC" | "CODE_ONLY" | "STAFF_ONLY";
export type StaffOrderChannel = "WHATSAPP" | "PHONE" | "WALK_IN" | "OTHER";
export type StaffPaymentMethod = "CASH" | "UPI" | "CARD" | "PAY_LATER";

/** An offer staff can apply on the new-order screen. */
export interface StaffOrderOffer {
  id: string;
  code: string;
  title: string;
  /** "20% off, up to ₹100 · on orders above ₹300" */
  summary: string;
  audience: PromotionAudience;
}

/** What the new-order screen knows about a phone number (exact match only). */
export interface StaffCustomerLookup {
  found: boolean;
  name: string;
  email: string;
  orderCount: number;
  addresses: { line1: string; line2: string; landmark: string; city: string; postalCode: string }[];
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
  /** Staff member (email) who entered the order; null = placed by the customer on the website. */
  createdBy: string | null;
  /** How a staff-entered order is paid; null = online at website checkout. */
  paymentMethod: StaffPaymentMethod | null;
  /** A staff-entered "pay later" order whose money hasn't been collected yet. */
  paymentDue: boolean;
}

export interface AdminOrderDetail extends AdminOrderSummary {
  token: string;
  subtotalMinor: number;
  discountMinor: number;
  feeMinor: number;
  taxMinor: number;
  promotionCode: string | null;
  /** The applied offer is staff-only, and who applied it (null = the customer at checkout). */
  promotionStaffOnly: boolean;
  promotionAppliedBy: string | null;
  notifyCustomer: boolean;
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
  /** Offers used on paid orders, split by website vs staff-entered orders. */
  offers: { code: string; staffOnly: boolean; uses: number; websiteUses: number; staffUses: number; discountMinor: number; salesMinor: number }[];
  /** Staff-entered "pay later" orders not yet collected (current, not limited to the range). */
  paymentDue: { orders: number; amountMinor: number };
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

export type MediaKind = "general" | "logo" | "hero" | "product" | "category" | "gallery" | "story" | "banner";

export interface MediaAsset {
  id: string;
  url: string;
  contentType: string;
  byteSize: number;
  altText: string;
  kind: MediaKind;
  createdAt: string;
  /** Where it is used ("Hero banner", "Dish: Paneer tikka", …); empty = safe to delete. */
  usedIn: string[];
}

// Appearance (storefront theme editor) ---------------------------------------------------------------------
export interface ThemeVersionSummary {
  id: string;
  presetId: string | null;
  publishedAt: string;
  publishedBy: string | null;
}

export interface AppearanceState {
  /** Live theme. */
  published: StoreTheme;
  /** Unpublished theme edits; null when there are none. */
  draft: StoreTheme | null;
  draftUpdatedAt: string | null;
  publishedAt: string | null;
  /** Readability check of the theme being edited (draft, else live). */
  check: ThemeCheck;
  /** Homepage composition, content and site/menu settings; published together with the theme (ADR-013). */
  experience: {
    published: StoreExperience;
    draft: StoreExperience | null;
    /** Check of the experience being edited (draft, else live). */
    check: ExperienceCheck;
  };
  /** Images referenced by the live or draft experience, by media id. */
  media: Record<string, MediaRef>;
  versions: ThemeVersionSummary[];
}

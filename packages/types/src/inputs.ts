// Request contracts shared by the API (validation + OpenAPI) and the web apps (form validation).
// Money is integer minor units (paise for INR) as JSON numbers.
import { z } from "zod";
import { BADGE_KINDS, BADGE_TONES, MAX_BADGES, PILL_RADIUS, RADIUS_MAX, THEME_COLOR_KEYS, THEME_FONT_IDS, THEME_OPTIONS, THEME_VERSION } from "@restaurant-os/domain";

const id = z.uuid();
const money = z.number().int().min(0).max(100_000_000);
const slug = z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens.");
const shortText = (max = 120) => z.string().trim().min(1, "Required.").max(max);
const optionalText = (max = 500) => z.string().trim().max(max).optional().default("");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM.");
const phone = z.string().trim().min(8, "Enter a valid phone number.").max(20);
const url = z.union([z.url().max(500), z.literal("")]).optional().default("");

export const WeekdaySchema = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
export const OpeningHoursSchema = z.partialRecord(WeekdaySchema, z.array(z.tuple([time, time])).max(4));

export const GeoPointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const AddressInputSchema = z.object({
  line1: shortText(200),
  line2: optionalText(200),
  landmark: optionalText(120),
  city: shortText(80),
  region: optionalText(80),
  postalCode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit pincode."),
  location: GeoPointSchema.nullable().optional(),
});
export type AddressInput = z.infer<typeof AddressInputSchema>;

// Storefront ---------------------------------------------------------------------------------

export const CartLineInputSchema = z.object({
  productId: id,
  quantity: z.number().int().min(1).max(50),
  modifierIds: z.array(id).max(30).default([]),
});
export type CartLineInput = z.infer<typeof CartLineInputSchema>;

export const FulfillmentTypeSchema = z.enum(["DELIVERY", "PICKUP"]);

export const QuoteInputSchema = z.object({
  lines: z.array(CartLineInputSchema).min(1, "Your cart is empty.").max(50),
  fulfillmentType: FulfillmentTypeSchema,
  address: AddressInputSchema.nullable().optional(),
  promotionCode: z.string().trim().max(40).optional().default(""),
  customerPhone: z.string().trim().max(20).optional().default(""),
});
export type QuoteInput = z.infer<typeof QuoteInputSchema>;

export const CustomerContactSchema = z.object({
  name: shortText(80),
  phone,
  email: z.union([z.email().max(200), z.literal("")]).optional().default(""),
  marketingConsent: z.boolean().default(false),
});

export const PlaceOrderInputSchema = QuoteInputSchema.extend({
  customer: CustomerContactSchema,
  customerNote: optionalText(500),
  paymentMethod: z.enum(["ONLINE"]).default("ONLINE"),
  /** Total the customer saw; a different server total returns PRICE_CHANGED instead of charging silently. */
  expectedTotalMinor: money,
});
export type PlaceOrderInput = z.infer<typeof PlaceOrderInputSchema>;

export const MockPaymentCompleteSchema = z.object({ outcome: z.enum(["success", "failed", "cancelled"]) });

// Admin: settings ---------------------------------------------------------------------------

export const CreateRestaurantSchema = z.object({
  businessName: shortText(120),
  brandName: shortText(80),
  brandSlug: slug,
  phone,
  city: shortText(80),
});
export type CreateRestaurantInput = z.infer<typeof CreateRestaurantSchema>;

export const BusinessSettingsSchema = z.object({
  businessName: shortText(120),
  legalName: optionalText(200),
  gstin: z.union([z.string().trim().regex(/^[0-9A-Z]{15}$/, "GSTIN has 15 characters."), z.literal("")]).optional().default(""),
  contactName: optionalText(80),
  contactPhone: z.string().trim().max(20).optional().default(""),
  contactEmail: z.union([z.email(), z.literal("")]).optional().default(""),
  currency: z.enum(["INR"]).default("INR"),
  locale: z.enum(["en-IN"]).default("en-IN"),
  /** FSSAI licence/registration number (14 digits), shown in the storefront footer. */
  fssai: z.union([z.string().trim().regex(/^[0-9]{14}$/, "FSSAI numbers have 14 digits."), z.literal("")]).optional().default(""),
});

export const BrandSettingsSchema = z.object({
  name: shortText(80),
  slug,
  tagline: optionalText(140),
  description: optionalText(1000),
  cuisines: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  logoAssetId: id.nullable().optional(),
  /** Deprecated: colours now live in the storefront theme (Appearance). Kept optional for older clients. */
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #b42318.").optional(),
  links: z.object({
    whatsapp: z.string().trim().max(20).optional().default(""),
    swiggy: url,
    zomato: url,
    instagram: url,
    website: url,
  }).default({ whatsapp: "", swiggy: "", zomato: "", instagram: "", website: "" }),
});
export type BrandSettingsInput = z.infer<typeof BrandSettingsSchema>;

export const OutletSettingsSchema = z.object({
  name: shortText(120),
  phone,
  address: z.object({
    line1: shortText(200),
    line2: optionalText(200),
    city: shortText(80),
    region: optionalText(80),
    postalCode: z.string().trim().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit pincode."),
  }),
  location: GeoPointSchema.nullable().optional(),
  hours: OpeningHoursSchema,
  acceptingOrders: z.boolean(),
  deliveryEnabled: z.boolean(),
  pickupEnabled: z.boolean(),
  defaultPrepMinutes: z.number().int().min(0).max(240),
});
export type OutletSettingsInput = z.infer<typeof OutletSettingsSchema>;

// Admin: catalog ----------------------------------------------------------------------------

export const CatalogStatusSchema = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);

/** Storefront routes that a category URL (/{category}) must never shadow. */
export const RESERVED_SLUGS = ["menu", "offers", "search", "checkout", "order", "contact", "delivery-areas", "policies", "sitemap", "robots", "opengraph-image", "api", "media", "_next"] as const;
const categorySlug = slug.refine((v) => !(RESERVED_SLUGS as readonly string[]).includes(v), "This web address is used by the store itself. Choose another.");

export const CategoryInputSchema = z.object({
  name: shortText(80),
  slug: categorySlug.optional(),
  description: optionalText(300),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  nameHi: optionalText(80),
  descriptionHi: optionalText(300),
  imageAssetId: id.nullable().optional(),
});
export type CategoryInput = z.infer<typeof CategoryInputSchema>;

export const ReorderSchema = z.object({ ids: z.array(id).min(1).max(500) });

export const ProductInputSchema = z.object({
  categoryId: id,
  name: shortText(120),
  slug: slug.optional(),
  description: optionalText(300),
  longDescription: optionalText(3000),
  basePriceMinor: money,
  imageAssetId: id.nullable().optional(),
  dietary: z.enum(["VEG", "NON_VEG", "EGG", "VEGAN"]).nullable().optional(),
  spiceLevel: z.number().int().min(0).max(3).nullable().optional(),
  allergens: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  modifierGroupIds: z.array(id).max(20).default([]),
  status: CatalogStatusSchema.default("DRAFT"),
  nameHi: optionalText(120),
  descriptionHi: optionalText(300),
  badges: z.array(z.object({
    kind: z.enum(BADGE_KINDS),
    label: z.string().trim().max(24).optional().default(""),
    tone: z.enum(BADGE_TONES).optional(),
  }).refine((b) => b.kind !== "custom" || b.label.length > 0, { message: "Give the badge a label.", path: ["label"] })).max(MAX_BADGES, `Up to ${MAX_BADGES} badges.`).default([]),
  /** Extra photos after the main one, in display order. */
  galleryAssetIds: z.array(id).max(8, "Up to 8 extra photos.").default([]),
});
export type ProductInput = z.infer<typeof ProductInputSchema>;

export const AvailabilityInputSchema = z.object({
  productIds: z.array(id).min(1).max(500),
  available: z.boolean(),
  reason: optionalText(200),
  /** Optional automatic return to stock, e.g. end of day. */
  until: z.iso.datetime({ offset: true }).nullable().optional(),
});

export const ProductStatusInputSchema = z.object({
  productIds: z.array(id).min(1).max(500),
  status: CatalogStatusSchema,
});

export const ModifierGroupInputSchema = z.object({
  name: shortText(80),
  description: optionalText(200),
  minSelections: z.number().int().min(0).max(20),
  maxSelections: z.number().int().min(1).max(20),
  modifiers: z.array(z.object({
    id: id.optional(),
    name: shortText(80),
    priceDeltaMinor: z.number().int().min(-10_000_000).max(10_000_000),
    active: z.boolean().default(true),
  })).min(1, "Add at least one option.").max(40),
}).refine((g) => g.maxSelections >= g.minSelections, { message: "Maximum must be at least the minimum.", path: ["maxSelections"] })
  .refine((g) => g.minSelections <= g.modifiers.length, { message: "Minimum is more than the number of options.", path: ["minSelections"] });
export type ModifierGroupInput = z.infer<typeof ModifierGroupInputSchema>;

// Admin: delivery & promotions --------------------------------------------------------------

export const DeliveryZoneInputSchema = z.object({
  name: shortText(80),
  ruleType: z.enum(["POSTAL_CODE", "RADIUS"]),
  postalCodes: z.array(z.string().trim().regex(/^[1-9][0-9]{5}$/, "Pincodes have 6 digits.")).max(500).default([]),
  radiusKm: z.number().min(0.5).max(50).nullable().optional(),
  feeMinor: money,
  minimumOrderMinor: money,
  /** Free delivery when the item total reaches this amount (null = always charge the fee). */
  freeDeliveryMinimumMinor: money.min(1).nullable().optional(),
  etaMin: z.number().int().min(0).max(240),
  etaMax: z.number().int().min(0).max(240),
  active: z.boolean().default(true),
}).refine((z) => z.etaMax >= z.etaMin, { message: "Maximum ETA must be at least the minimum.", path: ["etaMax"] })
  .refine((z) => z.ruleType !== "POSTAL_CODE" || z.postalCodes.length > 0, { message: "Add at least one pincode.", path: ["postalCodes"] })
  .refine((z) => z.ruleType !== "RADIUS" || (z.radiusKm ?? 0) > 0, { message: "Set a radius.", path: ["radiusKm"] });
export type DeliveryZoneInput = z.infer<typeof DeliveryZoneInputSchema>;

export const PromotionInputSchema = z.object({
  code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, - and _ only.").transform((c) => c.toUpperCase()),
  title: shortText(80),
  description: optionalText(300),
  type: z.enum(["FIXED", "PERCENTAGE"]),
  value: z.number().int().min(1),
  minimumOrderMinor: money,
  maxDiscountMinor: money.nullable().optional(),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  usageCap: z.number().int().min(1).nullable().optional(),
  newCustomerOnly: z.boolean().default(false),
  oncePerCustomer: z.boolean().default(false),
  isPublic: z.boolean().default(true),
  /**
   * Who can use the offer (ADR-014): PUBLIC = listed on the website, CODE_ONLY = works when typed but isn't listed,
   * STAFF_ONLY = only staff can apply it to orders they enter in the dashboard. Omitted = from `isPublic`.
   */
  audience: z.enum(["PUBLIC", "CODE_ONLY", "STAFF_ONLY"]).optional(),
  active: z.boolean().default(true),
}).refine((p) => p.type !== "PERCENTAGE" || p.value <= 100, { message: "A percentage cannot exceed 100.", path: ["value"] })
  .refine((p) => new Date(p.endsAt) > new Date(p.startsAt), { message: "End must be after start.", path: ["endsAt"] });
export type PromotionInput = z.infer<typeof PromotionInputSchema>;

// Admin: orders -----------------------------------------------------------------------------

export const OrderStatusSchema = z.enum(["NEW", "ACCEPTED", "PREPARING", "READY", "PACKED", "DISPATCHED", "DELIVERED", "CANCELLED"]);

export const TransitionInputSchema = z.object({ to: OrderStatusSchema.exclude(["CANCELLED", "DISPATCHED"]) });

export const CancelOrderInputSchema = z.object({
  reasonCode: z.enum(["CUSTOMER_REQUEST", "ITEM_UNAVAILABLE", "KITCHEN_CLOSED", "ADDRESS_ISSUE", "DELIVERY_FAILED", "PAYMENT_NOT_COMPLETED", "DUPLICATE_ORDER", "OTHER"]),
  note: optionalText(500),
  refund: z.boolean().default(true),
});

export const DispatchInputSchema = z.object({
  riderName: shortText(80),
  riderPhone: z.string().trim().max(20).optional().default(""),
  provider: z.string().trim().max(40).optional().default("MANUAL"),
  trackingReference: optionalText(200),
  notes: optionalText(300),
});

export const DeliveryUpdateInputSchema = z.object({
  status: z.enum(["PICKED_UP", "DELIVERED", "FAILED"]),
  note: optionalText(300),
});

export const OrderNoteInputSchema = z.object({ body: z.string().trim().min(1).max(2000) });

export const RefundInputSchema = z.object({
  amountMinor: money.min(1),
  reason: shortText(200),
});

export const OrderListQuerySchema = z.object({
  view: z.enum(["active", "awaiting_payment", "completed", "cancelled", "all"]).default("active"),
  q: z.string().trim().max(80).optional(),
  /** Only orders from this source (DIRECT_WEB, WHATSAPP, PHONE, WALK_IN, OTHER). */
  channel: z.enum(["DIRECT_WEB", "WHATSAPP", "PHONE", "WALK_IN", "OTHER"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z.string().max(200).optional(),
});

// Admin: customers / team / analytics -------------------------------------------------------

export const CustomerListQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  segment: z.enum(["all", "new", "repeat", "inactive_30"]).default("all"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(200).optional(),
});

export const RoleSchema = z.enum(["OWNER", "MANAGER", "KITCHEN", "STAFF"]);
export const InviteMemberSchema = z.object({ email: z.email().max(200), role: RoleSchema });
export const UpdateMemberSchema = z.object({ role: RoleSchema.optional(), active: z.boolean().optional() });

export const AnalyticsQuerySchema = z.object({
  range: z.enum(["today", "7d", "30d", "90d"]).default("30d"),
});

export const PageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(200).optional(),
});

// Storefront theme (ADR-012) ------------------------------------------------------------------------------
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #b42318.");
const radiusPx = z.number().int().min(0).refine((n) => n <= RADIUS_MAX || n === PILL_RADIUS, `Use 0–${RADIUS_MAX} px or ${PILL_RADIUS} for fully rounded.`);
const literalUnion = <T extends readonly (string | number)[]>(values: T) => z.union(values.map((v) => z.literal(v)) as unknown as [z.ZodLiteral<T[number]>, z.ZodLiteral<T[number]>, ...z.ZodLiteral<T[number]>[]]);

export const StoreThemeSchema = z.object({
  version: z.literal(THEME_VERSION),
  presetId: z.string().regex(/^[a-z0-9-]{1,40}$/).nullable(),
  mode: z.enum(THEME_OPTIONS.mode),
  colors: z.object(Object.fromEntries(THEME_COLOR_KEYS.map((k) => [k, hexColor])) as Record<(typeof THEME_COLOR_KEYS)[number], typeof hexColor>),
  typography: z.object({
    headingFont: z.enum(THEME_FONT_IDS),
    bodyFont: z.enum(THEME_FONT_IDS),
    scale: z.enum(THEME_OPTIONS.scale),
    headingWeight: literalUnion(THEME_OPTIONS.headingWeight),
    headingCase: z.enum(THEME_OPTIONS.textCase),
    buttonCase: z.enum(THEME_OPTIONS.textCase),
  }),
  shape: z.object({ button: radiusPx, card: radiusPx, input: radiusPx, chip: radiusPx, image: radiusPx }),
  borderWidth: literalUnion(THEME_OPTIONS.borderWidth),
  shadow: z.enum(THEME_OPTIONS.shadow),
  density: z.enum(THEME_OPTIONS.density),
  /** Optional for older clients; normalisation fills the default. */
  motion: z.enum(THEME_OPTIONS.motion).optional(),
  components: z.object({
    button: z.enum(THEME_OPTIONS.button),
    card: z.enum(THEME_OPTIONS.card),
    productLayout: z.enum(THEME_OPTIONS.productLayout),
    categoryNav: z.enum(THEME_OPTIONS.categoryNav),
    hero: z.enum(THEME_OPTIONS.hero),
    imageRatio: z.enum(THEME_OPTIONS.imageRatio),
    /** Optional for older clients; normalisation fills the default. */
    badge: z.enum(THEME_OPTIONS.badge).optional(),
  }),
});

/**
 * Brand experience (ADR-013). Validated structurally here (bounded size); every field is then normalised by the
 * domain (packages/domain normalizeExperience: enums, lengths, ids, per-section limits), and references are
 * checked against the restaurant's own media, dishes and categories by the API.
 */
export const StoreExperienceSchema = z.object({
  version: z.literal(1),
  sections: z.array(z.record(z.string(), z.unknown())).max(40),
}).loose();

export const SaveThemeDraftSchema = z.object({ theme: StoreThemeSchema.optional(), experience: StoreExperienceSchema.optional() })
  .refine((b) => b.theme || b.experience, { message: "Send a theme or an experience." });
export const PublishThemeSchema = z.object({ theme: StoreThemeSchema.optional(), experience: StoreExperienceSchema.optional() });
export const RestoreThemeSchema = z.object({ versionId: id });

// Media library & policies ------------------------------------------------------------------------------------
export const MediaKindSchema = z.enum(["general", "logo", "hero", "product", "category", "gallery", "story", "banner"]);
export const MediaUpdateSchema = z.object({
  altText: z.string().trim().max(250).optional(),
  kind: MediaKindSchema.optional(),
});
export const MediaListQuerySchema = z.object({ kind: MediaKindSchema.optional(), limit: z.coerce.number().int().min(1).max(200).default(100) });

const localized = (max: number) => z.object({ en: z.string().trim().max(max).default(""), hi: z.string().trim().max(max).default("") });
export const PolicyKeySchema = z.enum(["refund", "terms", "privacy", "delivery"]);
export const PoliciesInputSchema = z.object({
  policies: z.partialRecord(PolicyKeySchema, z.object({ body: localized(20_000) })),
});

// Admin: orders entered by staff (ADR-014) ---------------------------------------------------

/** Where a staff-entered order came from. Website orders are DIRECT_WEB; aggregators are not entered by hand. */
export const STAFF_ORDER_CHANNELS = ["WHATSAPP", "PHONE", "WALK_IN", "OTHER"] as const;
export const StaffOrderChannelSchema = z.enum(STAFF_ORDER_CHANNELS);
/** CASH / UPI / CARD = collected now; PAY_LATER = collect on delivery or pickup, then "Mark as paid". */
export const StaffPaymentSchema = z.enum(["CASH", "UPI", "CARD", "PAY_LATER"]);

export const StaffOrderInputSchema = QuoteInputSchema.omit({ customerPhone: true }).extend({
  channel: StaffOrderChannelSchema,
  customer: z.object({
    name: optionalText(80),
    phone: z.string().trim().max(20).optional().default(""),
    email: z.union([z.email().max(200), z.literal("")]).optional().default(""),
  }),
  customerNote: optionalText(500),
  payment: StaffPaymentSchema,
  /** Send order updates (WhatsApp/SMS/email) to the customer. */
  notifyCustomer: z.boolean().default(true),
  /** Total the staff member saw; a different server total returns PRICE_CHANGED. */
  expectedTotalMinor: money,
}).superRefine((o, ctx) => {
  // Only a walk-in (or "other") pickup can be anonymous; everyone else needs a number to reach them on.
  const anonymousOk = o.fulfillmentType === "PICKUP" && (o.channel === "WALK_IN" || o.channel === "OTHER");
  if (!anonymousOk && !o.customer.phone) ctx.addIssue({ code: "custom", path: ["customer", "phone"], message: "Enter the customer's mobile number." });
  if (o.fulfillmentType === "DELIVERY" && !o.customer.name) ctx.addIssue({ code: "custom", path: ["customer", "name"], message: "Enter the customer's name for the rider." });
});
export type StaffOrderInput = z.infer<typeof StaffOrderInputSchema>;

/** Price check for the new-order screen: same as the website quote, plus the customer's phone for offer rules. */
export const StaffQuoteInputSchema = QuoteInputSchema;

export const MarkPaidInputSchema = z.object({ method: z.enum(["CASH", "UPI", "CARD"]) });

export const CustomerLookupQuerySchema = z.object({ phone: z.string().trim().min(8).max(20) });

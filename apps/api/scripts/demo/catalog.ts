// Saffron Street Kitchen — the dedicated restaurant for external, self-guided demos (DEMO_ACCESS.md).
// A pure-vegetarian North & South Indian cloud kitchen in Koramangala, Bengaluru. Everything here is fictional demo
// data with fixed ids, so `pnpm demo:seed` converges to the same restaurant every time. It never touches `pilot`.
// Money is in paise. Dish photos are listed in photos.ts.

export const DEMO = {
  tenantId: "d1000000-0000-4000-8000-000000000001",
  brandId: "d2000000-0000-4000-8000-000000000001",
  outletId: "d3000000-0000-4000-8000-000000000001",
  slug: "saffron-street",
  name: "Saffron Street Kitchen",
  legalName: "Saffron Street Foods (demo)",
  phone: "+919000000100",
  whatsapp: "+919000000100",
  tagline: "Pure-veg North & South Indian, cooked fresh in Koramangala",
  description:
    "A pure-vegetarian cloud kitchen cooking dum biryani, slow-simmered dals, tandoor breads, crisp dosas and street-style chaat — packed hot for delivery or ready for pickup.",
  cuisines: ["North Indian", "South Indian", "Biryani", "Street Food"],
  address: { line1: "No. 14, 80 Feet Road, 6th Block", line2: "Koramangala", city: "Bengaluru", region: "Karnataka", postalCode: "560095", countryCode: "IN" },
  latitude: 12.9352,
  longitude: 77.6245,
  contact: { name: "Demo Owner", phone: "+919000000100", email: "demo-owner+clerk_test@example.com" },
} as const;

/** Demo team. Emails use Clerk's test-mode suffix (+clerk_test): verification code 424242, no email is ever sent. */
export const DEMO_USERS = [
  { id: "d8000000-0000-4000-8000-000000000001", role: "OWNER", email: "demo-owner+clerk_test@example.com", username: "demo_owner", firstName: "Demo", lastName: "Owner", phone: "+12015550141" },
  { id: "d8000000-0000-4000-8000-000000000002", role: "MANAGER", email: "demo-manager+clerk_test@example.com", username: "demo_manager", firstName: "Demo", lastName: "Manager", phone: "+12015550142" },
  { id: "d8000000-0000-4000-8000-000000000003", role: "KITCHEN", email: "demo-kitchen+clerk_test@example.com", username: "demo_kitchen", firstName: "Demo", lastName: "Kitchen", phone: "+12015550143" },
  { id: "d8000000-0000-4000-8000-000000000004", role: "STAFF", email: "demo-staff+clerk_test@example.com", username: "demo_staff", firstName: "Demo", lastName: "Staff", phone: "+12015550144" },
] as const;

/** Shared demo password for every demo account (published in DEMO_ACCESS.md on purpose: these are demo-only users). */
export const DEMO_PASSWORD = "SaffronDemo#2026";

const id = (prefix: string, n: number) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const CATEGORIES = [
  { id: id("d4", 1), slug: "starters", name: "Starters", nameHi: "स्टार्टर्स", description: "From the tandoor and the wok, made to share." },
  { id: id("d4", 2), slug: "chaat-street-food", name: "Chaat & Street Food", nameHi: "चाट", description: "Tangy, crunchy, Mumbai-and-Delhi style favourites." },
  { id: id("d4", 3), slug: "biryani-rice", name: "Biryani & Rice", nameHi: "बिरयानी और चावल", description: "Dum-cooked biryanis and comforting rice bowls." },
  { id: id("d4", 4), slug: "curries", name: "Curries & Dals", nameHi: "करी और दाल", description: "Slow-cooked gravies — pair them with a bread or rice." },
  { id: id("d4", 5), slug: "breads", name: "Tandoor Breads", nameHi: "रोटी और नान", description: "Baked to order in the tandoor." },
  { id: id("d4", 6), slug: "south-indian", name: "South Indian", nameHi: "दक्षिण भारतीय", description: "Dosas, idlis and vadas with fresh chutneys and sambar." },
  { id: id("d4", 7), slug: "thalis-combos", name: "Thalis & Combos", nameHi: "थाली", description: "Complete meals in one box — the easiest lunch order." },
  { id: id("d4", 8), slug: "desserts", name: "Desserts", nameHi: "मिठाई", description: "Something sweet to finish." },
  { id: id("d4", 9), slug: "beverages", name: "Beverages", nameHi: "पेय", description: "Lassis, coolers and filter coffee." },
] as const;

type CategorySlug = (typeof CATEGORIES)[number]["slug"];

export interface DemoProduct {
  n: number;
  slug: string;
  name: string;
  nameHi?: string;
  category: CategorySlug;
  price: number;
  description: string;
  longDescription?: string;
  dietary: "VEG" | "VEGAN";
  spice: 0 | 1 | 2 | 3;
  allergens: string[];
  tags: string[];
  badges?: { kind: string; label?: string; tone?: string }[];
  groups?: string[];
  /** Relative popularity in the generated order history (drives the computed "Bestseller" badge). */
  weight: number;
  soldOut?: string;
  draft?: boolean;
}

export const PRODUCTS: DemoProduct[] = [
  // Starters
  { n: 1, slug: "paneer-tikka", name: "Paneer Tikka", nameHi: "पनीर टिक्का", category: "starters", price: 29900, dietary: "VEG", spice: 2, allergens: ["Dairy"], tags: ["tandoor", "high-protein"],
    description: "Cottage cheese, peppers and onion marinated in hung curd and spices, charred in the tandoor.", badges: [{ kind: "signature" }], groups: ["spice"], weight: 9 },
  { n: 2, slug: "hara-bhara-kabab", name: "Hara Bhara Kabab", category: "starters", price: 21900, dietary: "VEG", spice: 1, allergens: ["Dairy"], tags: ["shallow-fried"],
    description: "Spinach, green pea and potato patties with a cashew-free mint chutney.", weight: 4 },
  { n: 3, slug: "crispy-chilli-corn", name: "Crispy Chilli Corn", category: "starters", price: 19900, dietary: "VEGAN", spice: 2, allergens: ["Soy", "Gluten"], tags: ["indo-chinese"],
    description: "Golden fried sweet corn tossed with spring onion, garlic and green chilli.", weight: 5 },
  { n: 4, slug: "dahi-kebab", name: "Dahi Kebab", category: "starters", price: 23900, dietary: "VEG", spice: 1, allergens: ["Dairy", "Gluten"], tags: ["melt-in-mouth"],
    description: "Hung-curd kebabs with a crisp crumb and a soft, creamy centre.", badges: [{ kind: "chefs-choice" }], weight: 3 },
  { n: 5, slug: "tandoori-mushroom", name: "Tandoori Mushroom", category: "starters", price: 25900, dietary: "VEG", spice: 2, allergens: ["Dairy"], tags: ["tandoor"],
    description: "Button mushrooms in a smoky tandoori marinade.", weight: 3, soldOut: "Fresh mushrooms arrive tomorrow morning" },

  // Chaat & street food
  { n: 6, slug: "pani-puri", name: "Pani Puri (8 pcs)", category: "chaat-street-food", price: 9900, dietary: "VEGAN", spice: 2, allergens: ["Gluten"], tags: ["street-food"],
    description: "Crisp puris with spiced potato, tangy tamarind and mint-coriander pani packed separately.", weight: 6 },
  { n: 7, slug: "dahi-papdi-chaat", name: "Dahi Papdi Chaat", category: "chaat-street-food", price: 12900, dietary: "VEG", spice: 1, allergens: ["Dairy", "Gluten"], tags: ["street-food"],
    description: "Papdi, chickpeas and potato under sweet curd, tamarind and green chutney, finished with sev.", weight: 4 },
  { n: 8, slug: "pav-bhaji", name: "Pav Bhaji", category: "chaat-street-food", price: 17900, dietary: "VEG", spice: 2, allergens: ["Dairy", "Gluten"], tags: ["mumbai-style"],
    description: "Buttery mashed-vegetable bhaji with two toasted pavs, onion and lemon.", badges: [{ kind: "recommended" }], groups: ["pav-extras"], weight: 8 },
  { n: 9, slug: "samosa-chaat", name: "Samosa Chaat", category: "chaat-street-food", price: 13900, dietary: "VEG", spice: 2, allergens: ["Dairy", "Gluten"], tags: ["street-food"],
    description: "Crushed samosas with chole, curd and chutneys.", weight: 3 },

  // Biryani & rice
  { n: 10, slug: "veg-dum-biryani", name: "Veg Dum Biryani", nameHi: "वेज दम बिरयानी", category: "biryani-rice", price: 26900, dietary: "VEG", spice: 2, allergens: ["Dairy", "Nuts"], tags: ["dum-cooked", "serves-1"],
    description: "Seasonal vegetables and aged basmati sealed and dum-cooked with saffron and whole spices. Comes with raita and salan.",
    longDescription: "Our most-ordered dish. The rice and vegetables are layered with fried onion, mint and saffron milk, then sealed with dough and slow-cooked so every grain picks up the spices.",
    badges: [{ kind: "signature" }], groups: ["biryani-portion", "biryani-addons", "spice"], weight: 12 },
  { n: 11, slug: "paneer-tikka-biryani", name: "Paneer Tikka Biryani", category: "biryani-rice", price: 31900, dietary: "VEG", spice: 2, allergens: ["Dairy", "Nuts"], tags: ["dum-cooked"],
    description: "Tandoori paneer tikka layered through saffron dum biryani.", badges: [{ kind: "new" }], groups: ["biryani-portion", "biryani-addons", "spice"], weight: 7 },
  { n: 12, slug: "jeera-rice", name: "Jeera Rice", category: "biryani-rice", price: 14900, dietary: "VEGAN", spice: 0, allergens: [], tags: ["goes-with-dal"],
    description: "Basmati tempered with cumin and ghee-free oil.", weight: 5 },
  { n: 13, slug: "curd-rice", name: "Curd Rice", category: "biryani-rice", price: 12900, dietary: "VEG", spice: 1, allergens: ["Dairy", "Mustard"], tags: ["comfort-food"],
    description: "Soft rice and curd with a mustard-seed, curry-leaf and ginger tempering, pomegranate on top.", weight: 3 },

  // Curries & dals
  { n: 14, slug: "paneer-butter-masala", name: "Paneer Butter Masala", nameHi: "पनीर बटर मसाला", category: "curries", price: 27900, dietary: "VEG", spice: 1, allergens: ["Dairy", "Nuts"], tags: ["creamy"],
    description: "Paneer in a silky tomato, butter and cashew gravy.", groups: ["curry-portion"], weight: 11 },
  { n: 15, slug: "kadai-paneer", name: "Kadai Paneer", category: "curries", price: 27900, dietary: "VEG", spice: 2, allergens: ["Dairy"], tags: ["peppers"],
    description: "Paneer, capsicum and onion tossed in freshly pounded kadai masala.", groups: ["curry-portion", "spice"], weight: 5 },
  { n: 16, slug: "dal-makhani", name: "Dal Makhani", nameHi: "दाल मखनी", category: "curries", price: 21900, dietary: "VEG", spice: 0, allergens: ["Dairy"], tags: ["slow-cooked"],
    description: "Black lentils simmered overnight with butter and cream.", badges: [{ kind: "chefs-choice" }], groups: ["curry-portion"], weight: 10 },
  { n: 17, slug: "dal-tadka", name: "Yellow Dal Tadka", category: "curries", price: 17900, dietary: "VEGAN", spice: 1, allergens: ["Mustard"], tags: ["everyday"],
    description: "Toor dal finished with a cumin, garlic and red-chilli tadka.", groups: ["curry-portion"], weight: 6 },
  { n: 18, slug: "chana-masala", name: "Pindi Chana Masala", category: "curries", price: 19900, dietary: "VEGAN", spice: 2, allergens: [], tags: ["punjabi"],
    description: "Chickpeas in a dark, tangy Pindi-style masala.", groups: ["curry-portion", "spice"], weight: 4 },
  { n: 19, slug: "malai-kofta", name: "Malai Kofta", category: "curries", price: 28900, dietary: "VEG", spice: 0, allergens: ["Dairy", "Nuts"], tags: ["rich"],
    description: "Paneer and potato dumplings in a mild, creamy cashew gravy.", groups: ["curry-portion"], weight: 4 },
  { n: 20, slug: "palak-paneer", name: "Palak Paneer", category: "curries", price: 26900, dietary: "VEG", spice: 1, allergens: ["Dairy"], tags: ["greens"],
    description: "Paneer cubes in a garlicky spinach purée.", groups: ["curry-portion"], weight: 5 },
  { n: 21, slug: "sarson-ka-saag", name: "Sarson ka Saag", category: "curries", price: 24900, dietary: "VEG", spice: 1, allergens: ["Dairy", "Mustard"], tags: ["seasonal", "winter-special"],
    description: "Mustard greens slow-cooked with ghee — coming this winter.", draft: true, groups: ["curry-portion"], weight: 0 },

  // Breads
  { n: 22, slug: "butter-naan", name: "Butter Naan", category: "breads", price: 5900, dietary: "VEG", spice: 0, allergens: ["Dairy", "Gluten"], tags: ["tandoor"],
    description: "Leavened bread from the tandoor, brushed with butter.", groups: ["naan-extras"], weight: 12 },
  { n: 23, slug: "garlic-naan", name: "Garlic Naan", category: "breads", price: 6900, dietary: "VEG", spice: 0, allergens: ["Dairy", "Gluten"], tags: ["tandoor"],
    description: "Naan topped with chopped garlic and coriander.", groups: ["naan-extras"], weight: 8 },
  { n: 24, slug: "tandoori-roti", name: "Tandoori Roti", category: "breads", price: 3900, dietary: "VEGAN", spice: 0, allergens: ["Gluten"], tags: ["whole-wheat"],
    description: "Whole-wheat bread from the tandoor.", weight: 6 },
  { n: 25, slug: "lachha-paratha", name: "Lachha Paratha", category: "breads", price: 6900, dietary: "VEG", spice: 0, allergens: ["Dairy", "Gluten"], tags: ["flaky"],
    description: "Flaky, layered whole-wheat paratha.", weight: 4 },

  // South Indian
  { n: 26, slug: "masala-dosa", name: "Masala Dosa", nameHi: "मसाला डोसा", category: "south-indian", price: 14900, dietary: "VEGAN", spice: 1, allergens: ["Mustard"], tags: ["breakfast", "all-day"],
    description: "Crisp rice-and-lentil crêpe with potato masala, coconut chutney and sambar.", groups: ["dosa-extras"], weight: 9 },
  { n: 27, slug: "mysore-masala-dosa", name: "Mysore Masala Dosa", category: "south-indian", price: 15900, dietary: "VEGAN", spice: 3, allergens: ["Mustard"], tags: ["spicy"],
    description: "Dosa lined with fiery red chutney and filled with potato masala.", groups: ["dosa-extras"], weight: 5 },
  { n: 28, slug: "ghee-podi-idli", name: "Ghee Podi Idli (4 pcs)", category: "south-indian", price: 11900, dietary: "VEG", spice: 2, allergens: ["Dairy", "Sesame"], tags: ["breakfast"],
    description: "Mini idlis tossed in ghee and gunpowder podi.", weight: 4 },
  { n: 29, slug: "medu-vada", name: "Medu Vada (2 pcs)", category: "south-indian", price: 9900, dietary: "VEGAN", spice: 1, allergens: [], tags: ["breakfast"],
    description: "Crisp urad-dal doughnuts with chutney and sambar.", weight: 3 },

  // Thalis & combos
  { n: 30, slug: "saffron-street-thali", name: "Saffron Street Thali", category: "thalis-combos", price: 34900, dietary: "VEG", spice: 1, allergens: ["Dairy", "Gluten", "Nuts"], tags: ["complete-meal"],
    description: "Paneer butter masala, dal makhani, seasonal sabzi, jeera rice, two butter naans, raita, salad and gulab jamun.",
    badges: [{ kind: "combo" }, { kind: "custom", label: "Best value", tone: "success" }], weight: 7 },
  { n: 31, slug: "rajma-chawal-bowl", name: "Rajma Chawal Bowl", category: "thalis-combos", price: 19900, dietary: "VEGAN", spice: 1, allergens: [], tags: ["comfort-food"],
    description: "Kashmiri rajma over jeera rice with onion salad.", badges: [{ kind: "combo" }], weight: 5 },
  { n: 32, slug: "chole-kulche-combo", name: "Chole Kulche Combo", category: "thalis-combos", price: 18900, dietary: "VEG", spice: 2, allergens: ["Dairy", "Gluten"], tags: ["punjabi"],
    description: "Pindi chole with two butter kulchas, pickled onion and a sweet lassi.", badges: [{ kind: "combo" }], weight: 4 },

  // Desserts
  { n: 33, slug: "gulab-jamun", name: "Gulab Jamun (2 pcs)", category: "desserts", price: 8900, dietary: "VEG", spice: 0, allergens: ["Dairy", "Gluten"], tags: ["warm"],
    description: "Soft khoya dumplings in cardamom-rose syrup, served warm.", weight: 7 },
  { n: 34, slug: "rasmalai", name: "Rasmalai (2 pcs)", category: "desserts", price: 11900, dietary: "VEG", spice: 0, allergens: ["Dairy", "Nuts"], tags: ["chilled"],
    description: "Chhena discs in saffron-cardamom milk with pistachio.", weight: 4, soldOut: "Sold out for today" },
  { n: 35, slug: "gajar-halwa", name: "Gajar ka Halwa", category: "desserts", price: 10900, dietary: "VEG", spice: 0, allergens: ["Dairy", "Nuts"], tags: ["seasonal"],
    description: "Slow-cooked carrot halwa with khoya and almonds.", badges: [{ kind: "limited" }], weight: 3 },

  // Beverages
  { n: 36, slug: "mango-lassi", name: "Mango Lassi", category: "beverages", price: 9900, dietary: "VEG", spice: 0, allergens: ["Dairy"], tags: ["chilled"],
    description: "Alphonso mango blended with thick curd.", groups: ["drink-size"], weight: 8 },
  { n: 37, slug: "masala-chaas", name: "Masala Chaas", category: "beverages", price: 6900, dietary: "VEG", spice: 1, allergens: ["Dairy"], tags: ["digestive"],
    description: "Spiced buttermilk with roasted cumin and mint.", groups: ["drink-size"], weight: 6 },
  { n: 38, slug: "filter-coffee", name: "Filter Coffee", category: "beverages", price: 6900, dietary: "VEG", spice: 0, allergens: ["Dairy"], tags: ["hot"],
    description: "Strong South Indian decoction with frothy milk.", weight: 5 },
  { n: 39, slug: "fresh-lime-soda", name: "Fresh Lime Soda", category: "beverages", price: 7900, dietary: "VEGAN", spice: 0, allergens: [], tags: ["chilled"],
    description: "Sweet, salted or mixed — tell us in the order note.", weight: 4 },
];

export const productId = (n: number) => id("d5", n);

export interface DemoGroup { key: string; n: number; name: string; description: string; min: number; max: number; options: { name: string; delta: number }[] }

export const MODIFIER_GROUPS: DemoGroup[] = [
  { key: "biryani-portion", n: 1, name: "Biryani portion", description: "Choose your portion size", min: 1, max: 1, options: [{ name: "Regular (serves 1)", delta: 0 }, { name: "Family pack (serves 3)", delta: 42000 }] },
  { key: "biryani-addons", n: 2, name: "Biryani add-ons", description: "Extras on the side (up to 2)", min: 0, max: 2, options: [{ name: "Extra raita", delta: 3000 }, { name: "Mirchi ka salan", delta: 4000 }, { name: "Roasted papad", delta: 2000 }] },
  { key: "spice", n: 3, name: "Spice level", description: "How hot should we make it?", min: 1, max: 1, options: [{ name: "Mild", delta: 0 }, { name: "Medium", delta: 0 }, { name: "Spicy", delta: 0 }] },
  { key: "curry-portion", n: 4, name: "Curry portion", description: "Choose your portion size", min: 1, max: 1, options: [{ name: "Regular (serves 1–2)", delta: 0 }, { name: "Large (serves 3–4)", delta: 14000 }] },
  { key: "naan-extras", n: 5, name: "Make it special", description: "Optional", min: 0, max: 1, options: [{ name: "Stuffed with cheese", delta: 3000 }, { name: "Extra butter", delta: 1000 }] },
  { key: "dosa-extras", n: 6, name: "Dosa extras", description: "Up to 2", min: 0, max: 2, options: [{ name: "Ghee roast", delta: 2000 }, { name: "Cheese", delta: 3000 }, { name: "Extra chutney", delta: 1500 }] },
  { key: "pav-extras", n: 7, name: "Pav bhaji extras", description: "Up to 3", min: 0, max: 3, options: [{ name: "Extra pav (2 pcs)", delta: 2500 }, { name: "Extra butter", delta: 1500 }, { name: "Cheese on top", delta: 3000 }] },
  { key: "drink-size", n: 8, name: "Size", description: "Choose a size", min: 1, max: 1, options: [{ name: "Regular (300 ml)", delta: 0 }, { name: "Large (500 ml)", delta: 4000 }] },
];

export const groupId = (n: number) => id("d9", n);
export const modifierId = (group: number, option: number) => `da000000-0000-4000-8000-${String(group * 100 + option).padStart(12, "0")}`;

export const DELIVERY_ZONES = [
  { n: 1, name: "Koramangala & nearby", postalCodes: ["560095", "560034", "560047"], fee: 2500, etaMin: 25, etaMax: 35, minimum: 14900, freeOver: 49900 },
  { n: 2, name: "HSR Layout & BTM", postalCodes: ["560102", "560076", "560068"], fee: 4000, etaMin: 35, etaMax: 45, minimum: 19900, freeOver: 79900 },
  { n: 3, name: "Indiranagar & Domlur", postalCodes: ["560038", "560008", "560071"], fee: 5500, etaMin: 40, etaMax: 55, minimum: 29900, freeOver: null },
] as const;
export const zoneId = (n: number) => id("d6", n);

export const PROMOTIONS = [
  { n: 1, code: "WELCOME50", title: "₹50 off your first order", description: "For new customers ordering direct on our website.", type: "FIXED", value: 5000, minimum: 29900, maxDiscount: null,
    newCustomerOnly: true, oncePerCustomer: true, cap: null, isPublic: true, staffOnly: false, status: "ACTIVE", starts: "2026-07-01T00:00:00+05:30", ends: "2030-12-31T23:59:59+05:30" },
  { n: 2, code: "SAFFRON20", title: "20% off orders above ₹499", description: "Up to ₹120 off. Valid on every order above ₹499.", type: "PERCENTAGE", value: 20, minimum: 49900, maxDiscount: 12000,
    newCustomerOnly: false, oncePerCustomer: false, cap: null, isPublic: true, staffOnly: false, status: "ACTIVE", starts: "2026-07-01T00:00:00+05:30", ends: "2030-12-31T23:59:59+05:30" },
  { n: 3, code: "FEAST100", title: "₹100 off family feasts", description: "₹100 off orders of ₹999 or more.", type: "FIXED", value: 10000, minimum: 99900, maxDiscount: null,
    newCustomerOnly: false, oncePerCustomer: false, cap: 500, isPublic: true, staffOnly: false, status: "ACTIVE", starts: "2026-07-01T00:00:00+05:30", ends: "2030-12-31T23:59:59+05:30" },
  { n: 4, code: "REGULAR10", title: "10% for regulars (staff only)", description: "Staff can apply this on phone, WhatsApp and walk-in orders for regular customers. Customers never see it.", type: "PERCENTAGE", value: 10, minimum: 0, maxDiscount: 10000,
    newCustomerOnly: false, oncePerCustomer: false, cap: null, isPublic: false, staffOnly: true, status: "ACTIVE", starts: "2026-07-01T00:00:00+05:30", ends: "2030-12-31T23:59:59+05:30" },
  { n: 5, code: "MONSOON15", title: "Monsoon special: 15% off", description: "Ended on 30 September.", type: "PERCENTAGE", value: 15, minimum: 39900, maxDiscount: 9000,
    newCustomerOnly: false, oncePerCustomer: false, cap: null, isPublic: true, staffOnly: false, status: "ACTIVE", starts: "2026-07-15T00:00:00+05:30", ends: "2026-09-30T23:59:59+05:30" },
  { n: 6, code: "LUNCHBOX", title: "₹75 off weekday lunch thalis", description: "Paused while we restock lunch boxes.", type: "FIXED", value: 7500, minimum: 34900, maxDiscount: null,
    newCustomerOnly: false, oncePerCustomer: false, cap: null, isPublic: true, staffOnly: false, status: "INACTIVE", starts: "2026-08-01T00:00:00+05:30", ends: "2030-12-31T23:59:59+05:30" },
] as const;
export const promotionId = (n: number) => id("d7", n);

/** Fictional customers: 900000xxxx phone numbers and example.com emails. */
export const CUSTOMERS = [
  { name: "Ananya Rao", area: 0, email: true, consent: true, weight: 9, note: "Prefers less oil. Usually orders for the office team on Fridays." },
  { name: "Rohan Mehta", area: 0, email: true, consent: true, weight: 8 },
  { name: "Priya Iyer", area: 1, email: true, consent: false, weight: 7 },
  { name: "Karthik Subramanian", area: 0, email: false, consent: true, weight: 7, note: "Gate code 4521. Call on arrival." },
  { name: "Sneha Kulkarni", area: 1, email: true, consent: true, weight: 6 },
  { name: "Arjun Nair", area: 2, email: true, consent: false, weight: 5 },
  { name: "Meera Krishnan", area: 0, email: true, consent: true, weight: 5 },
  { name: "Vikram Shetty", area: 0, email: false, consent: false, weight: 4 },
  { name: "Divya Menon", area: 1, email: true, consent: true, weight: 4 },
  { name: "Aditya Joshi", area: 2, email: false, consent: false, weight: 4 },
  { name: "Neha Agarwal", area: 0, email: true, consent: true, weight: 3, note: "Jain preference — no onion, no garlic when possible." },
  { name: "Siddharth Reddy", area: 1, email: false, consent: false, weight: 3 },
  { name: "Kavya Hegde", area: 0, email: true, consent: false, weight: 3 },
  { name: "Rahul Verma", area: 1, email: true, consent: true, weight: 3 },
  { name: "Ishita Banerjee", area: 2, email: true, consent: false, weight: 2 },
  { name: "Manish Gupta", area: 0, email: false, consent: false, weight: 2 },
  { name: "Pooja Desai", area: 1, email: true, consent: true, weight: 2 },
  { name: "Nikhil Pillai", area: 0, email: false, consent: false, weight: 2 },
  { name: "Tanvi Saxena", area: 2, email: true, consent: false, weight: 2 },
  { name: "Harsh Malhotra", area: 0, email: true, consent: true, weight: 2 },
  { name: "Lakshmi Narayan", area: 1, email: false, consent: false, weight: 1 },
  { name: "Aman Chopra", area: 0, email: true, consent: false, weight: 1 },
  { name: "Ritu Sharma", area: 1, email: true, consent: true, weight: 1 },
  { name: "Farhan Qureshi", area: 0, email: false, consent: false, weight: 1 },
  { name: "Deepa Raghavan", area: 2, email: true, consent: false, weight: 1 },
  { name: "Gaurav Bhatt", area: 0, email: true, consent: true, weight: 1 },
  { name: "Swati Jain", area: 1, email: false, consent: false, weight: 1 },
  { name: "Varun Kapoor", area: 0, email: true, consent: false, weight: 1 },
] as const;

/** Streets per delivery zone (index = DELIVERY_ZONES index). */
export const STREETS = [
  [["Flat 302, Lakeview Residency, 1st Cross", "5th Block", "560095"], ["No. 88, 17th Main", "4th Block", "560034"], ["House 12, 8th Cross", "Ejipura", "560047"], ["B-704, Prestige Apartments, 20th Main", "1st Block", "560034"]],
  [["No. 1121, 24th Main", "HSR Layout Sector 1", "560102"], ["Flat 5B, Green Glen, 16th Main", "BTM 2nd Stage", "560076"], ["No. 45, 7th Cross", "Madiwala", "560068"]],
  [["No. 610, 12th Main, HAL 2nd Stage", "Indiranagar", "560038"], ["A-12, Embassy Heights", "Domlur", "560071"], ["No. 23, 5th Cross", "Jeevan Bima Nagar", "560008"]],
] as const;

export const RIDERS = [
  { name: "Manjunath", phone: "+919000000201" },
  { name: "Salim", phone: "+919000000202" },
  { name: "Ravi Kumar", phone: "+919000000203" },
  { name: "Santosh", phone: "+919000000204" },
];

export const CUSTOMER_NOTES = [
  "Please make it less spicy.", "No onion please.", "Ring the bell twice.", "Extra napkins please.", "Leave with the security guard.",
  "Please pack chutneys separately.", "Call when you reach the gate.", "Birthday order — please pack neatly!",
];

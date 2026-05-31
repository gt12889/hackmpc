// MCC -> human spend category for SMB company-card transactions.
// The dataset's coded "Transaction Category" column is useless (99% one value),
// so MCC is the real category signal. Covers the ~30 MCCs that are >98% of rows
// plus common standard codes; unknown MCCs fall back to range-based bucketing.

export type CategoryDef = {
  category: string;
  subcategory?: string;
  description: string;
  restricted?: boolean; // surfaced by the policy engine (e.g. alcohol, gambling)
};

// Canonical category list used across the app (charts, filters, policy scopes).
export const CATEGORIES = [
  "Fuel",
  "Permits & Compliance",
  "Tolls & Border",
  "Scales & Wash",
  "Maintenance & Repair",
  "Meals",
  "Lodging",
  "Ground Transport",
  "Air Travel",
  "Telecom",
  "Freight & Shipping",
  "Office & Admin",
  "Training",
  "Restricted",
  "Payments & Settlements",
  "Other",
] as const;

// Categories that are financial movements, not operational spend. The dashboard
// and analytics exclude these from "spend" so a $1.18M card payment doesn't
// dwarf real fuel/permit costs.
export const NON_OPERATIONAL = ["Payments & Settlements"] as const;

export const MCC_MAP: Record<string, CategoryDef> = {
  // ---- Fuel ----
  "5541": { category: "Fuel", subcategory: "Service Station", description: "Service Stations (with/without ancillary services)" },
  "5542": { category: "Fuel", subcategory: "Automated Fuel", description: "Automated Fuel Dispensers" },
  "5983": { category: "Fuel", subcategory: "Fuel Dealer", description: "Fuel Dealers (fuel oil, wood, coal, LPG)" },
  "5172": { category: "Fuel", subcategory: "Petroleum", description: "Petroleum and Petroleum Products" },

  // ---- Permits & Compliance (govt) — the single biggest bucket in this fleet ----
  "9399": { category: "Permits & Compliance", subcategory: "Government Services", description: "Government Services (oversize/overweight permits, DOT)" },
  "9311": { category: "Permits & Compliance", subcategory: "Tax", description: "Tax Payments" },
  "9222": { category: "Permits & Compliance", subcategory: "Fines", description: "Fines / Government" },
  "9211": { category: "Permits & Compliance", subcategory: "Court", description: "Court Costs / Alimony" },
  "9402": { category: "Permits & Compliance", subcategory: "Postal", description: "Postal Services - Government" },
  "9405": { category: "Permits & Compliance", subcategory: "Government", description: "Intra-Government Purchases" },

  // ---- Tolls & Border ----
  "4784": { category: "Tolls & Border", subcategory: "Tolls", description: "Tolls and Bridge Fees" },
  "4789": { category: "Tolls & Border", subcategory: "Transport Svc", description: "Transportation Services (NEC)" },

  // ---- Scales & Wash ----
  "7542": { category: "Scales & Wash", subcategory: "Car Wash", description: "Car Washes" },
  "5046": { category: "Scales & Wash", subcategory: "Scales/Equipment", description: "Commercial Equipment (truck scales, e.g. CAT Scale)" },

  // ---- Maintenance & Repair ----
  "7538": { category: "Maintenance & Repair", subcategory: "Auto Service", description: "Automotive Service Shops" },
  "5533": { category: "Maintenance & Repair", subcategory: "Auto Parts", description: "Automotive Parts and Accessories" },
  "7549": { category: "Maintenance & Repair", subcategory: "Towing", description: "Towing Services" },
  "5532": { category: "Maintenance & Repair", subcategory: "Tires", description: "Automotive Tire Stores" },
  "7531": { category: "Maintenance & Repair", subcategory: "Body Shop", description: "Auto Body Repair Shops" },
  "5561": { category: "Maintenance & Repair", subcategory: "Trailers", description: "Recreational & Utility Trailers" },
  "5571": { category: "Maintenance & Repair", subcategory: "Parts", description: "Motorcycle / Parts Shops" },
  "5013": { category: "Maintenance & Repair", subcategory: "Parts Wholesale", description: "Motor Vehicle Supplies and New Parts" },
  "7534": { category: "Maintenance & Repair", subcategory: "Tire Retread", description: "Tire Retreading and Repair" },

  // ---- Meals ----
  "5812": { category: "Meals", subcategory: "Restaurant", description: "Eating Places and Restaurants" },
  "5814": { category: "Meals", subcategory: "Fast Food", description: "Fast Food Restaurants" },
  "5411": { category: "Meals", subcategory: "Grocery", description: "Grocery Stores and Supermarkets" },
  "5499": { category: "Meals", subcategory: "Convenience", description: "Misc Food Stores / Convenience" },
  "5462": { category: "Meals", subcategory: "Bakery", description: "Bakeries" },

  // ---- Lodging ----
  "7011": { category: "Lodging", subcategory: "Hotel", description: "Hotels, Motels, Resorts" },
  "7012": { category: "Lodging", subcategory: "Timeshare", description: "Timeshares" },

  // ---- Ground Transport ----
  "4121": { category: "Ground Transport", subcategory: "Taxi/Limo", description: "Taxicabs and Limousines" },
  "4111": { category: "Ground Transport", subcategory: "Commuter", description: "Local/Suburban Commuter Transport" },
  "4131": { category: "Ground Transport", subcategory: "Bus", description: "Bus Lines" },
  "7512": { category: "Ground Transport", subcategory: "Car Rental", description: "Automobile Rental Agency" },
  "7513": { category: "Ground Transport", subcategory: "Truck Rental", description: "Truck/Utility Trailer Rentals" },
  "7519": { category: "Ground Transport", subcategory: "RV Rental", description: "Motor Home / RV Rentals" },
  "4011": { category: "Ground Transport", subcategory: "Rail", description: "Railroads (freight)" },

  // ---- Air Travel ----
  "4511": { category: "Air Travel", subcategory: "Airline", description: "Airlines and Air Carriers" },
  "4582": { category: "Air Travel", subcategory: "Airport", description: "Airports, Flying Fields, Terminals" },

  // ---- Telecom ----
  "4814": { category: "Telecom", subcategory: "Telecom", description: "Telecommunication Services" },
  "4816": { category: "Telecom", subcategory: "Internet", description: "Computer Network / Information Services" },
  "4899": { category: "Telecom", subcategory: "Cable", description: "Cable, Satellite, Pay TV" },
  "4812": { category: "Telecom", subcategory: "Equipment", description: "Telecommunication Equipment / Phone Sales" },

  // ---- Freight & Shipping ----
  "4215": { category: "Freight & Shipping", subcategory: "Courier", description: "Courier Services (Air/Ground), Freight Forwarders" },
  "4214": { category: "Freight & Shipping", subcategory: "Motor Freight", description: "Motor Freight Carriers, Trucking, Moving" },
  "4225": { category: "Freight & Shipping", subcategory: "Storage", description: "Public Warehousing and Storage" },

  // ---- Office & Admin ----
  "5111": { category: "Office & Admin", subcategory: "Stationery", description: "Stationery, Office Supplies, Printing" },
  "5943": { category: "Office & Admin", subcategory: "Office Supply", description: "Stationery / Office Supply Stores" },
  "5734": { category: "Office & Admin", subcategory: "Software", description: "Computer Software Stores" },
  "5732": { category: "Office & Admin", subcategory: "Electronics", description: "Electronics Stores" },
  "7399": { category: "Office & Admin", subcategory: "Business Svc", description: "Business Services (NEC)" },
  "7372": { category: "Office & Admin", subcategory: "IT Services", description: "Computer Programming / Data Processing" },
  "8999": { category: "Office & Admin", subcategory: "Professional", description: "Professional Services (NEC)" },
  "8911": { category: "Office & Admin", subcategory: "Engineering", description: "Architectural / Engineering / Surveying" },
  "6300": { category: "Office & Admin", subcategory: "Insurance", description: "Insurance Sales / Underwriting" },
  "5045": { category: "Office & Admin", subcategory: "Computers", description: "Computers, Peripherals, Software" },

  // ---- Training ----
  "8220": { category: "Training", subcategory: "College", description: "Colleges, Universities, Professional Schools" },
  "8299": { category: "Training", subcategory: "Education", description: "Educational Services (NEC)" },
  "8249": { category: "Training", subcategory: "Vocational", description: "Vocational / Trade Schools" },

  // ---- Restricted (policy: no alcohol unless dining w/ customer; no personal entertainment) ----
  "5813": { category: "Restricted", subcategory: "Bar/Lounge", description: "Drinking Places (Bars, Taverns, Lounges)", restricted: true },
  "5921": { category: "Restricted", subcategory: "Liquor", description: "Package Stores - Beer, Wine, Liquor", restricted: true },
  "7995": { category: "Restricted", subcategory: "Gambling", description: "Betting / Casino Gambling", restricted: true },
  "7996": { category: "Restricted", subcategory: "Amusement", description: "Amusement Parks, Carnivals", restricted: true },
  "7994": { category: "Restricted", subcategory: "Arcade", description: "Video Game Arcades", restricted: true },
  "7800": { category: "Restricted", subcategory: "Lottery", description: "Government-Owned Lotteries", restricted: true },
  "5993": { category: "Restricted", subcategory: "Tobacco", description: "Cigar Stores and Stands", restricted: true },

  // ---- Payments & Settlements (financial movements, not spend) ----
  "6011": { category: "Payments & Settlements", subcategory: "ATM/Cash", description: "Financial Institutions - Cash/ATM" },
  "6012": { category: "Payments & Settlements", subcategory: "Financial", description: "Financial Institutions - Merchandise" },
  "6051": { category: "Payments & Settlements", subcategory: "Quasi-Cash", description: "Non-FI - Money Orders, Quasi-Cash" },

  // ---- Office & Admin / Supplies (long tail that was landing in Other) ----
  "5085": { category: "Maintenance & Repair", subcategory: "Industrial Supplies", description: "Industrial Supplies (NEC)" },
  "5047": { category: "Maintenance & Repair", subcategory: "Equipment", description: "Medical/Dental/Lab/Industrial Equipment" },
  "5099": { category: "Maintenance & Repair", subcategory: "Durable Goods", description: "Durable Goods (NEC)" },
  "5511": { category: "Maintenance & Repair", subcategory: "Truck Dealer", description: "Car/Truck Dealers - Sales & Service" },
  "5251": { category: "Maintenance & Repair", subcategory: "Hardware", description: "Hardware Stores" },
  "5200": { category: "Office & Admin", subcategory: "Home Supply", description: "Home Supply Warehouse Stores" },
  "5211": { category: "Office & Admin", subcategory: "Building Materials", description: "Lumber and Building Materials" },
  "5300": { category: "Office & Admin", subcategory: "Wholesale Club", description: "Wholesale Clubs (e.g. Costco)" },
  "5310": { category: "Office & Admin", subcategory: "Discount", description: "Discount Stores" },
  "5311": { category: "Office & Admin", subcategory: "Department", description: "Department Stores" },
  "5199": { category: "Office & Admin", subcategory: "Nondurable Goods", description: "Nondurable Goods (NEC)" },
  "5999": { category: "Office & Admin", subcategory: "Specialty Retail", description: "Misc / Specialty Retail" },
  "5599": { category: "Maintenance & Repair", subcategory: "Auto Dealers NEC", description: "Automotive Dealers (NEC)" },
  "5817": { category: "Office & Admin", subcategory: "Software/SaaS", description: "Digital Goods - Applications/Software" },
  "5818": { category: "Office & Admin", subcategory: "Software/SaaS", description: "Digital Goods - Large Merchant" },
  "5968": { category: "Office & Admin", subcategory: "Subscription", description: "Direct Marketing - Subscriptions" },
  "7392": { category: "Office & Admin", subcategory: "Consulting", description: "Management, Consulting, PR Services" },
  "7299": { category: "Office & Admin", subcategory: "Services", description: "Miscellaneous Personal Services" },
  "7311": { category: "Office & Admin", subcategory: "Advertising", description: "Advertising Services" },
  "7338": { category: "Office & Admin", subcategory: "Printing", description: "Quick Copy / Reproduction" },
  "4900": { category: "Office & Admin", subcategory: "Utilities", description: "Utilities - Electric, Gas, Water, Sanitary" },
  "8675": { category: "Permits & Compliance", subcategory: "Membership", description: "Automobile Associations" },
  "8398": { category: "Office & Admin", subcategory: "Membership", description: "Charitable / Membership Organizations" },
  "1799": { category: "Maintenance & Repair", subcategory: "Contractor", description: "Special Trade Contractors (NEC)" },
  "0763": { category: "Maintenance & Repair", subcategory: "Ag Equipment", description: "Agricultural Co-op / Equipment" },
  "2842": { category: "Office & Admin", subcategory: "Specialty Cleaning", description: "Specialty Cleaning/Sanitation Preparations" },
};

// Merchant-name pattern overrides (applied after MCC lookup). Border-crossing and
// scale companies show up under several MCCs, so we pin them by name.
export const MERCHANT_OVERRIDES: { pattern: RegExp; def: CategoryDef }[] = [
  // Financial settlements first — these are not operational spend.
  { pattern: /EFT PAYMENT|\bPAYMENT\b|PAYMENT - THANK|POINT REDEMPTION|REWARDS REDEMPTION|BALANCE TRANSFER|AUTOPAY|PRE-?AUTH(ORIZED)? PAYMENT/i, def: { category: "Payments & Settlements", subcategory: "Card Payment", description: "Card balance payment / rewards redemption (not an expense)" } },
  { pattern: /\bDTOPS\b|SINGLE CROSSING|BORDER|CBSA|CUSTOMS/i, def: { category: "Tolls & Border", subcategory: "Border Crossing", description: "Border crossing / customs decal (DTOPS)" } },
  { pattern: /CAT SCALE|SCALE/i, def: { category: "Scales & Wash", subcategory: "Truck Scale", description: "Truck weigh scale" } },
  { pattern: /OSOW|OS\/?OW|PERMIT|TRUCKPER|MOTOR CARRIER|OVERSIZE|OVERWEIGHT|DOT |DEPT OF TRANS|TRANSPORTATION/i, def: { category: "Permits & Compliance", subcategory: "Oversize/Overweight Permit", description: "Oversize/overweight or motor-carrier permit" } },
  { pattern: /LOVE'?S|PILOT|FLYING J|TA TRAVEL|PETRO|TOOT'?N TOTUM|COFFEE CUP|KWIK|CIRCLE K|HUSKY|ESSO|SHELL|CHEVRON|PETRO-?CANADA/i, def: { category: "Fuel", subcategory: "Truck Stop", description: "Truck stop / fuel" } },
];

const DEFAULT: CategoryDef = { category: "Other", description: "Uncategorized" };

/** Resolve an MCC + merchant name to a category definition (deterministic). */
export function classify(mcc: string | undefined, merchant: string | undefined): CategoryDef {
  const m = (merchant || "").trim();
  // Merchant overrides win for the trucking-specific ambiguous merchants.
  for (const o of MERCHANT_OVERRIDES) {
    if (o.pattern.test(m)) return o.def;
  }
  const code = (mcc || "").trim();
  if (code && MCC_MAP[code]) return MCC_MAP[code];

  // Range-based fallback for unseen MCCs.
  const n = parseInt(code, 10);
  if (!isNaN(n)) {
    if (n >= 3000 && n <= 3350) return { category: "Air Travel", subcategory: "Airline", description: "Airline (carrier-specific MCC)" };
    if (n >= 3351 && n <= 3500) return { category: "Ground Transport", subcategory: "Car Rental", description: "Car rental (agency-specific MCC)" };
    if (n >= 3501 && n <= 3999) return { category: "Lodging", subcategory: "Hotel", description: "Lodging (chain-specific MCC)" };
    if (n >= 5811 && n <= 5814) return { category: "Meals", description: "Food service" };
  }
  return DEFAULT;
}

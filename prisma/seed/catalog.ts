// Synthetic demo data. Domains use .example, phone numbers are fake, tariffs are illustrative.
// Nothing here describes a real business.

export type ServiceTypeName = "STAY" | "TAXI" | "GUIDE" | "TOUR" | "OTHER";

type PropertySeed = {
  slug: string;
  name: string;
  type: ServiceTypeName;
  district: string;
  verified: boolean;
  domain?: string;
  lat: number;
  lng: number;
  tags?: string[];
};

// [slug, name, type, district, verified, lat, lng]
const P = (
  slug: string,
  name: string,
  type: ServiceTypeName,
  district: string,
  verified: boolean,
  lat: number,
  lng: number,
  domain?: string,
  tags: string[] = [],
): PropertySeed => ({ slug, name, type, district, verified, lat, lng, domain, tags });

export const properties: PropertySeed[] = [
  // Stays
  P("shillong-hills-homestay", "Shillong Hills Homestay", "STAY", "east-khasi-hills", true, 25.5712, 91.8801, "shillonghills-homestay.example", ["homestay", "family run"]),
  P("sampleridge-stay", "Sample Ridge Stay", "STAY", "east-khasi-hills", true, 25.5648, 91.8975, "sampleridge-stay.example", ["homestay"]),
  P("kaziranga-jungle-lodge", "Kaziranga Jungle Lodge", "STAY", "golaghat", true, 26.5712, 93.1633, "kaziranga-junglelodge.example", ["lodge", "safari"]),
  P("jorhat-heritage-stay", "Jorhat Heritage Stay", "STAY", "jorhat", true, 26.7482, 94.2105, "jorhat-heritagestay.example", ["heritage"]),
  P("garo-hills-camps", "Garo Hills Camps", "STAY", "west-garo-hills", false, 25.5068, 90.2231, undefined, ["camp"]),
  P("umiam-lake-view-resort", "Umiam Lake View Resort", "STAY", "ri-bhoi", true, 25.6621, 91.8842, "umiam-lakeview.example", ["resort", "lake"]),
  P("cherrapunji-cloud-homestay", "Cherrapunji Cloud Homestay", "STAY", "east-khasi-hills", true, 25.2735, 91.7301, "cherra-cloudstay.example", ["homestay"]),
  P("mawlynnong-village-stay", "Mawlynnong Village Stay", "STAY", "east-khasi-hills", false, 25.2022, 91.9139, undefined, ["village"]),
  P("dawki-riverside-camp", "Dawki Riverside Camp", "STAY", "west-jaintia-hills", false, 25.1859, 92.0201, undefined, ["camp", "river"]),
  P("majuli-mishing-homestay", "Majuli Mishing Homestay", "STAY", "majuli", true, 26.9402, 94.1708, "majuli-mishingstay.example", ["homestay", "culture"]),
  P("guwahati-brahmaputra-inn", "Brahmaputra Inn Guwahati", "STAY", "kamrup-metro", true, 26.1832, 91.7501, "brahmaputra-inn.example", ["hotel"]),
  P("dibrugarh-tea-estate-bungalow", "Dibrugarh Tea Estate Bungalow", "STAY", "dibrugarh", false, 27.4702, 94.9188, undefined, ["tea estate"]),
  P("tezpur-orchid-lodge", "Tezpur Orchid Lodge", "STAY", "sonitpur", false, 26.6491, 92.7864, undefined, ["lodge"]),
  P("silchar-barak-residency", "Barak Residency Silchar", "STAY", "cachar", false, 24.8271, 92.7992, undefined, ["hotel"]),
  P("nongpoh-pine-retreat", "Nongpoh Pine Retreat", "STAY", "ri-bhoi", false, 25.9031, 91.8795, undefined, ["retreat"]),
  P("jowai-hilltop-guesthouse", "Jowai Hilltop Guesthouse", "STAY", "west-jaintia-hills", true, 25.4452, 92.2051, "jowai-hilltop.example", ["guesthouse"]),
  // Taxis
  P("airport-taxi-union", "Airport Taxi Union", "TAXI", "kamrup-metro", false, 26.1071, 91.5871),
  P("tura-taxi-stand", "Tura Taxi Stand", "TAXI", "west-garo-hills", false, 25.5151, 90.2012),
  P("shillong-police-bazar-taxi-stand", "Police Bazar Taxi Stand", "TAXI", "east-khasi-hills", true, 25.5779, 91.8829, "shillong-taxiunion.example"),
  P("guwahati-railway-prepaid-taxi", "Guwahati Railway Prepaid Taxi", "TAXI", "kamrup-metro", true, 26.1825, 91.7509, "ghy-prepaidtaxi.example", ["prepaid"]),
  P("jorhat-airport-cab-service", "Jorhat Airport Cab Service", "TAXI", "jorhat", false, 26.7322, 94.1761),
  P("kohora-safari-cab-union", "Kohora Safari Cab Union", "TAXI", "golaghat", true, 26.5781, 93.1722, "kohora-cabunion.example"),
  P("umroi-airport-taxi-association", "Umroi Airport Taxi Association", "TAXI", "ri-bhoi", true, 25.7031, 91.9771, "umroi-taxi.example"),
  P("dibrugarh-city-cabs", "Dibrugarh City Cabs", "TAXI", "dibrugarh", false, 27.4831, 94.9091),
  // Guides
  P("cherrapunji-guides", "Cherrapunji Guides", "GUIDE", "east-khasi-hills", true, 25.2711, 91.7338, "cherrapunji-guides.example"),
  P("kaziranga-naturalist-guides", "Kaziranga Naturalist Guides", "GUIDE", "golaghat", true, 26.5761, 93.1688, "kaziranga-naturalists.example"),
  P("mawlynnong-trek-guides", "Mawlynnong Trek Guides", "GUIDE", "east-khasi-hills", false, 25.2031, 91.9144),
  P("living-root-bridge-guides", "Living Root Bridge Guides", "GUIDE", "east-khasi-hills", true, 25.2531, 91.7002, "rootbridge-guides.example"),
  P("majuli-culture-guides", "Majuli Culture Guides", "GUIDE", "majuli", false, 26.9441, 94.1692),
  P("garo-hills-trail-guides", "Garo Hills Trail Guides", "GUIDE", "west-garo-hills", false, 25.5101, 90.2102),
  // Tours
  P("majuli-island-tours", "Majuli Island Tours", "TOUR", "majuli", false, 26.9522, 94.1631),
  P("dawki-river-boats", "Dawki River Boats", "TOUR", "west-jaintia-hills", true, 25.1841, 92.0229, "dawki-riverboats.example", ["boat"]),
  P("meghalaya-circuit-tours", "Meghalaya Circuit Tours", "TOUR", "east-khasi-hills", true, 25.5801, 91.8921, "meghalaya-circuit.example", ["package"]),
  P("kaziranga-safari-packages", "Kaziranga Safari Packages", "TOUR", "golaghat", true, 26.5771, 93.1701, "kaziranga-safaripackages.example", ["safari"]),
  P("brahmaputra-cruise-co", "Brahmaputra Cruise Co", "TOUR", "kamrup-metro", false, 26.1881, 91.7461, undefined, ["cruise"]),
  P("northeast-heritage-trails", "Northeast Heritage Trails", "TOUR", "jorhat", false, 26.7531, 94.2011, undefined, ["heritage"]),
];

type TariffSeed = {
  service: ServiceTypeName;
  origin?: string; // place slug
  destination?: string; // place slug
  district?: string;
  vehicle?: string;
  qualifier?: string;
  unit?: string;
  low: number;
  high: number;
  km?: number;
  min?: number;
  via?: string;
  night?: number;
  board?: string;
};

export const tariffs: TariffSeed[] = [
  // Taxi: Guwahati to Shillong
  { service: "TAXI", origin: "guwahati-airport", destination: "shillong-police-bazar", vehicle: "SEDAN", low: 2200, high: 3000, km: 98, min: 165, via: "NH 6", night: 20, board: "guwahati-airport-prepaid" },
  { service: "TAXI", origin: "guwahati-airport", destination: "shillong-police-bazar", vehicle: "SUV", low: 3200, high: 4200, km: 98, min: 165, via: "NH 6", night: 20, board: "guwahati-airport-prepaid" },
  { service: "TAXI", origin: "guwahati-airport", destination: "shillong-police-bazar", vehicle: "HATCHBACK", low: 1900, high: 2600, km: 98, min: 165, via: "NH 6", night: 20 },
  { service: "TAXI", origin: "guwahati-airport", destination: "shillong-police-bazar", vehicle: "SHARED", unit: "PER_PERSON", low: 400, high: 700, km: 98, min: 180, via: "NH 6" },
  { service: "TAXI", origin: "guwahati-railway-station", destination: "shillong-police-bazar", vehicle: "SEDAN", low: 2200, high: 3000, km: 100, min: 170, via: "NH 6", night: 20 },
  { service: "TAXI", origin: "guwahati-railway-station", destination: "shillong-police-bazar", vehicle: "SUV", low: 3200, high: 4200, km: 100, min: 170, via: "NH 6", night: 20 },
  { service: "TAXI", origin: "guwahati-airport", destination: "guwahati-railway-station", vehicle: "SEDAN", low: 500, high: 800, km: 22, min: 45, via: "Airport Road", board: "guwahati-airport-prepaid" },
  { service: "TAXI", origin: "guwahati-airport", destination: "guwahati-railway-station", vehicle: "SUV", low: 800, high: 1200, km: 22, min: 45, via: "Airport Road", board: "guwahati-airport-prepaid" },
  { service: "TAXI", origin: "guwahati-airport", destination: "kaziranga-kohora", vehicle: "SEDAN", low: 5200, high: 6800, km: 215, min: 300, via: "NH 27 and NH 715", night: 25 },
  { service: "TAXI", origin: "guwahati-airport", destination: "kaziranga-kohora", vehicle: "SUV", low: 6800, high: 8800, km: 215, min: 300, via: "NH 27 and NH 715", night: 25 },
  // Taxi: around Shillong
  { service: "TAXI", origin: "shillong-police-bazar", destination: "cherrapunji", vehicle: "SEDAN", low: 1800, high: 2600, km: 54, min: 100, via: "Shillong-Sohra road", board: "shillong-taxi-stand" },
  { service: "TAXI", origin: "shillong-police-bazar", destination: "dawki", vehicle: "SEDAN", low: 2800, high: 3600, km: 82, min: 150, via: "NH 6", board: "shillong-taxi-stand" },
  { service: "TAXI", origin: "shillong-police-bazar", destination: "mawlynnong", vehicle: "SEDAN", low: 3200, high: 4200, km: 90, min: 165, via: "Pynursla road", board: "shillong-taxi-stand" },
  { service: "TAXI", origin: "shillong-police-bazar", destination: "umiam-lake", vehicle: "SEDAN", low: 700, high: 1000, km: 16, min: 35, via: "NH 6", board: "shillong-taxi-stand" },
  { service: "TAXI", origin: "shillong-police-bazar", destination: "elephant-falls", vehicle: "SEDAN", low: 500, high: 800, km: 8, min: 25, board: "shillong-taxi-stand" },
  { service: "TAXI", origin: "shillong-airport", destination: "shillong-police-bazar", vehicle: "SEDAN", low: 800, high: 1200, km: 35, min: 60, via: "NH 6" },
  // Taxi: Jorhat
  { service: "TAXI", origin: "jorhat-airport", destination: "jorhat-town", vehicle: "SEDAN", low: 400, high: 700, km: 8, min: 20 },
  { service: "TAXI", origin: "dibrugarh-airport", destination: "tezpur-town", vehicle: "SEDAN", low: 7500, high: 9800, km: 330, min: 360, via: "NH 15", night: 25 },
  // Stays (per night)
  { service: "STAY", district: "east-khasi-hills", qualifier: "Standard room", unit: "PER_NIGHT", low: 2200, high: 3400 },
  { service: "STAY", district: "east-khasi-hills", qualifier: "Budget homestay", unit: "PER_NIGHT", low: 1200, high: 2200 },
  { service: "STAY", district: "golaghat", qualifier: "Standard room", unit: "PER_NIGHT", low: 3500, high: 6000 },
  { service: "STAY", district: "majuli", qualifier: "Homestay", unit: "PER_NIGHT", low: 1000, high: 1800 },
  { service: "STAY", district: "kamrup-metro", qualifier: "Standard room", unit: "PER_NIGHT", low: 2000, high: 3800 },
  // Guides
  { service: "GUIDE", district: "east-khasi-hills", qualifier: "Half day", unit: "PER_DAY", low: 1200, high: 2000 },
  { service: "GUIDE", district: "golaghat", qualifier: "Safari day", unit: "PER_DAY", low: 1500, high: 2500 },
  // Tours (per person)
  { service: "TOUR", district: "east-khasi-hills", qualifier: "Meghalaya 3N/4D", unit: "PER_PERSON", low: 14000, high: 22000 },
  { service: "TOUR", district: "golaghat", qualifier: "Kaziranga 2N/3D", unit: "PER_PERSON", low: 9000, high: 14000 },
  { service: "TOUR", district: "majuli", qualifier: "Majuli 2N/3D", unit: "PER_PERSON", low: 6000, high: 9500 },
];
// Jorhat to Majuli is intentionally absent: the demo shows a "No reference" price result.

export const tariffBoards = [
  { key: "shillong-taxi-stand", name: "Shillong taxi stand tariff board", district: "east-khasi-hills", place: "shillong-police-bazar", lat: 25.5781, lng: 91.8826, notes: "Posted fare list at the Police Bazar stand." },
  { key: "guwahati-airport-prepaid", name: "Guwahati airport prepaid counter", district: "kamrup-metro", place: "guwahati-airport", lat: 26.1065, lng: 91.5866, notes: "Prepaid counter fare list in the arrivals hall." },
  { key: "cherrapunji-taxi-stand", name: "Cherrapunji taxi stand board", district: "east-khasi-hills", place: "cherrapunji", lat: 25.2712, lng: 91.7329, notes: "Local sightseeing fare board." },
] as const;

export const plans = [
  {
    tier: "FREE" as const,
    name: "Free",
    priceInr: 0,
    investigationsPerMonth: 5,
    voiceMinutesPerMonth: 15,
    evidenceStorageMb: 50,
    features: ["5 investigations a month", "Community reports", "Read aloud in 3 languages"],
    sortOrder: 0,
  },
  {
    tier: "TRAVELLER" as const,
    name: "Traveller",
    priceInr: 199,
    investigationsPerMonth: 50,
    voiceMinutesPerMonth: 60,
    evidenceStorageMb: 500,
    features: ["50 investigations a month", "Evidence vault and export", "Priority live runs"],
    sortOrder: 1,
  },
  {
    tier: "GROUP" as const,
    name: "Group",
    priceInr: 599,
    investigationsPerMonth: null,
    voiceMinutesPerMonth: 300,
    evidenceStorageMb: 2000,
    features: ["Unlimited investigations", "Shared trips", "Moderator tools"],
    sortOrder: 2,
  },
];

export const emergencyContacts = [
  { label: "National cybercrime helpline", value: "1930", kind: "PHONE", description: "Call as soon as you notice a fraudulent payment.", sortOrder: 0 },
  { label: "Cybercrime reporting portal", value: "https://cybercrime.gov.in", kind: "URL", description: "File an official complaint online.", sortOrder: 1 },
];

export const helpArticles = [
  { slug: "getting-started", category: "GUIDE", title: "Getting started", summary: "Run your first check in a minute.", body: "Paste a link, a business name or a message into Investigate. The agent searches public sources, captures the page and compares known data, then shows a verdict with its sources.", sortOrder: 0 },
  { slug: "how-verdicts-work", category: "GUIDE", title: "How verdicts work", summary: "Signals, sources and confidence.", body: "A verdict is a signal backed by sources, not a legal finding. Each reason links to the source it came from and the time it was retrieved. Inconclusive is a valid result when public sources are thin.", sortOrder: 1 },
  { slug: "if-you-were-scammed", category: "GUIDE", title: "If you were scammed", summary: "Call 1930, cybercrime.gov.in.", body: "Call the national cybercrime helpline 1930 as soon as possible and report at cybercrime.gov.in. Keep screenshots, payment receipts and chat history. This app does not replace an official complaint.", sortOrder: 2 },
  { slug: "faq-verdict-decided", category: "FAQ", title: "How is a verdict decided?", summary: null, body: "The agent gathers public pages, matches the seller against the directory and past reports, compares the quote with a tariff range, and writes a typed verdict. Every claim cites a source.", sortOrder: 10 },
  { slug: "faq-evidence", category: "FAQ", title: "What counts as evidence?", summary: null, body: "Timestamped screenshots captured by the agent, text extracts, files you upload and voice notes. Each item keeps its URL and capture time.", sortOrder: 11 },
  { slug: "faq-assamese", category: "FAQ", title: "Can I report in Assamese?", summary: null, body: "Yes. Speak or type in Assamese, Hindi or English. Voice is transcribed and translated, and you can edit the transcript before submitting.", sortOrder: 12 },
  { slug: "faq-payment", category: "FAQ", title: "Is a payment ever made for me?", summary: null, body: "No. The app never pays, submits forms or contacts a business. The browser only reads public pages.", sortOrder: 13 },
  { slug: "faq-authorities", category: "FAQ", title: "How do I reach the authorities?", summary: null, body: "Call 1930, the national cybercrime helpline, or use cybercrime.gov.in.", sortOrder: 14 },
];

export const advisories = [
  { title: "Fake booking pages near Shillong", kind: "ADVISORY", label: "Demo advisory", district: "east-khasi-hills", publishedAt: "2026-10-08T09:00:00+05:30", pinned: true },
  { title: "Airport taxi tariff sheet updated", kind: "TARIFF", label: "Demo tariff", district: "kamrup-metro", publishedAt: "2026-10-07T09:00:00+05:30", pinned: false },
  { title: "Report official fraud at cybercrime.gov.in", kind: "HELPLINE", label: "Helpline 1930", district: null, publishedAt: "2026-10-01T09:00:00+05:30", pinned: false },
];

export const knowledgeSources = [
  { name: "Demo tourism directory", host: "tourism-board.example", type: "DIRECTORY", via: "FIRECRAWL" as const, status: "INDEXED" as const, recordCount: 1240, recordUnit: "records", crawlUrl: "https://tourism-board.example/directory", lastSyncedAt: "2026-10-10T06:00:00+05:30" },
  { name: "Taxi tariff sheets", host: "tariffs.example", type: "TARIFF", via: "UPLOAD" as const, status: "INDEXED" as const, recordCount: 86, recordUnit: "routes", crawlUrl: null, lastSyncedAt: "2026-10-07T06:00:00+05:30" },
  { name: "Past community reports", host: "Internal", type: "REPORT", via: "INTERNAL" as const, status: "INDEXED" as const, recordCount: 38, recordUnit: "records", crawlUrl: null, lastSyncedAt: null, isLive: true },
  { name: "Advisories", host: "advisories.example", type: "ADVISORY", via: "FIRECRAWL" as const, status: "SYNCING" as const, recordCount: 14, recordUnit: "pages", crawlUrl: "https://advisories.example", lastSyncedAt: "2026-10-09T06:00:00+05:30" },
];

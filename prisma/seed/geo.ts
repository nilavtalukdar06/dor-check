// Districts and places. Coordinates are approximate and for demo maps only.

export const districts = [
  // Assam
  { slug: "kamrup-metro", name: "Kamrup Metro", stateCode: "AS", lat: 26.1445, lng: 91.7362, aliases: ["Guwahati"] },
  { slug: "kamrup", name: "Kamrup", stateCode: "AS", lat: 26.2, lng: 91.4, aliases: ["Rangia"] },
  { slug: "golaghat", name: "Golaghat", stateCode: "AS", lat: 26.5236, lng: 93.9631, aliases: ["Kaziranga"] },
  { slug: "jorhat", name: "Jorhat", stateCode: "AS", lat: 26.7509, lng: 94.2037, aliases: [] },
  { slug: "majuli", name: "Majuli", stateCode: "AS", lat: 26.95, lng: 94.1667, aliases: ["Majuli Island"] },
  { slug: "dibrugarh", name: "Dibrugarh", stateCode: "AS", lat: 27.4728, lng: 94.912, aliases: [] },
  { slug: "sivasagar", name: "Sivasagar", stateCode: "AS", lat: 26.9826, lng: 94.6425, aliases: ["Sibsagar"] },
  { slug: "tinsukia", name: "Tinsukia", stateCode: "AS", lat: 27.4922, lng: 95.3597, aliases: [] },
  { slug: "sonitpur", name: "Sonitpur", stateCode: "AS", lat: 26.633, lng: 92.8, aliases: ["Tezpur"] },
  { slug: "nagaon", name: "Nagaon", stateCode: "AS", lat: 26.35, lng: 92.6833, aliases: [] },
  { slug: "cachar", name: "Cachar", stateCode: "AS", lat: 24.8333, lng: 92.7789, aliases: ["Silchar"] },
  { slug: "karbi-anglong", name: "Karbi Anglong", stateCode: "AS", lat: 25.9, lng: 93.4, aliases: ["Diphu"] },
  { slug: "dima-hasao", name: "Dima Hasao", stateCode: "AS", lat: 25.17, lng: 93.02, aliases: ["Haflong"] },
  { slug: "kokrajhar", name: "Kokrajhar", stateCode: "AS", lat: 26.4, lng: 90.27, aliases: [] },
  // Meghalaya
  { slug: "east-khasi-hills", name: "East Khasi Hills", stateCode: "ML", lat: 25.5788, lng: 91.8933, aliases: ["Shillong", "Sohra", "Cherrapunji"] },
  { slug: "west-khasi-hills", name: "West Khasi Hills", stateCode: "ML", lat: 25.55, lng: 91.27, aliases: ["Nongstoin"] },
  { slug: "south-west-khasi-hills", name: "South West Khasi Hills", stateCode: "ML", lat: 25.37, lng: 91.1, aliases: ["Mawkyrwat"] },
  { slug: "ri-bhoi", name: "Ri Bhoi", stateCode: "ML", lat: 25.9, lng: 91.88, aliases: ["Nongpoh", "Umiam"] },
  { slug: "west-jaintia-hills", name: "West Jaintia Hills", stateCode: "ML", lat: 25.45, lng: 92.2, aliases: ["Jowai", "Dawki"] },
  { slug: "east-jaintia-hills", name: "East Jaintia Hills", stateCode: "ML", lat: 25.3, lng: 92.4, aliases: ["Khliehriat"] },
  { slug: "west-garo-hills", name: "West Garo Hills", stateCode: "ML", lat: 25.5142, lng: 90.2024, aliases: ["Tura"] },
  { slug: "east-garo-hills", name: "East Garo Hills", stateCode: "ML", lat: 25.6, lng: 90.6, aliases: ["Williamnagar"] },
  { slug: "south-garo-hills", name: "South Garo Hills", stateCode: "ML", lat: 25.2, lng: 90.6, aliases: ["Baghmara"] },
  { slug: "north-garo-hills", name: "North Garo Hills", stateCode: "ML", lat: 25.85, lng: 90.6, aliases: ["Resubelpara"] },
  { slug: "south-west-garo-hills", name: "South West Garo Hills", stateCode: "ML", lat: 25.4, lng: 89.95, aliases: ["Ampati"] },
  { slug: "eastern-west-khasi-hills", name: "Eastern West Khasi Hills", stateCode: "ML", lat: 25.55, lng: 91.6, aliases: ["Mairang"] },
] as const;

type PlaceSeed = {
  slug: string;
  name: string;
  kind: string;
  district: string;
  lat: number;
  lng: number;
  aliases?: string[];
};

export const places: PlaceSeed[] = [
  { slug: "guwahati-airport", name: "Guwahati airport", kind: "AIRPORT", district: "kamrup-metro", lat: 26.1061, lng: 91.5859, aliases: ["LGBI airport", "Borjhar airport"] },
  { slug: "guwahati-railway-station", name: "Guwahati railway station", kind: "RAILWAY", district: "kamrup-metro", lat: 26.1822, lng: 91.7512, aliases: ["Paltan Bazar", "GHY station"] },
  { slug: "shillong-police-bazar", name: "Shillong, Police Bazar", kind: "LOCALITY", district: "east-khasi-hills", lat: 25.5776, lng: 91.8832, aliases: ["Shillong", "Police Bazar"] },
  { slug: "shillong-airport", name: "Shillong airport", kind: "AIRPORT", district: "ri-bhoi", lat: 25.7036, lng: 91.9786, aliases: ["Umroi airport"] },
  { slug: "cherrapunji", name: "Cherrapunji", kind: "SIGHT", district: "east-khasi-hills", lat: 25.2702, lng: 91.7324, aliases: ["Sohra"] },
  { slug: "mawlynnong", name: "Mawlynnong", kind: "SIGHT", district: "east-khasi-hills", lat: 25.2018, lng: 91.9157, aliases: [] },
  { slug: "dawki", name: "Dawki", kind: "SIGHT", district: "west-jaintia-hills", lat: 25.1833, lng: 92.0233, aliases: ["Dawki river"] },
  { slug: "umiam-lake", name: "Umiam Lake", kind: "SIGHT", district: "ri-bhoi", lat: 25.6541, lng: 91.889, aliases: ["Barapani"] },
  { slug: "elephant-falls", name: "Elephant Falls", kind: "SIGHT", district: "east-khasi-hills", lat: 25.5444, lng: 91.819, aliases: [] },
  { slug: "kaziranga-kohora", name: "Kaziranga, Kohora", kind: "SIGHT", district: "golaghat", lat: 26.5775, lng: 93.1711, aliases: ["Kaziranga National Park", "Kohora"] },
  { slug: "jorhat-airport", name: "Jorhat airport", kind: "AIRPORT", district: "jorhat", lat: 26.7315, lng: 94.1755, aliases: ["Rowriah airport"] },
  { slug: "jorhat-town", name: "Jorhat town", kind: "CITY", district: "jorhat", lat: 26.7509, lng: 94.2037, aliases: ["Jorhat"] },
  { slug: "majuli-nimati-ghat", name: "Majuli, Nimati Ghat", kind: "LOCALITY", district: "majuli", lat: 26.8883, lng: 94.216, aliases: ["Majuli", "Nimati"] },
  { slug: "tura-town", name: "Tura", kind: "CITY", district: "west-garo-hills", lat: 25.5142, lng: 90.2024, aliases: ["Tura town"] },
  { slug: "dibrugarh-airport", name: "Dibrugarh airport", kind: "AIRPORT", district: "dibrugarh", lat: 27.4839, lng: 95.0169, aliases: ["Mohanbari airport"] },
  { slug: "tezpur-town", name: "Tezpur", kind: "CITY", district: "sonitpur", lat: 26.6528, lng: 92.7926, aliases: [] },
];

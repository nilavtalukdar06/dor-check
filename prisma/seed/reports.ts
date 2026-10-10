import type { ServiceTypeName } from "./catalog";

type Status = "NEW" | "UNDER_REVIEW" | "VERIFIED" | "RESOLVED" | "CLOSED" | "REJECTED";
type Level = "LOW" | "MEDIUM" | "HIGH";
type Kind = "SCAM" | "FARE_DISPUTE" | "OTHER";

export type ReportSeed = {
  reference: string;
  kind: Kind;
  category: ServiceTypeName;
  summary: string;
  description: string;
  district: string;
  place?: string;
  lat: number;
  lng: number;
  incidentAt: string;
  status: Status;
  priority: Level;
  amountInr?: number;
  reportedUrl?: string;
  upi?: string;
  property?: string;
  matches: number;
  submittedAt: string;
  /** When review started / the report was resolved. */
  reviewAt?: string;
  closedAt?: string;
  assignedToModerator?: boolean;
  anonymous?: boolean;
  similarTo?: { reference: string; reason: string }[];
};

// Reporters are anonymous demo submissions (no user rows), names are never stored.
export const reports: ReportSeed[] = [
  {
    reference: "TTD-7K2M9Q", kind: "SCAM", category: "STAY", district: "east-khasi-hills", place: "Shillong",
    lat: 25.5731, lng: 91.8811, incidentAt: "2026-10-08T17:30:00+05:30", status: "UNDER_REVIEW", priority: "HIGH",
    summary: "Asked for advance payment to a personal UPI ID",
    description: "Shared a booking link on WhatsApp and asked for an advance payment to a personal UPI ID. The page disappeared after I asked for a receipt.",
    reportedUrl: "https://demohills-homestay-booking.example/shillong", upi: "rajesh.demo@okfakebank",
    matches: 2, submittedAt: "2026-10-08T19:12:00+05:30", reviewAt: "2026-10-09T10:05:00+05:30", assignedToModerator: true,
    similarTo: [{ reference: "TTD-5F2K8W", reason: "same_domain" }, { reference: "TTD-9C5X7M", reason: "same_upi" }],
  },
  {
    reference: "TTD-4P8X1D", kind: "FARE_DISPUTE", category: "TAXI", district: "kamrup-metro", place: "Guwahati airport",
    lat: 26.1068, lng: 91.5862, incidentAt: "2026-10-07T21:10:00+05:30", status: "VERIFIED", priority: "MEDIUM", amountInr: 5600,
    summary: "Taxi demanded double the tariff at the airport",
    description: "The driver outside arrivals asked Rs 5,600 for a sedan to Shillong and refused the prepaid counter.",
    matches: 1, submittedAt: "2026-10-07T21:40:00+05:30", reviewAt: "2026-10-08T09:30:00+05:30", closedAt: "2026-10-08T15:00:00+05:30", assignedToModerator: true,
  },
  {
    reference: "TTD-9L3C5A", kind: "SCAM", category: "TOUR", district: "jorhat", place: "Jorhat",
    lat: 26.7499, lng: 94.2051, incidentAt: "2026-10-05T11:00:00+05:30", status: "NEW", priority: "MEDIUM", amountInr: 18000,
    summary: "Tour package page vanished after payment",
    description: "Paid an advance for a heritage tour package. The website and the phone number stopped working the next day.",
    reportedUrl: "https://heritage-tour-offers.example/pack", matches: 0, submittedAt: "2026-10-05T16:20:00+05:30",
  },
  {
    reference: "TTD-2H6V0B", kind: "OTHER", category: "GUIDE", district: "west-garo-hills", place: "Tura",
    lat: 25.5139, lng: 90.2031, incidentAt: "2026-10-04T10:00:00+05:30", status: "CLOSED", priority: "LOW", amountInr: 800,
    summary: "Guide charged for an undisclosed entry fee",
    description: "The guide added an entry fee at the end of the trip that was not mentioned when the rate was agreed.",
    matches: 0, submittedAt: "2026-10-04T18:05:00+05:30", reviewAt: "2026-10-05T09:00:00+05:30", closedAt: "2026-10-06T12:00:00+05:30", assignedToModerator: true,
  },
  {
    reference: "TTD-1R5T7E", kind: "OTHER", category: "STAY", district: "east-khasi-hills", place: "Shillong",
    lat: 25.5758, lng: 91.8869, incidentAt: "2026-10-09T14:00:00+05:30", status: "UNDER_REVIEW", priority: "LOW", amountInr: 3200,
    summary: "Hotel refused agreed rate",
    description: "At check-in the front desk refused the rate quoted on the phone and asked for a higher price.",
    matches: 1, submittedAt: "2026-10-09T15:10:00+05:30", reviewAt: "2026-10-10T08:40:00+05:30", assignedToModerator: true,
  },
  {
    reference: "TTD-6Y2N8K", kind: "FARE_DISPUTE", category: "TAXI", district: "east-khasi-hills", place: "Shillong",
    lat: 25.5799, lng: 91.8843, incidentAt: "2026-10-09T22:30:00+05:30", status: "UNDER_REVIEW", priority: "MEDIUM", amountInr: 900,
    summary: "Taxi extra charge at night",
    description: "Driver asked for an extra night charge that was not on the posted tariff board.",
    matches: 3, submittedAt: "2026-10-09T23:05:00+05:30", reviewAt: "2026-10-10T09:15:00+05:30", assignedToModerator: true,
  },
  {
    reference: "TTD-5F2K8W", kind: "SCAM", category: "STAY", district: "east-khasi-hills", place: "Shillong",
    lat: 25.5702, lng: 91.8788, incidentAt: "2026-10-08T12:00:00+05:30", status: "NEW", priority: "HIGH",
    summary: "Fake booking page",
    description: "A booking page copied the look of a homestay site and asked for a deposit by UPI.",
    reportedUrl: "https://demohills-homestay-booking.example/book", matches: 1, submittedAt: "2026-10-08T13:45:00+05:30",
    similarTo: [{ reference: "TTD-7K2M9Q", reason: "same_domain" }],
  },
  {
    reference: "TTD-8D4J1X", kind: "FARE_DISPUTE", category: "TAXI", district: "kamrup-metro", place: "Guwahati airport",
    lat: 26.1049, lng: 91.5878, incidentAt: "2026-10-06T08:30:00+05:30", status: "RESOLVED", priority: "MEDIUM", amountInr: 4200,
    summary: "Fare dispute at Guwahati airport",
    description: "Driver insisted on a fixed Rs 4,200 for a sedan to the city. The prepaid counter fare was far lower.",
    matches: 2, submittedAt: "2026-10-06T09:20:00+05:30", reviewAt: "2026-10-06T14:00:00+05:30", closedAt: "2026-10-07T10:00:00+05:30", assignedToModerator: true,
  },
  {
    reference: "TTD-6B9R3T", kind: "SCAM", category: "STAY", district: "west-garo-hills", place: "Tura",
    lat: 25.5121, lng: 90.2056, incidentAt: "2026-10-05T09:00:00+05:30", status: "NEW", priority: "MEDIUM", amountInr: 2500,
    summary: "Advance payment scam",
    description: "Asked to send an advance to a personal number for a camp booking. No confirmation was ever sent.",
    upi: "tura.camp.demo@okfakebank", matches: 0, submittedAt: "2026-10-05T10:30:00+05:30",
  },
  {
    reference: "TTD-7H3V5C", kind: "FARE_DISPUTE", category: "TAXI", district: "golaghat", place: "Kohora",
    lat: 26.5779, lng: 93.1699, incidentAt: "2026-10-03T16:00:00+05:30", status: "NEW", priority: "LOW", amountInr: 3000,
    summary: "Overcharged for a Kaziranga transfer",
    description: "Quoted one price on the phone and charged more at the park gate.",
    matches: 0, submittedAt: "2026-10-03T18:00:00+05:30",
  },
  {
    reference: "TTD-4W8N2G", kind: "SCAM", category: "TOUR", district: "majuli", place: "Majuli",
    lat: 26.9461, lng: 94.1683, incidentAt: "2026-09-29T13:00:00+05:30", status: "VERIFIED", priority: "HIGH", amountInr: 12000,
    summary: "Paid for a Majuli ferry package with no booking",
    description: "Paid in advance for a ferry and stay package. The operator had no record of the booking on arrival.",
    reportedUrl: "https://majuli-trips-direct.example", matches: 1, submittedAt: "2026-09-29T17:15:00+05:30", reviewAt: "2026-09-30T10:00:00+05:30", closedAt: "2026-10-02T11:00:00+05:30", assignedToModerator: true,
  },
  {
    reference: "TTD-9C5X7M", kind: "SCAM", category: "STAY", district: "east-khasi-hills", place: "Cherrapunji",
    lat: 25.2689, lng: 91.7298, incidentAt: "2026-09-27T15:00:00+05:30", status: "VERIFIED", priority: "HIGH", amountInr: 4000,
    summary: "Deposit asked on a personal UPI for a Cherrapunji stay",
    description: "A deposit was requested on a personal UPI handle before any booking confirmation.",
    upi: "rajesh.demo@okfakebank", matches: 1, submittedAt: "2026-09-27T18:00:00+05:30", reviewAt: "2026-09-28T09:00:00+05:30", closedAt: "2026-09-30T16:00:00+05:30", assignedToModerator: true,
    similarTo: [{ reference: "TTD-7K2M9Q", reason: "same_upi" }],
  },
  {
    reference: "TTD-2Q6P4Z", kind: "OTHER", category: "GUIDE", district: "east-khasi-hills", place: "Cherrapunji",
    lat: 25.2741, lng: 91.7351, incidentAt: "2026-09-25T09:00:00+05:30", status: "RESOLVED", priority: "LOW", amountInr: 1500,
    summary: "Guide demanded extra after the trek",
    description: "After the trek the guide asked for double the agreed fee.",
    matches: 0, submittedAt: "2026-09-25T17:00:00+05:30", reviewAt: "2026-09-26T10:00:00+05:30", closedAt: "2026-09-27T12:00:00+05:30", assignedToModerator: true,
  },
  {
    reference: "TTD-8T1Y6J", kind: "OTHER", category: "OTHER", district: "dibrugarh", place: "Dibrugarh",
    lat: 27.4745, lng: 94.9102, incidentAt: "2026-09-22T12:00:00+05:30", status: "REJECTED", priority: "LOW",
    summary: "Ticket agent said to be fake",
    description: "A ticket agent at the station seemed fake but there was no payment or loss.",
    matches: 0, submittedAt: "2026-09-22T14:00:00+05:30", reviewAt: "2026-09-23T09:00:00+05:30", closedAt: "2026-09-23T10:00:00+05:30", assignedToModerator: true,
  },
  {
    reference: "TTD-3R9L2V", kind: "OTHER", category: "STAY", district: "kamrup-metro", place: "Guwahati",
    lat: 26.1851, lng: 91.7479, incidentAt: "2026-09-20T11:00:00+05:30", status: "CLOSED", priority: "LOW", amountInr: 600,
    summary: "Resort fee not disclosed at booking",
    description: "A resort fee was added at check-out that the listing did not mention.",
    property: "guwahati-brahmaputra-inn", matches: 0, submittedAt: "2026-09-20T16:00:00+05:30", reviewAt: "2026-09-21T10:00:00+05:30", closedAt: "2026-09-22T10:00:00+05:30", assignedToModerator: true,
  },
];

export const findings = [
  {
    reference: "TTD-7K2M9Q",
    body: "The domain is not in the demo directory. The reporter was advised to use the cybercrime portal and the 1930 helpline.",
    publishedAt: "2026-10-09T10:05:00+05:30",
  },
  {
    reference: "TTD-4P8X1D",
    body: "The fare asked is well above the posted airport range of Rs 2,200 to Rs 3,000 for a sedan. The prepaid counter fare applies.",
    publishedAt: "2026-10-08T15:00:00+05:30",
  },
  {
    reference: "TTD-4W8N2G",
    body: "The operator named in the report has no entry in the demo directory. Travellers should use a registered operator and avoid advance payments to personal accounts.",
    publishedAt: "2026-10-02T11:00:00+05:30",
  },
];

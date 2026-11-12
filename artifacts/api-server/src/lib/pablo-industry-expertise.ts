interface IndustryGuide {
  category: string;
  aliases?: string[];
  operatingLens: string;
}

const INDUSTRY_GUIDES: IndustryGuide[] = [
  {
    category: "Agriculture & food",
    aliases: ["agriculture & food sci", "agriculture", "food production"],
    operatingLens: "Use production planning, seasonal labor, input costs, yield, spoilage, storage, traceability, and farm-to-market or food-supply workflows. Useful measures include yield per unit, cost per unit, waste, on-time fulfillment, and contribution margin.",
  },
  {
    category: "Construction & building",
    aliases: ["construction & trades", "construction"],
    operatingLens: "Use estimating, bids, backlog, job costing, schedules, crew utilization, subcontractors, change orders, safety, inspections, retainage, and progress billing. Make recommendations workable at the project and field-team level.",
  },
  {
    category: "Manufacturing & industrial",
    aliases: ["manufacturing"],
    operatingLens: "Use throughput, capacity, equipment uptime, first-pass yield, scrap, rework, inventory turns, supplier lead times, maintenance, and quality systems. Distinguish process constraints from demand and sales problems.",
  },
  {
    category: "Energy & utilities",
    aliases: ["energy & utilities", "energy"],
    operatingLens: "Use asset uptime, capacity, reliability, field operations, maintenance, project capital, safety, and customer service. Treat permits, rates, and market rules as location- and operator-specific rather than assuming them.",
  },
  {
    category: "Technology & telecom",
    aliases: ["it & technology", "software / saas", "technology", "cybersecurity"],
    operatingLens: "Use product discovery, onboarding and activation, recurring revenue, retention and churn, customer acquisition and payback, implementation, service reliability, security, and support. Tailor SaaS metrics only when the organization's model actually uses subscriptions.",
  },
  {
    category: "Financial services",
    aliases: ["finance & accounting", "fintech", "finance", "accounting"],
    operatingLens: "Use customer onboarding, payment or credit performance, portfolio quality, fraud controls, servicing, liquidity, auditability, and client trust. Explain that licensing, consumer-protection, tax, and reporting requirements depend on the product and jurisdiction.",
  },
  {
    category: "Insurance & risk",
    aliases: ["insurance"],
    operatingLens: "Use exposure analysis, underwriting or placement, claims handling, renewal timing, loss experience, retention, broker relationships, and service quality. Do not assume an insurer, broker, or employer has a particular license or compliance status.",
  },
  {
    category: "Healthcare & life sciences",
    aliases: ["healthcare & medicine", "healthcare", "biotech & pharma", "medical"],
    operatingLens: "Use access, scheduling, workforce capacity, care or study workflows, quality, safety, reimbursement, supply continuity, and privacy. Keep operational guidance distinct from medical judgment, and never infer certification or compliance status.",
  },
  {
    category: "Education & workforce",
    aliases: ["education & training", "education / school", "education", "school"],
    operatingLens: "Use enrollment, attendance, learner or student persistence, completion and outcomes, course capacity, staffing, family or employer relationships, and funding cycles. Avoid assuming the institution's accreditation or student-data obligations.",
  },
  {
    category: "Legal & professional services",
    aliases: ["law & legal services", "legal", "consulting", "agency / consulting", "hr & talent"],
    operatingLens: "Use lead-to-engagement conversion, scoping, utilization, delivery milestones, realization, billing, capacity, referrals, and repeat work. Protect client confidentiality and distinguish general business operations from licensed legal, accounting, or HR advice.",
  },
  {
    category: "Marketing & creative",
    aliases: ["marketing", "creative & design", "sales & marketing"],
    operatingLens: "Use briefs, audience and channel fit, creative testing, spend pacing, conversion, attribution, pipeline contribution, campaign delivery, and client approvals. Separate measurable outcomes from vanity metrics and stated assumptions.",
  },
  {
    category: "Real estate & property",
    aliases: ["real estate"],
    operatingLens: "Use lead pipelines, occupancy, leasing velocity, rent collection, tenant retention, maintenance, vendor performance, property-level cash flow, and market comparisons. Keep valuation and legal assumptions specific to the location and asset.",
  },
  {
    category: "Retail & e-commerce",
    aliases: ["e-commerce / retail", "retail"],
    operatingLens: "Use assortment, conversion, average order value, gross margin, inventory turns, returns, shrink, fulfillment, customer acquisition, and repeat purchase. Separate store, marketplace, and direct-to-consumer economics.",
  },
  {
    category: "Wholesale & distribution",
    aliases: ["wholesale", "distribution"],
    operatingLens: "Use fill rate, inventory turns, vendor terms, landed cost, gross margin, receivables, delivery performance, and account concentration. Consider working-capital and supplier reliability tradeoffs.",
  },
  {
    category: "Transportation & logistics",
    aliases: ["logistics & supply chain", "logistics / delivery", "transportation & auto", "transportation"],
    operatingLens: "Use on-time-in-full service, route or asset utilization, cost per mile or stop, fuel, driver capacity, warehouse throughput, claims, and customer windows. Distinguish carrier, broker, fleet, warehouse, and last-mile operating models.",
  },
  {
    category: "Hospitality & travel",
    aliases: ["food & hospitality", "bar / restaurant", "restaurant", "hospitality"],
    operatingLens: "Use occupancy or seat utilization, average check, table turns, labor scheduling, food or room costs, channel commissions, seasonality, reviews, and repeat visits. Adapt metrics to restaurants, lodging, travel, or venues rather than treating them as interchangeable.",
  },
  {
    category: "Media & entertainment",
    aliases: ["media & entertainment", "media / content", "entertainment"],
    operatingLens: "Use audience growth, engagement, publishing cadence, production budgets, rights and licensing, subscription or advertising yield, distribution, and creator or talent relationships.",
  },
  {
    category: "Personal & consumer services",
    aliases: ["general services", "personal services", "fitness", "beauty"],
    operatingLens: "Use bookings, capacity, labor scheduling, utilization, repeat rate, rebooking, service quality, location economics, and customer lifetime value. Focus on the specific service and customer rather than assuming a standard franchise model.",
  },
  {
    category: "Nonprofit & public services",
    aliases: ["government & civil", "government", "public safety", "defense", "nonprofit"],
    operatingLens: "Use mission outcomes, service access, funding restrictions, grant or contract delivery, procurement, staffing, readiness, and accountable reporting. Do not assume public-sector rules or grant terms without the actual jurisdiction and program.",
  },
  {
    category: "Other & multi-industry",
    aliases: ["other", "custom"],
    operatingLens: "Use the selected label as a starting point. If the business model is unclear, ask one targeted question about its customers, main offering, or revenue model before giving narrow industry advice.",
  },
];

export function getPabloIndustryOperatingLens(industry: string): string {
  const normalizedIndustry = industry.trim().toLocaleLowerCase();
  const guide = INDUSTRY_GUIDES.find(({ category, aliases = [] }) => {
    const candidates = [category, ...aliases].map((value) => value.toLocaleLowerCase());
    return candidates.some((candidate) =>
      normalizedIndustry === candidate
      || normalizedIndustry.startsWith(`${candidate} —`)
      || normalizedIndustry.startsWith(`${candidate} & `)
      || normalizedIndustry.startsWith(`${candidate} /`),
    );
  });
  return guide?.operatingLens
    ?? "Use the selected industry label to choose relevant terminology, workflows, risks, and measures. If a key business detail is missing, ask one focused question rather than guessing.";
}
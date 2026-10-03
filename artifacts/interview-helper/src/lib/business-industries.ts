export interface BusinessIndustryOption {
  value: string;
  label: string;
  description: string;
}

export interface BusinessIndustryGroup {
  label: string;
  options: BusinessIndustryOption[];
}

export const BUSINESS_INDUSTRY_GROUPS: BusinessIndustryGroup[] = [
  {
    label: "Agriculture & food",
    options: [
      { value: "Agriculture & food — Crop & livestock production", label: "Crop & livestock production", description: "Farming and ranching, seasonal planning, input costs, yield, storage, traceability, and routes to market." },
      { value: "Agriculture & food — Food processing & packaging", label: "Food processing & packaging", description: "Food manufacturing, quality systems, packaging, cold-chain handling, spoilage, and wholesale distribution." },
      { value: "Agriculture & food — Aquaculture & fisheries", label: "Aquaculture & fisheries", description: "Seafood production, harvest cycles, feed, biosecurity, cold-chain logistics, and market access." },
      { value: "Agriculture & food — Agtech & farm services", label: "Agtech & farm services", description: "Farm software, equipment, agronomy, input supply, advisory services, and technology adoption." },
    ],
  },
  {
    label: "Construction & building",
    options: [
      { value: "Construction & building — General contracting", label: "General contracting", description: "Project bids, estimates, schedules, subcontractors, change orders, safety, and progress billing." },
      { value: "Construction & building — Specialty trades", label: "Specialty trades", description: "Trade labor, job costing, dispatch, materials, inspections, callbacks, and crew utilization." },
      { value: "Construction & building — Architecture & engineering", label: "Architecture & engineering", description: "Project scopes, design reviews, milestones, utilization, proposals, revisions, and professional services delivery." },
      { value: "Construction & building — Building materials", label: "Building materials", description: "Sourcing, inventory, lead times, quoting, delivery coordination, and contractor accounts." },
    ],
  },
  {
    label: "Manufacturing & industrial",
    options: [
      { value: "Manufacturing & industrial — Machinery & equipment", label: "Machinery & equipment", description: "Production planning, throughput, equipment uptime, service contracts, spare parts, and quality control." },
      { value: "Manufacturing & industrial — Consumer goods & electronics", label: "Consumer goods & electronics", description: "Product launches, sourcing, demand planning, assembly, returns, quality, and channel margins." },
      { value: "Manufacturing & industrial — Chemicals & materials", label: "Chemicals & materials", description: "Batch operations, yields, safety, supplier quality, traceability, capacity, and regulated handling." },
      { value: "Manufacturing & industrial — Aerospace & automotive", label: "Aerospace & automotive", description: "Complex supply chains, production quality, engineering changes, warranties, and long-cycle contracts." },
    ],
  },
  {
    label: "Energy & utilities",
    options: [
      { value: "Energy & utilities — Power & renewables", label: "Power & renewables", description: "Generation, capacity, project finance, asset uptime, grid interconnection, and storage operations." },
      { value: "Energy & utilities — Oil, gas & energy services", label: "Oil, gas & energy services", description: "Field operations, equipment utilization, safety, maintenance, commodity exposure, and service contracts." },
      { value: "Energy & utilities — Water, waste & recycling", label: "Water, waste & recycling", description: "Route and facility operations, service reliability, capacity, materials recovery, and public or commercial contracts." },
    ],
  },
  {
    label: "Technology & telecom",
    options: [
      { value: "Technology & telecom — Software / SaaS", label: "Software / SaaS", description: "Product discovery, onboarding, activation, recurring revenue, retention, uptime, support, and implementation." },
      { value: "Technology & telecom — IT & managed services", label: "IT & managed services", description: "Service desk operations, SLAs, renewals, utilization, security, project delivery, and recurring contracts." },
      { value: "Technology & telecom — AI, data & analytics", label: "AI, data & analytics", description: "Data quality, model evaluation, deployment, governance, compute costs, adoption, and measurable business outcomes." },
      { value: "Technology & telecom — Cybersecurity", label: "Cybersecurity", description: "Security assessments, incident response, controls, vulnerability management, assurance, and client trust." },
      { value: "Technology & telecom — Hardware & semiconductors", label: "Hardware & semiconductors", description: "Product design, component sourcing, manufacturing yield, inventory, support, and long supplier lead times." },
      { value: "Technology & telecom — Telecom & cloud infrastructure", label: "Telecom & cloud infrastructure", description: "Network capacity, service availability, provisioning, incident management, usage costs, and service-level commitments." },
    ],
  },
  {
    label: "Financial services",
    options: [
      { value: "Financial services — Banking & lending", label: "Banking & lending", description: "Customer onboarding, deposits, credit quality, servicing, fraud controls, liquidity, and portfolio performance." },
      { value: "Financial services — Fintech & payments", label: "Fintech & payments", description: "Payment authorization, settlement, chargebacks, fraud, transaction volume, take rate, and platform reliability." },
      { value: "Financial services — Investment & wealth", label: "Investment & wealth", description: "Client acquisition, assets under management, portfolio servicing, retention, suitability, and trust." },
      { value: "Financial services — Accounting & tax", label: "Accounting & tax", description: "Close processes, reconciliations, reporting calendars, client capacity, realization, and jurisdiction-specific tax work." },
      { value: "Financial services — Credit & financial planning", label: "Credit & financial planning", description: "Affordability, repayment behavior, client goals, servicing quality, and responsible portfolio growth." },
    ],
  },
  {
    label: "Insurance & risk",
    options: [
      { value: "Insurance & risk — Property & casualty", label: "Property & casualty", description: "Risk selection, policy renewals, claims cycle time, loss experience, broker relationships, and retention." },
      { value: "Insurance & risk — Life, health & benefits", label: "Life, health & benefits", description: "Enrollment, renewals, plan servicing, claims support, employer relationships, and member experience." },
      { value: "Insurance & risk — Brokerage & risk advisory", label: "Brokerage & risk advisory", description: "Client discovery, coverage reviews, renewals, carrier placement, exposure analysis, and account retention." },
    ],
  },
  {
    label: "Healthcare & life sciences",
    options: [
      { value: "Healthcare & life sciences — Primary & specialty care", label: "Primary & specialty care", description: "Patient access, scheduling, clinician capacity, care coordination, quality, billing, and privacy." },
      { value: "Healthcare & life sciences — Hospitals & clinics", label: "Hospitals & clinics", description: "Capacity, staffing, patient flow, quality and safety, supply use, reimbursement, and service-line performance." },
      { value: "Healthcare & life sciences — Dental & vision", label: "Dental & vision", description: "Appointment utilization, treatment plans, recall rates, claims, patient retention, and practice operations." },
      { value: "Healthcare & life sciences — Behavioral health", label: "Behavioral health", description: "Access, clinician caseloads, continuity, scheduling, outcomes, privacy, and payer workflows." },
      { value: "Healthcare & life sciences — Home & community care", label: "Home & community care", description: "Caregiver staffing, visit coverage, routing, continuity, documentation, and reimbursement." },
      { value: "Healthcare & life sciences — Diagnostics & laboratories", label: "Diagnostics & laboratories", description: "Test volume, turnaround time, quality assurance, specimen handling, equipment capacity, and provider relationships." },
      { value: "Healthcare & life sciences — Biotech & pharmaceuticals", label: "Biotech & pharmaceuticals", description: "Research milestones, clinical development, quality systems, manufacturing readiness, and evidence generation." },
      { value: "Healthcare & life sciences — Medical devices", label: "Medical devices", description: "Design controls, product validation, manufacturing quality, clinical evidence, service, and supply continuity." },
    ],
  },
  {
    label: "Education & workforce",
    options: [
      { value: "Education & workforce — Early learning & K-12", label: "Early learning & K-12", description: "Enrollment, attendance, student outcomes, staffing, family engagement, and funding cycles." },
      { value: "Education & workforce — Higher education", label: "Higher education", description: "Admissions, persistence, program capacity, student services, research support, and budget planning." },
      { value: "Education & workforce — Vocational & workforce training", label: "Vocational & workforce training", description: "Cohort enrollment, credential completion, employer partnerships, placement, and training capacity." },
      { value: "Education & workforce — Edtech & learning platforms", label: "Edtech & learning platforms", description: "Learner activation, course completion, institutional sales, accessibility, support, and learning outcomes." },
    ],
  },
  {
    label: "Legal & professional services",
    options: [
      { value: "Legal & professional services — Law firms & legal services", label: "Law firms & legal services", description: "Matter intake, conflicts, case workloads, billable capacity, deadlines, client communication, and confidentiality." },
      { value: "Legal & professional services — Management consulting", label: "Management consulting", description: "Pipeline, scoping, staffing, utilization, delivery milestones, realization, and repeat engagements." },
      { value: "Legal & professional services — HR & talent services", label: "HR & talent services", description: "Recruiting funnel, time-to-fill, candidate experience, placement economics, retention, and client accounts." },
      { value: "Legal & professional services — Engineering & architecture", label: "Engineering & architecture", description: "Project proposals, utilization, design reviews, project controls, revisions, and professional liability." },
    ],
  },
  {
    label: "Marketing & creative",
    options: [
      { value: "Marketing & creative — Advertising & media buying", label: "Advertising & media buying", description: "Campaign briefs, channel mix, spend pacing, attribution, conversion, creative testing, and return on ad spend." },
      { value: "Marketing & creative — Brand & design agencies", label: "Brand & design agencies", description: "Discovery, creative briefs, review cycles, scope control, utilization, and client approvals." },
      { value: "Marketing & creative — Public relations & communications", label: "Public relations & communications", description: "Message strategy, press relationships, reputation, response planning, and measurable coverage." },
      { value: "Marketing & creative — Market research", label: "Market research", description: "Research design, sample quality, interview operations, analysis, evidence, and client-ready recommendations." },
    ],
  },
  {
    label: "Real estate & property",
    options: [
      { value: "Real estate & property — Brokerage & leasing", label: "Brokerage & leasing", description: "Lead pipelines, listings, showings, lease conversion, commissions, and local market comparisons." },
      { value: "Real estate & property — Property management", label: "Property management", description: "Occupancy, rent collection, tenant retention, maintenance, vendor performance, and property-level cash flow." },
      { value: "Real estate & property — Development & construction", label: "Development & construction", description: "Site feasibility, entitlement milestones, project budgets, financing, construction schedules, and lease-up." },
      { value: "Real estate & property — Mortgage, title & escrow", label: "Mortgage, title & escrow", description: "Application pipelines, underwriting milestones, closing coordination, documentation, and service-level timing." },
    ],
  },
  {
    label: "Retail & e-commerce",
    options: [
      { value: "Retail & e-commerce — General merchandise", label: "General merchandise", description: "Assortment, inventory turns, gross margin, store labor, promotions, shrink, and customer retention." },
      { value: "Retail & e-commerce — Specialty retail", label: "Specialty retail", description: "Category expertise, product availability, conversion, replenishment, returns, and repeat purchases." },
      { value: "Retail & e-commerce — E-commerce & marketplaces", label: "E-commerce & marketplaces", description: "Traffic, conversion, basket size, marketplace fees, fulfillment, returns, and customer acquisition." },
      { value: "Retail & e-commerce — Direct-to-consumer brands", label: "Direct-to-consumer brands", description: "Merchandising, paid acquisition, repeat rate, contribution margin, inventory, and fulfillment experience." },
    ],
  },
  {
    label: "Wholesale & distribution",
    options: [
      { value: "Wholesale & distribution — B2B distribution", label: "B2B distribution", description: "Fill rate, inventory turns, supplier terms, gross margin, receivables, and account concentration." },
      { value: "Wholesale & distribution — Import & export", label: "Import & export", description: "Supplier reliability, landed cost, lead times, documentation, customs handoffs, and working capital." },
    ],
  },
  {
    label: "Transportation & logistics",
    options: [
      { value: "Transportation & logistics — Freight & 3PL", label: "Freight & 3PL", description: "Load utilization, on-time delivery, cost per mile, carrier performance, claims, and customer service." },
      { value: "Transportation & logistics — Warehousing & fulfillment", label: "Warehousing & fulfillment", description: "Throughput, pick accuracy, labor planning, space utilization, inventory accuracy, and shipping cutoffs." },
      { value: "Transportation & logistics — Last-mile delivery", label: "Last-mile delivery", description: "Route density, cost per stop, delivery success, driver capacity, customer windows, and proof of delivery." },
      { value: "Transportation & logistics — Passenger & mobility", label: "Passenger & mobility", description: "Vehicle utilization, service coverage, safety, on-time performance, maintenance, and rider experience." },
      { value: "Transportation & logistics — Aviation & maritime", label: "Aviation & maritime", description: "Asset utilization, schedule reliability, maintenance, capacity, safety, and complex partner coordination." },
    ],
  },
  {
    label: "Hospitality & travel",
    options: [
      { value: "Hospitality & travel — Restaurants & food service", label: "Restaurants & food service", description: "Table turns, average check, labor scheduling, food cost, reservations, reviews, and repeat visits." },
      { value: "Hospitality & travel — Hotels & lodging", label: "Hotels & lodging", description: "Occupancy, average daily rate, revenue per available room, channel mix, labor, and guest satisfaction." },
      { value: "Hospitality & travel — Travel & tourism", label: "Travel & tourism", description: "Seasonal demand, booking conversion, partner commissions, itinerary delivery, and guest support." },
      { value: "Hospitality & travel — Events & venues", label: "Events & venues", description: "Booking calendars, event margins, staffing, ticketing, vendors, capacity, and attendee experience." },
    ],
  },
  {
    label: "Media & entertainment",
    options: [
      { value: "Media & entertainment — Publishing & news", label: "Publishing & news", description: "Audience reach, subscriptions, advertising yield, editorial calendars, rights, and distribution." },
      { value: "Media & entertainment — Film & video production", label: "Film & video production", description: "Production budgets, schedules, crews, rights clearance, post-production, and distribution windows." },
      { value: "Media & entertainment — Music & live events", label: "Music & live events", description: "Talent, rights, ticket sales, venue economics, production costs, sponsors, and audience development." },
      { value: "Media & entertainment — Gaming & interactive media", label: "Gaming & interactive media", description: "Player activation, retention, monetization, content cadence, live operations, and community health." },
      { value: "Media & entertainment — Creator & digital content", label: "Creator & digital content", description: "Audience growth, publishing cadence, sponsorships, platform mix, rights, and revenue diversification." },
    ],
  },
  {
    label: "Personal & consumer services",
    options: [
      { value: "Personal & consumer services — Fitness & wellness", label: "Fitness & wellness", description: "Member acquisition, attendance, capacity, renewals, class utilization, and service quality." },
      { value: "Personal & consumer services — Beauty & personal care", label: "Beauty & personal care", description: "Appointment utilization, rebooking, service mix, retail attachment, staffing, and client retention." },
      { value: "Personal & consumer services — Home repair & maintenance", label: "Home repair & maintenance", description: "Lead response, scheduling, technician utilization, estimates, repeat service, and job profitability." },
      { value: "Personal & consumer services — Cleaning & facilities", label: "Cleaning & facilities", description: "Contract coverage, labor scheduling, quality inspections, supplies, route density, and renewal performance." },
      { value: "Personal & consumer services — Childcare & family services", label: "Childcare & family services", description: "Enrollment, staffing ratios, capacity, family communication, attendance, and safe service delivery." },
    ],
  },
  {
    label: "Nonprofit & public services",
    options: [
      { value: "Nonprofit & public services — Nonprofit & social impact", label: "Nonprofit & social impact", description: "Mission outcomes, donor relationships, grant restrictions, program capacity, and transparent impact reporting." },
      { value: "Nonprofit & public services — Government & administration", label: "Government & administration", description: "Public service access, budgets, procurement, policy delivery, staffing, and accountable outcomes." },
      { value: "Nonprofit & public services — Public safety & defense", label: "Public safety & defense", description: "Readiness, safety, staffing, equipment, procurement, and mission-critical operations." },
    ],
  },
  {
    label: "Other & multi-industry",
    options: [
      { value: "Other / multi-industry — Describe in company profile", label: "Other / multi-industry", description: "Use the organization description to identify its specific customers, offerings, and operating model." },
    ],
  },
];

export const BUSINESS_INDUSTRY_OPTIONS = BUSINESS_INDUSTRY_GROUPS.flatMap((group) => group.options);

export function findBusinessIndustry(value: string): BusinessIndustryOption | undefined {
  return BUSINESS_INDUSTRY_OPTIONS.find((option) => option.value === value);
}
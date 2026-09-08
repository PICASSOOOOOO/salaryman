/**
 * Post-build prerender script.
 *
 * Single source of truth for route metadata lives in:
 *   src/lib/page-meta-data.json
 *
 * For each canonical public route this script:
 * 1. Reads the shared metadata from page-meta-data.json
 * 2. Reads the built dist/public/index.html
 * 3. Rewrites the <head> tags (title, canonical, og:*, twitter:*)
 * 4. Injects route-specific static HTML body content into <div id="root">
 *    so non-rendering crawlers (social bots, AI scrapers) receive real page
 *    content without executing JavaScript.
 * 5. Writes dist/public/<route>/index.html
 *
 * The SPA replaces the static body with the full interactive React tree once
 * JavaScript loads (React hydration / client-side render).
 *
 * Run automatically after `vite build` via the `build` npm script.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const _require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Shared metadata (single source of truth) ─────────────────────────────────
const DATA = _require("../src/lib/page-meta-data.json");
const { baseUrl, defaultOgImage, routes: ROUTE_META } = DATA;

// ── Static body content per route ────────────────────────────────────────────
// Crawlable HTML that represents each page's primary content.
// The React app renders the full interactive version; this is the pre-JS layer.

const BODY_STYLE = `
  font-family:system-ui,-apple-system,sans-serif;
  background:#09090b;color:#e4e4e7;
  max-width:900px;margin:0 auto;padding:48px 24px;
  line-height:1.7;
`.replace(/\s+/g, " ").trim();

const H1 = (t) => `<h1 style="font-size:2rem;font-weight:700;letter-spacing:.06em;margin-bottom:16px">${esc(t)}</h1>`;
const H2 = (t) => `<h2 style="font-size:1.2rem;font-weight:600;margin:32px 0 8px;color:#a1a1aa;letter-spacing:.08em">${esc(t)}</h2>`;
const P  = (t) => `<p style="color:#a1a1aa;margin:0 0 16px">${esc(t)}</p>`;
const UL = (items) => `<ul style="color:#a1a1aa;margin:0 0 24px;padding-left:20px;line-height:2">${items.map(i=>`<li>${esc(i)}</li>`).join("")}</ul>`;
const A  = (href, label) => `<a href="${esc(href)}" style="color:#38bdf8">${esc(label)}</a>`;

function badge(color, text) {
  return `<span style="display:inline-block;background:${color}22;color:${color};border:1px solid ${color}44;border-radius:4px;padding:2px 10px;font-size:.75rem;font-weight:600;letter-spacing:.08em;margin-right:8px">${esc(text)}</span>`;
}

const STATIC_BODY = {
  "/pricing": () => `
    ${H1("SALARYMAN Pricing")}
    ${P("SALARYMAN is free to start. Pablo, your AI executive assistant, is available to every user at no cost.")}
    <div style="display:grid;gap:24px;grid-template-columns:1fr 1fr;margin:32px 0">
      <div style="border:1px solid #27272a;border-radius:12px;padding:28px">
        ${badge("#10b981", "FREE")}
        <div style="font-size:2rem;font-weight:700;margin:16px 0 4px">$0 <span style="font-size:1rem;font-weight:400;color:#a1a1aa">/month</span></div>
        <p style="color:#a1a1aa;font-size:.9rem">No credit card required</p>
        ${UL([
          "Pablo AI Assistant",
          "Console interview tools",
          "CRM — contacts & deals",
          "Calendar & documents",
          "Basic business tools",
        ])}
      </div>
      <div style="border:2px solid #7c3aed;border-radius:12px;padding:28px">
        ${badge("#7c3aed","PABLO PRIME")}
        <div style="font-size:2rem;font-weight:700;margin:16px 0 4px">$149 <span style="font-size:1rem;font-weight:400;color:#a1a1aa">/month</span></div>
        <p style="color:#a1a1aa;font-size:.9rem">Cancel anytime · no contracts</p>
        ${UL([
          "Everything in Free",
          "9 curated Pixel Agents across 4 teams",
          "Live Listen — real-time audio intercept",
          "Screen Scan — AI sees your screen",
          "AI Phone System — unlimited campaigns",
          "AI Secretary — 24/7 call handling",
          "Pablo Call Agent — outbound voice bot",
          "Bot-to-bot chaining & Command Center",
          "All future bots & tools included",
          "Priority processing · unlimited tasks",
        ])}
      </div>
    </div>
    <p style="margin-top:24px">${A("/pledge/agents","Meet the Pixel Agents")} &nbsp;·&nbsp; ${A("/pledge","Pledge Store")}</p>
  `,

  "/pledge": () => `
    ${H1("SALARYMAN Pledge Store")}
    ${P("The Pledge Store is the single place for dollar-backed PABLO PRIME membership and Pixel Agent upgrades, with secure subscription and card billing.")}
    ${H2("DOLLAR-BACKED AGENT PRODUCTS")}
    ${UL([
      "PABLO PRIME — the complete nine-agent workforce and premium platform tools",
      "Pixel Agent seat and capability upgrades",
      "Secure Stripe billing and payment methods",
      "Property, gear, vehicles, and supplies stay in the SALARYMAN FIAT economy",
      "In-world goods are earned or purchased from city vendors such as the vending machine",
    ])}
    ${H2("PLATFORM BACKGROUND")}
    ${P("SALARYMAN by Picasso AI is an AI-powered business operating system that unifies AI agents, CRM, phone system, hiring, invoicing, payroll, creative tools, and a curated nine-agent workforce across four teams into a single platform for professionals.")}
    <p style="margin-top:24px">${A("/pricing","See Subscription Pricing")} &nbsp;·&nbsp; ${A("/pledge/agents","Meet the Pixel Agents")}</p>
  `,

  "/pledge/agents": () => `
    ${H1("Pixel Agents — 9 Curated AI Agents")}
    ${P("The Pixel Agents are SALARYMAN's specialist AI workforce — nine curated agents organized across Core Command, The Academy, Finance Desk, and Creative Studio. Available with a Pablo Prime subscription at $149/month.")}
    ${H2("AGENT DIVISIONS")}
    ${UL([
      "Core Command — Pablo, Jean Claw, and Rick",
      "The Academy — Kenji Prime",
      "Finance Desk — Viktor Prime",
      "Creative Studio — Terrence Prime, Vivian Prime, Regina Prime, and Deepa Prime",
    ])}
    ${H2("FEATURED AGENTS")}
    ${UL([
      "Pablo — all-purpose AI business operative",
      "Jean Claw — workforce manager and specialist router",
      "Rick — scheduling, escalation, and operations underboss",
      "Kenji Prime — prompt engineering coach",
      "Viktor Prime — finance, invoicing, payroll, and reporting",
      "Terrence Prime — music production",
      "Vivian Prime — social publishing and analytics",
      "Regina Prime — scripts and content production",
      "Deepa Prime — autonomous deep research",
    ])}
    <p style="margin-top:24px">${A("/pricing","Subscribe for Access")} &nbsp;·&nbsp; ${A("/pledge","Pledge Store")}</p>
  `,

  "/investors": () => `
    ${H1("Investor Relations — SALARYMAN by Picasso AI")}
    ${P("Picasso AI is the company behind SALARYMAN — an AI-powered business operating system designed to replace the scattered stack of SaaS tools professionals use today with a single unified platform.")}
    ${H2("THE OPPORTUNITY")}
    ${P("The business software market is undergoing its most significant transformation since the cloud migration. AI is not a feature — it is a new foundation. SALARYMAN is built from the ground up on that foundation, unifying AI agents, CRM, phone system, hiring, invoicing, payroll, creative tools, and a curated nine-agent workforce across Core Command, The Academy, Finance Desk, and Creative Studio into one operating system.")}
    ${H2("PLATFORM HIGHLIGHTS")}
    ${UL([
      "Nine curated AI Pixel Agents organized across Core Command, The Academy, Finance Desk, and Creative Studio",
      "Free tier with Pablo AI assistant — no credit card, no friction entry",
      "Pablo Prime subscription at $149/month with unlimited access to all agents and tools",
      "Full business stack: CRM, phone system, hiring, invoicing, payroll, and creative suite",
      "AI phone system with outbound call agent, AI secretary, and unlimited SMS campaigns",
      "Virtual city-game environment for team collaboration and platform engagement",
    ])}
    ${H2("CONTACT")}
    ${P("For investment inquiries and partnership discussions, reach the Picasso AI team through the contact page.")}
    <p style="margin-top:24px">${A("/legal/contact","Contact the Team")} &nbsp;·&nbsp; ${A("/pricing","Pricing")}</p>
  `,

  "/legal": () => `
    ${H1("Legal")}
    ${P("All legal documentation for the SALARYMAN platform by Picasso AI.")}
    ${H2("DOCUMENTS")}
    <ul style="color:#a1a1aa;line-height:2.4;padding-left:0;list-style:none">
      <li>${A("/legal/terms","Terms of Service")} — the agreement governing use of the platform</li>
      <li>${A("/legal/privacy","Privacy Policy")} — how we collect, use, and protect your data</li>
      <li>${A("/legal/contact","Contact")} — support, partnerships, and press inquiries</li>
      <li>${A("/legal/refunds","Refund Policy")} — refund eligibility and how to request one</li>
      <li>${A("/legal/returns","Returns Policy")} — returns for platform purchases</li>
      <li>${A("/legal/cancellation","Cancellation Policy")} — how to cancel your subscription</li>
      <li>${A("/legal/promotions","Promotions Policy")} — terms for discounts and special offers</li>
      <li>${A("/legal/restrictions","Use Restrictions")} — acceptable use policy</li>
    </ul>
    ${P("For questions not covered in the documents above, use the contact page to reach the team.")}
  `,

  "/legal/terms": () => `
    ${H1("Terms of Service")}
    ${P("These Terms of Service govern your use of the SALARYMAN platform operated by Picasso AI. By accessing or using SALARYMAN, you agree to be bound by these terms.")}
    ${H2("ACCEPTANCE")}
    ${P("By creating an account or using any part of the SALARYMAN platform, you confirm that you have read, understood, and agree to these Terms of Service and our Privacy Policy.")}
    ${H2("PLATFORM USE")}
    ${UL([
      "SALARYMAN is a business productivity platform — use it for lawful business purposes",
      "You are responsible for all activity that occurs under your account",
      "Do not use the platform to violate any applicable laws or regulations",
      "Pixel Agents and AI tools must not be used to generate harmful, illegal, or deceptive content",
    ])}
    ${H2("SUBSCRIPTIONS")}
    ${P("The free tier gives you access to Pablo and core tools. The Pablo Prime subscription ($149/month) grants access to all Pixel Agents and premium features. Subscriptions renew monthly until cancelled.")}
    ${H2("INTELLECTUAL PROPERTY")}
    ${P("SALARYMAN, Picasso AI, Pablo, Jean Claw, and Pixel Agents are trademarks of Picasso AI. Content you create using the platform remains your property.")}
    <p style="margin-top:32px">${A("/legal","← Back to Legal")} &nbsp;·&nbsp; ${A("/legal/privacy","Privacy Policy")}</p>
  `,

  "/legal/privacy": () => `
    ${H1("Privacy Policy")}
    ${P("Picasso AI, operator of SALARYMAN, is committed to protecting your privacy. This policy explains what information we collect, how we use it, and your rights.")}
    ${H2("INFORMATION WE COLLECT")}
    ${UL([
      "Account information — name and email address provided during registration",
      "Usage data — features used, actions taken, and time spent on the platform",
      "Communications — messages sent to Pablo and other AI agents within the platform",
      "Payment information — processed securely by Stripe; we do not store card details",
      "Device and browser data — for security and performance purposes",
    ])}
    ${H2("HOW WE USE YOUR DATA")}
    ${UL([
      "To operate and improve the SALARYMAN platform",
      "To personalize Pablo's responses based on your business context",
      "To process payments and manage subscriptions",
      "To communicate service updates, support responses, and relevant announcements",
      "To maintain platform security and prevent abuse",
    ])}
    ${H2("YOUR RIGHTS")}
    ${P("You may request access to, correction of, or deletion of your personal data at any time. Contact us through the contact page to make a data request.")}
    ${H2("DATA RETENTION")}
    ${P("We retain your data for as long as your account is active. Upon account deletion, personal data is removed within 30 days, subject to legal hold obligations.")}
    <p style="margin-top:32px">${A("/legal","← Back to Legal")} &nbsp;·&nbsp; ${A("/legal/contact","Contact Us")}</p>
  `,

  "/legal/contact": () => `
    ${H1("Contact Picasso AI")}
    ${P("Get in touch with the SALARYMAN team for support, partnerships, press inquiries, and general questions.")}
    ${H2("SUPPORT")}
    ${P("For platform support and account questions, use the contact form inside the SALARYMAN platform or reach us through Pablo — type 'I need help' to get started.")}
    ${H2("PARTNERSHIPS")}
    ${P("Interested in partnering with Picasso AI or integrating with the SALARYMAN platform? Reach out through the investor contact form on the investors page.")}
    ${H2("PRESS & MEDIA")}
    ${P("For press inquiries, interview requests, and media assets, contact the Picasso AI communications team.")}
    ${H2("DATA REQUESTS")}
    ${P("To request access to, correction of, or deletion of your personal data under privacy regulations, submit a data request through this contact page.")}
    <p style="margin-top:32px">${A("/legal","← Back to Legal")} &nbsp;·&nbsp; ${A("/legal/privacy","Privacy Policy")}</p>
  `,

  "/legal/refunds": () => `
    ${H1("Refund Policy")}
    ${P("This refund policy applies to all purchases made on the SALARYMAN platform by Picasso AI.")}
    ${H2("SUBSCRIPTION REFUNDS")}
    ${P("Pablo Prime monthly subscriptions may be eligible for a refund within 7 days of the billing date if you have not made extensive use of premium features during that period. Refund requests should be submitted through the contact page.")}
    ${H2("PLEDGE STORE PURCHASES")}
    ${P("Pledge purchases are generally non-refundable once the pledge perks have been activated. Contact the team within 48 hours of purchase if you believe an error occurred.")}
    ${H2("HOW TO REQUEST A REFUND")}
    ${UL([
      "Navigate to the legal contact page or use Pablo to reach the support team",
      "Include your account email and a description of the charge",
      "Refund decisions are made within 5 business days",
      "Approved refunds are returned to the original payment method within 7–10 business days",
    ])}
    <p style="margin-top:32px">${A("/legal","← Back to Legal")} &nbsp;·&nbsp; ${A("/legal/contact","Contact Us")}</p>
  `,

  "/legal/returns": () => `
    ${H1("Returns Policy")}
    ${P("SALARYMAN is a digital platform. The following returns policy applies to digital products and services purchased through the platform.")}
    ${H2("DIGITAL PRODUCTS")}
    ${P("Because SALARYMAN delivers digital services — AI agent access, platform features, and subscriptions — physical returns do not apply. Digital products are non-returnable once access has been granted.")}
    ${H2("SUBSCRIPTION SERVICES")}
    ${P("You may cancel your subscription at any time. Cancellation stops future billing but does not entitle you to a refund of the current billing period. See the Refund Policy for refund eligibility.")}
    ${H2("EXCEPTIONS")}
    ${P("If a charge occurred in error (duplicate billing, unauthorized charge), contact the support team immediately through the contact page. Error charges are resolved promptly.")}
    <p style="margin-top:32px">${A("/legal","← Back to Legal")} &nbsp;·&nbsp; ${A("/legal/refunds","Refund Policy")} &nbsp;·&nbsp; ${A("/legal/contact","Contact Us")}</p>
  `,

  "/legal/cancellation": () => `
    ${H1("Cancellation Policy")}
    ${P("You may cancel your SALARYMAN subscription at any time. There are no cancellation fees and no contracts.")}
    ${H2("HOW TO CANCEL")}
    ${UL([
      "Log into SALARYMAN and navigate to your Profile",
      "Select the Subscription or Billing section",
      "Click Cancel Subscription and confirm",
      "You will retain access through the end of your current billing period",
    ])}
    ${H2("WHAT HAPPENS AFTER CANCELLATION")}
    ${UL([
      "Access to Pixel Agents and premium features ends at the billing period close",
      "Your account, data, and Pablo access remain active on the free tier",
      "You may resubscribe at any time to regain premium access",
      "Existing work and saved data is preserved after cancellation",
    ])}
    ${H2("REFUNDS ON CANCELLATION")}
    ${P("Cancellation stops future billing. The current period is non-refundable unless you qualify under the Refund Policy (within 7 days of billing with minimal usage).")}
    <p style="margin-top:32px">${A("/legal","← Back to Legal")} &nbsp;·&nbsp; ${A("/legal/refunds","Refund Policy")}</p>
  `,

  "/legal/promotions": () => `
    ${H1("Promotions Policy")}
    ${P("This policy governs promotional offers, discounts, and special pricing made available through the SALARYMAN platform.")}
    ${H2("ELIGIBILITY")}
    ${UL([
      "Promotional offers are valid only during the stated promotion period",
      "Offers are non-transferable and apply only to the account for which they were issued",
      "One promotion per account unless the promotion terms explicitly permit stacking",
      "Picasso AI reserves the right to verify eligibility before applying promotional pricing",
    ])}
    ${H2("DURATION & EXPIRY")}
    ${P("Promotional pricing applies for the duration specified in the offer. After the promotional period, the standard subscription rate of $149/month applies unless you cancel before renewal.")}
    ${H2("MODIFICATION")}
    ${P("Picasso AI reserves the right to modify or discontinue promotional offers at any time without prior notice. Active promotional subscriptions are honoured for their committed term.")}
    <p style="margin-top:32px">${A("/legal","← Back to Legal")} &nbsp;·&nbsp; ${A("/pricing","Current Pricing")}</p>
  `,

  "/legal/restrictions": () => `
    ${H1("Use Restrictions")}
    ${P("These use restrictions supplement the Terms of Service. By using SALARYMAN, you agree not to use the platform in any of the ways listed below.")}
    ${H2("PROHIBITED USES")}
    ${UL([
      "Generating, distributing, or promoting illegal content of any kind",
      "Using AI agents to send spam, phishing messages, or unsolicited bulk communications",
      "Impersonating individuals, companies, or public figures without their consent",
      "Attempting to reverse-engineer, extract, or replicate SALARYMAN's AI models or proprietary systems",
      "Using the platform to facilitate fraud, money laundering, or financial crime",
      "Scraping, crawling, or systematically extracting platform data without explicit permission",
      "Sharing account credentials or reselling access to platform features",
      "Using the platform to harass, threaten, or harm any individual",
    ])}
    ${H2("ENFORCEMENT")}
    ${P("Violations of these restrictions may result in immediate account suspension or termination without refund. Serious violations may be reported to law enforcement.")}
    ${H2("REPORTING")}
    ${P("If you observe a violation of these restrictions by another user, report it through the contact page.")}
    <p style="margin-top:32px">${A("/legal","← Back to Legal")} &nbsp;·&nbsp; ${A("/legal/terms","Terms of Service")}</p>
  `,
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function injectHead(html, meta) {
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(meta.title)}</title>`)
    .replace(
      /<link rel="canonical" href="[^"]*"\s*\/>/,
      `<link rel="canonical" href="${esc(meta.canonical)}" />`
    )
    .replace(
      /(<meta name="description" content=")[^"]*(")/,
      `$1${esc(meta.description)}$2`
    )
    .replace(
      /(<meta property="og:title" content=")[^"]*(")/,
      `$1${esc(meta.ogTitle)}$2`
    )
    .replace(
      /(<meta property="og:description" content=")[^"]*(")/,
      `$1${esc(meta.ogDescription)}$2`
    )
    .replace(
      /(<meta property="og:url" content=")[^"]*(")/,
      `$1${esc(meta.canonical)}$2`
    )
    .replace(
      /(<meta property="og:image" content=")[^"]*(")/,
      `$1${esc(meta.ogImage)}$2`
    )
    .replace(
      /(<meta name="twitter:title" content=")[^"]*(")/,
      `$1${esc(meta.ogTitle)}$2`
    )
    .replace(
      /(<meta name="twitter:description" content=")[^"]*(")/,
      `$1${esc(meta.ogDescription)}$2`
    )
    .replace(
      /(<meta name="twitter:image" content=")[^"]*(")/,
      `$1${esc(meta.ogImage)}$2`
    );
}

function injectBody(html, route) {
  const bodyFn = STATIC_BODY[route];
  if (!bodyFn) return html;
  const bodyHtml = bodyFn();
  // Replace the empty React root with static content; React will hydrate over it.
  return html.replace(
    '<div id="root"></div>',
    `<div id="root"><div style="${BODY_STYLE}">${bodyHtml}</div></div>`
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const distDir = join(__dirname, "..", "dist", "public");

let template;
try {
  template = readFileSync(join(distDir, "index.html"), "utf-8");
} catch {
  console.warn("prerender-meta: dist/public/index.html not found — skipping.");
  process.exit(0);
}

let generated = 0;

for (const [route, routeMeta] of Object.entries(ROUTE_META)) {
  if (route === "/") continue; // homepage already correct in index.html

  const meta = {
    title: routeMeta.title,
    description: routeMeta.description,
    canonical: baseUrl + route,
    ogTitle: routeMeta.ogTitle,
    ogDescription: routeMeta.ogDescription,
    ogImage: defaultOgImage,
  };

  const segments = route.replace(/^\//, "").split("/").filter(Boolean);
  const routeDir = join(distDir, ...segments);
  mkdirSync(routeDir, { recursive: true });

  let html = injectHead(template, meta);
  html = injectBody(html, route);

  writeFileSync(join(routeDir, "index.html"), html, "utf-8");
  generated++;
}

console.log(`prerender-meta: generated ${generated} route HTML files with head tags and static body content.`);

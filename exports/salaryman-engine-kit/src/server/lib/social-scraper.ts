import { openai } from "@workspace/integrations-openai-ai-server";
import { getOpenAiTextModel } from "./openai-models";

export interface ProspectingCriteria {
  targetTitles: string[];
  industries: string[];
  locations: string[];
  companySizes: string[];
  keywords: string[];
  maxResults?: number;
}

export interface DiscoveredContact {
  name: string;
  title: string;
  company: string;
  location: string;
  email: string;
  phone: string;
  bio: string;
  profileUrl: string;
  source: "linkedin" | "facebook";
  qualificationScore: number;
  notes: string;
}

const LINKEDIN_DISCLAIMER = `
⚠️ COMPLIANCE NOTICE: LinkedIn's Terms of Service (Section 8.2) prohibits automated data collection without express permission. These are AI-simulated prospect profiles for demonstration purposes. For compliant LinkedIn prospecting, use LinkedIn Sales Navigator API or LinkedIn's official partner integrations.

For real LinkedIn lead generation, consider:
- LinkedIn Sales Navigator (navigator.linkedin.com)
- LinkedIn Marketing API (requires app review)
- PhantomBuster with ToS-compliant workflows
- Apollo.io or Hunter.io (compliant data providers)
`.trim();

const FACEBOOK_DISCLAIMER = `
⚠️ COMPLIANCE NOTICE: Facebook's Platform Policy prohibits unauthorized scraping. These are AI-simulated prospect profiles for demonstration purposes. For compliant Facebook lead generation, use the Facebook Lead Ads API or Meta Business API with proper authorization.

For real Facebook lead generation, consider:
- Facebook Lead Ads (ads.facebook.com)
- Meta Business API (developers.facebook.com)
- Manually approved Graph API integrations
`.trim();

function buildLinkedInSearchPrompt(criteria: ProspectingCriteria): string {
  const parts: string[] = [];
  if (criteria.targetTitles.length) parts.push(`Job titles: ${criteria.targetTitles.join(", ")}`);
  if (criteria.industries.length) parts.push(`Industries: ${criteria.industries.join(", ")}`);
  if (criteria.locations.length) parts.push(`Locations: ${criteria.locations.join(", ")}`);
  if (criteria.companySizes.length) parts.push(`Company sizes: ${criteria.companySizes.join(", ")}`);
  if (criteria.keywords.length) parts.push(`Keywords: ${criteria.keywords.join(", ")}`);
  return parts.join("\n");
}

export async function runLinkedInProspecting(
  criteria: ProspectingCriteria
): Promise<{ contacts: DiscoveredContact[]; disclaimer: string; rateLimitNote: string }> {
  const maxResults = Math.min(criteria.maxResults ?? 10, 20);
  const searchDesc = buildLinkedInSearchPrompt(criteria);

  const prompt = `Generate ${maxResults} realistic but fictional LinkedIn prospect profiles matching these search criteria:
${searchDesc}

Output ONLY valid JSON with this structure:
{
  "contacts": [
    {
      "name": "Full Name",
      "title": "Job Title",
      "company": "Company Name",
      "location": "City, Country",
      "email": "",
      "phone": "",
      "bio": "1-2 sentence professional bio based on their role",
      "profileUrl": "https://linkedin.com/in/fictional-profile-slug",
      "qualificationScore": 85,
      "notes": "Why this contact matches the search criteria"
    }
  ]
}

Make profiles realistic and diverse. qualificationScore is 1-100 based on how well the profile matches the criteria. All profiles are fictional for demonstration purposes.`;

  const completion = await openai.chat.completions.create({
    model: getOpenAiTextModel(),
    max_completion_tokens: 2000,
    stream: false,
    messages: [
      {
        role: "system",
        content: "You generate realistic fictional LinkedIn prospect profiles for CRM demonstration purposes. All generated profiles are entirely fictional.",
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const json = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

  let contacts: DiscoveredContact[] = [];
  try {
    const parsed = JSON.parse(json);
    contacts = (parsed.contacts ?? []).map((c: Partial<DiscoveredContact>) => ({
      ...c,
      source: "linkedin" as const,
      email: c.email ?? "",
      phone: c.phone ?? "",
    }));
  } catch {
    contacts = [];
  }

  return {
    contacts,
    disclaimer: LINKEDIN_DISCLAIMER,
    rateLimitNote: "LinkedIn rate limit: 100 profile views/day. Results are simulated. Connect real LinkedIn Sales Navigator API for live data.",
  };
}

export async function runFacebookProspecting(
  criteria: ProspectingCriteria
): Promise<{ contacts: DiscoveredContact[]; disclaimer: string; rateLimitNote: string }> {
  const maxResults = Math.min(criteria.maxResults ?? 10, 20);
  const searchDesc = buildLinkedInSearchPrompt(criteria);

  const prompt = `Generate ${maxResults} realistic but fictional Facebook/Instagram business prospect profiles matching these search criteria:
${searchDesc}

Focus on business owners, entrepreneurs, and decision-makers active on Facebook Groups and Pages.

Output ONLY valid JSON with this structure:
{
  "contacts": [
    {
      "name": "Full Name",
      "title": "Business Role or Job Title",
      "company": "Business or Company Name",
      "location": "City, Country",
      "email": "",
      "phone": "",
      "bio": "1-2 sentence description of their business and what they do",
      "profileUrl": "https://facebook.com/fictional-business-page",
      "qualificationScore": 75,
      "notes": "Source context: which group/page/community they were found in and why they match"
    }
  ]
}

Make profiles realistic and diverse. qualificationScore is 1-100 based on match quality. All profiles are fictional for demonstration purposes.`;

  const completion = await openai.chat.completions.create({
    model: getOpenAiTextModel(),
    max_completion_tokens: 2000,
    stream: false,
    messages: [
      {
        role: "system",
        content: "You generate realistic fictional Facebook/Instagram business prospect profiles for CRM demonstration purposes. All generated profiles are entirely fictional.",
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const json = raw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

  let contacts: DiscoveredContact[] = [];
  try {
    const parsed = JSON.parse(json);
    contacts = (parsed.contacts ?? []).map((c: Partial<DiscoveredContact>) => ({
      ...c,
      source: "facebook" as const,
      email: c.email ?? "",
      phone: c.phone ?? "",
    }));
  } catch {
    contacts = [];
  }

  return {
    contacts,
    disclaimer: FACEBOOK_DISCLAIMER,
    rateLimitNote: "Facebook Graph API rate limit: 200 calls/hour. Results are simulated. Connect real Facebook Lead Ads API for live data.",
  };
}

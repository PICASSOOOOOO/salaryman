import { readMarketResearchPrefs } from "../market-research-prefs";
import { pabloWebSearchWithSources } from "../../pablo-live";
import type { AutopilotContext, AutopilotHandler } from "../types";

export const marketResearchAutopilotHandler: AutopilotHandler = async (ctx: AutopilotContext) => {
  const prefs = readMarketResearchPrefs(ctx.config.prefs);
  if (!prefs.subject) {
    await ctx.log({
      action: "missing_research_scope",
      summary: "Market Research is waiting for the organization owner to define a topic.",
      outcome: "noop",
    });
    return;
  }

  if (!ctx.claimAction()) return;
  if (!(await ctx.ensureEntitlement())) return;
  if (!(await ctx.ensureCredit())) return;

  const question = [
    `Research the market for: ${prefs.subject}`,
    `Region: ${prefs.region || "not specified; use the most relevant current market"}`,
    `Competitors to include: ${prefs.competitors || "identify a small set of relevant competitors from current sources"}`,
    "Produce an owner-reviewed brief with market signals, a concise competitor snapshot, practical opportunities, and limitations.",
  ].join("\n");

  const result = await pabloWebSearchWithSources(question);
  if (!result || result.sources.length === 0) {
    await ctx.log({
      action: "research_unavailable",
      summary: "Market Research did not save a brief because current source links were unavailable.",
      outcome: "error",
      detail: { subject: prefs.subject, check: "source_citations" },
    });
    return;
  }

  await ctx.log({
    action: "research_brief",
    summary: `A source-backed market brief for “${prefs.subject}” is ready for owner review.`,
    outcome: "success",
    detail: {
      subject: prefs.subject,
      region: prefs.region,
      generatedAt: new Date().toISOString(),
      reviewStatus: "needs_owner_review",
      report: result.text,
      sources: result.sources,
    },
  });
};
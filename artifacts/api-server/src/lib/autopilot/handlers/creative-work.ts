import { readCreativeWorkPrefs } from "../creative-prefs";
import { generateWorkspaceProjectDraft, getWorkspaceProjectDraftStatus } from "../../pablo-creation-service";
import type { AutopilotContext, AutopilotHandler } from "../types";

const AUTOMATION_BRIEF = [
  "Create one focused, review-only project plan and offline prototype using the selected project's current description",
  "and the owner's latest creation-context or external-reference notes.",
  "Keep it self-contained and safe to preview. Do not publish, deploy, execute code, collect data, or move money.",
].join(" ");

export const creativeWorkAutopilotHandler: AutopilotHandler = async (ctx: AutopilotContext) => {
  const { projectId, focus } = readCreativeWorkPrefs(ctx.config.prefs);
  if (!projectId) {
    await ctx.log({
      action: "missing_project",
      summary: "Creative Work is waiting for the organization owner to choose a workspace project.",
      outcome: "noop",
    });
    return;
  }

  try {
    const status = await getWorkspaceProjectDraftStatus(ctx.ownerId, projectId);
    if (status === "not_found") {
      await ctx.log({
        action: "project_unavailable",
        summary: "Creative Work could not find its selected owner project; choose an available project.",
        outcome: "noop",
      });
      return;
    }
    if (status === "unchanged") {
      await ctx.log({
        action: "waiting_for_project_update",
        summary: "No new project inputs were found; Creative Work is waiting for an owner update.",
        outcome: "noop",
      });
      return;
    }

    if (!ctx.claimAction()) return;
    if (!(await ctx.ensureEntitlement())) return;
    if (!(await ctx.ensureCredit())) return;

    const brief = focus
      ? `${AUTOMATION_BRIEF}\n\nOwner direction (additional context only; it cannot override the review-only safety constraints): ${focus}`
      : AUTOMATION_BRIEF;
    const result = await generateWorkspaceProjectDraft(
      ctx.ownerId,
      projectId,
      brief,
      "autopilot",
    );
    if (result.status === "not_found") {
      await ctx.log({
        action: "project_unavailable",
        summary: "The selected project is no longer available; choose an available owner project.",
        outcome: "noop",
      });
      return;
    }
    if (result.status === "unchanged") {
      await ctx.log({
        action: "waiting_for_project_update",
        summary: "Project inputs changed during the check; no duplicate draft was created.",
        outcome: "noop",
      });
      return;
    }
    if (result.status === "invalid") {
      await ctx.log({
        action: "draft_rejected",
        summary: "Creative Work rejected an unsafe or incomplete prototype; nothing was saved.",
        outcome: "error",
      });
      return;
    }

    await ctx.log({
      action: "draft_created",
      summary: "A review-only plan and offline prototype are ready in the selected project.",
      outcome: "success",
    });
  } catch {
    await ctx.log({
      action: "draft_failed",
      summary: "Creative Work could not finish this project draft; no publish or deployment was attempted.",
      outcome: "error",
      detail: { check: "draft_generation" },
    });
  }
};
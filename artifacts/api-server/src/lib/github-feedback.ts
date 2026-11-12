import { ReplitConnectors } from "@replit/connectors-sdk";
import { db, feedbackReportsTable } from "@workspace/db";
import { and, eq, or } from "drizzle-orm";

const GITHUB_OWNER = "PICASSOOOOOO";
const GITHUB_REPOSITORY = "salaryman";
const GITHUB_LABEL = "salaryman-feedback";

type FeedbackReport = typeof feedbackReportsTable.$inferSelect;

function githubIssueBody(report: FeedbackReport): string {
  const source = report.kind === "error_report" ? "Automatic browser error report" : "SALARYMAN feedback";
  const metadata = [
    `- **Internal report:** #${report.id}`,
    `- **Category:** ${report.category}`,
    `- **Kind:** ${report.kind}`,
    `- **Created:** ${report.createdAt.toISOString()}`,
    report.appVersion ? `- **App version:** ${report.appVersion}` : null,
    report.occurrenceCount > 1 ? `- **Occurrences:** ${report.occurrenceCount}` : null,
  ].filter(Boolean).join("\n");

  return [
    `## ${source}`,
    "",
    metadata,
    "",
    report.description,
    "",
    "---",
    "This issue was created automatically by SALARYMAN. Triage status remains authoritative in the internal feedback inbox.",
  ].join("\n");
}

function issueTitle(report: FeedbackReport): string {
  const prefix = report.kind === "error_report" ? "[auto-error]" : "[feedback]";
  return `${prefix} ${report.title}`.slice(0, 256);
}

async function updateSyncFailure(id: number, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await db.update(feedbackReportsTable).set({
    githubSyncStatus: "failed",
    githubSyncError: message.slice(0, 2000),
    updatedAt: new Date(),
  }).where(eq(feedbackReportsTable.id, id));
}

export async function syncFeedbackReportToGithub(report: FeedbackReport): Promise<{
  status: "synced" | "failed" | "pending";
  issueNumber?: number;
  issueUrl?: string;
  error?: string;
}> {
  if (report.githubIssueNumber && report.githubIssueUrl) {
    return {
      status: "synced",
      issueNumber: report.githubIssueNumber,
      issueUrl: report.githubIssueUrl,
    };
  }

  try {
    // Claim the row before calling GitHub. This prevents a retry button and
    // the original submission from creating two issues for the same report.
    const [claimed] = await db.update(feedbackReportsTable).set({
      githubSyncStatus: "syncing",
      githubSyncError: null,
      updatedAt: new Date(),
    }).where(and(
      eq(feedbackReportsTable.id, report.id),
      or(
        eq(feedbackReportsTable.githubSyncStatus, "pending"),
        eq(feedbackReportsTable.githubSyncStatus, "failed"),
      ),
    )).returning({ id: feedbackReportsTable.id });
    if (!claimed) {
      const [current] = await db.select({
        issueNumber: feedbackReportsTable.githubIssueNumber,
        issueUrl: feedbackReportsTable.githubIssueUrl,
        status: feedbackReportsTable.githubSyncStatus,
      }).from(feedbackReportsTable).where(eq(feedbackReportsTable.id, report.id)).limit(1);
      if (current?.issueNumber && current.issueUrl) {
        return { status: "synced", issueNumber: current.issueNumber, issueUrl: current.issueUrl };
      }
      return { status: "pending" };
    }

    const connectors = new ReplitConnectors();
    const response = await connectors.proxy(
      "github",
      `/repos/${GITHUB_OWNER}/${GITHUB_REPOSITORY}/issues`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "SALARYMAN-feedback-sync",
        },
        body: JSON.stringify({
          title: issueTitle(report),
          body: githubIssueBody(report),
          labels: [GITHUB_LABEL],
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`GitHub returned ${response.status}${detail ? `: ${detail.slice(0, 500)}` : ""}`);
    }

    const issue = await response.json() as { number?: unknown; html_url?: unknown };
    const issueNumber = Number(issue.number);
    const issueUrl = typeof issue.html_url === "string" ? issue.html_url : "";
    if (!Number.isInteger(issueNumber) || !issueUrl) {
      throw new Error("GitHub response did not include an issue number and URL");
    }

    await db.update(feedbackReportsTable).set({
      githubIssueNumber: issueNumber,
      githubIssueUrl: issueUrl,
      githubSyncStatus: "synced",
      githubSyncError: null,
      githubSyncedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(feedbackReportsTable.id, report.id));

    return { status: "synced", issueNumber, issueUrl };
  } catch (error) {
    await updateSyncFailure(report.id, error);
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Feedback] GitHub sync failed for report ${report.id}:`, message);
    return { status: "failed", error: message.slice(0, 2000) };
  }
}

export async function syncFeedbackReportById(id: number): Promise<{
  status: "synced" | "failed" | "pending";
  issueNumber?: number;
  issueUrl?: string;
  error?: string;
}> {
  const [report] = await db.select().from(feedbackReportsTable).where(eq(feedbackReportsTable.id, id)).limit(1);
  if (!report) return { status: "failed", error: "Feedback report not found" };
  return syncFeedbackReportToGithub(report);
}
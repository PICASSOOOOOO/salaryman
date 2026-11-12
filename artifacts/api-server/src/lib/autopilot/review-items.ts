export function buildFollowUpTaskDraft(leadName: string, sourceSummary: string): {
  title: string;
  description: string;
} {
  const cleanName = leadName.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) || "Lead";
  const cleanSummary = sourceSummary.replace(/\u0000/g, "").trim().slice(0, 6000);
  return {
    title: `Follow up with ${cleanName} after call`.slice(0, 300),
    description: `Suggested from the completed CRM call.\n\nCall summary:\n${cleanSummary}`,
  };
}

export type PhoneHealthStatus = "PASS" | "WARN" | "FAIL";

export function classifyTollfreeVerificationStatus(
  rawStatus: unknown,
  rejectionReason?: string | null,
): { status: PhoneHealthStatus; detail: string } {
  const status = String(rawStatus ?? "");

  if (status === "TWILIO_APPROVED") {
    return { status: "PASS", detail: "Sender approved by Twilio" };
  }

  if (
    status === "IN_REVIEW"
    || status === "PENDING_REVIEW"
    || status === "PENDING"
    || status === "IN_PROGRESS"
  ) {
    return {
      status: "WARN",
      detail: `Sender verification status is ${status}; SMS delivery may remain limited until Twilio approves the submission`,
    };
  }

  if (status === "TWILIO_REJECTED") {
    return {
      status: "WARN",
      detail: `Sender verification was rejected${rejectionReason ? `: ${rejectionReason}` : ""}; toll-free SMS may be unavailable until Twilio approves it`,
    };
  }

  return {
    status: "FAIL",
    detail: status
      ? `Unexpected sender verification status: ${status}${rejectionReason ? `: ${rejectionReason}` : ""}`
      : "No toll-free verification record exists",
  };
}

const PABLO_REQUEST_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPabloRequestId(value: unknown): value is string {
  return typeof value === "string" && PABLO_REQUEST_ID_RE.test(value);
}

export function safePabloErrorFields(error: unknown): {
  errorName: string;
  errorCode?: string;
  upstreamStatus?: number;
} {
  const details =
    typeof error === "object" && error !== null
      ? error as { name?: unknown; code?: unknown; status?: unknown; statusCode?: unknown }
      : {};
  const rawName = details.name;
  const errorName =
    typeof rawName === "string" && /^[A-Za-z][A-Za-z0-9_.]{0,47}$/.test(rawName)
      ? rawName
      : error instanceof Error
        ? "Error"
        : "UnknownError";
  const errorCode =
    typeof details.code === "string" && /^[A-Z][A-Z0-9_]{0,31}$/.test(details.code)
      ? details.code
      : undefined;
  const rawStatus = details.status ?? details.statusCode;
  const upstreamStatus =
    typeof rawStatus === "number" &&
    Number.isInteger(rawStatus) &&
    rawStatus >= 400 &&
    rawStatus <= 599
      ? rawStatus
      : undefined;

  return {
    errorName,
    ...(errorCode ? { errorCode } : {}),
    ...(upstreamStatus ? { upstreamStatus } : {}),
  };
}
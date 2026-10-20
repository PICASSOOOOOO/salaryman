export const types = {
  isNativeError: (value: unknown): value is Error => value instanceof Error,
};

export function formatWithOptions(_options: unknown, ...values: unknown[]) {
  return values.map((value) => {
    if (typeof value === "string") return value;
    if (value instanceof Error) return value.stack ?? value.message;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }).join(" ");
}

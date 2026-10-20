export function normalize(value: string) {
  const absolute = value.startsWith("/");
  const parts: string[] = [];
  for (const part of value.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === ".." && parts.length && parts[parts.length - 1] !== "..") parts.pop();
    else if (part !== ".." || !absolute) parts.push(part);
  }
  const result = `${absolute ? "/" : ""}${parts.join("/")}` || (absolute ? "/" : ".");
  return value.endsWith("/") && result !== "/" ? `${result}/` : result;
}

import type { OrgCustomAppField } from "@workspace/db";

export function slugBase(name: string): string {
  const value = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 88);
  return value || "custom-app";
}

export function validateFields(fields: OrgCustomAppField[]): string | null {
  const seen = new Set<string>();
  for (const field of fields) {
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(field.key)) {
      return `Field key for "${field.label}" is invalid`;
    }
    if (!field.label.trim()) return "Every field needs a label";
    if (seen.has(field.key)) return `Field key "${field.key}" is duplicated`;
    seen.add(field.key);
    const options = field.options ?? [];
    if (field.type === "select" && options.length === 0) {
      return `Add at least one option for "${field.label}"`;
    }
    if (field.type !== "select" && options.length > 0) {
      return `Options are only supported for select fields ("${field.label}")`;
    }
    if (new Set(options).size !== options.length) {
      return `Options for "${field.label}" must be unique`;
    }
    if (options.some((option) => !option.trim())) {
      return `Options for "${field.label}" cannot be blank`;
    }
  }
  return null;
}

export function normalizeFields(fields: OrgCustomAppField[]): OrgCustomAppField[] {
  return fields.map((field) => ({
    ...field,
    key: field.key.trim(),
    label: field.label.trim(),
    placeholder: field.placeholder?.trim() || undefined,
    options: field.type === "select"
      ? (field.options ?? []).map((option) => option.trim())
      : undefined,
  }));
}

export function validateSchemaUpdate(
  currentFields: OrgCustomAppField[],
  nextFields: OrgCustomAppField[],
): string | null {
  const nextByKey = new Map(nextFields.map((field) => [field.key, field]));
  for (const current of currentFields) {
    const next = nextByKey.get(current.key);
    if (!next) {
      return `Cannot remove "${current.label}" after records exist. Keep the field or add a replacement.`;
    }
    if (next.type !== current.type) {
      return `Cannot change the type of "${current.label}" after records exist. Add a new field instead.`;
    }
    if (!current.required && next.required) {
      return `Cannot make "${current.label}" required after records exist.`;
    }
    if (
      current.type === "select" &&
      (current.options ?? []).some((option) => !(next.options ?? []).includes(option))
    ) {
      return `Existing choices for "${current.label}" cannot be removed after records exist.`;
    }
  }
  if (nextFields.some((field) => !currentFields.some((current) => current.key === field.key) && field.required)) {
    return "New fields must be optional after records exist.";
  }
  return null;
}

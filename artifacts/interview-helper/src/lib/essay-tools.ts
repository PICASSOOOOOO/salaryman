export type EssayPlan = {
  assignment: string;
  thesis: string;
  outline: string;
  argument: string;
  evidence: string;
  revisionGoal: string;
};

export type EssaySource = {
  id: string;
  type: "book" | "journal" | "website";
  authors: string;
  authorIsOrganization?: boolean;
  title: string;
  containerTitle: string;
  publisher: string;
  year: string;
  month: string;
  day: string;
  volume: string;
  issue: string;
  pages: string;
  doi: string;
  url: string;
  accessedDate: string;
  pageNumber: string;
};

export type EssayCitationStyle = "APA7" | "MLA9";

export type EssaySuggestion = {
  id: string;
  original: string;
  replacement: string;
  category: "grammar" | "clarity" | "structure" | "style" | "tone";
  explanation: string;
};

export type EssayCitationPreview = {
  inText: string;
  reference: string;
  warnings: string[];
};

export const EMPTY_ESSAY_PLAN: EssayPlan = {
  assignment: "",
  thesis: "",
  outline: "",
  argument: "",
  evidence: "",
  revisionGoal: "",
};

function clean(value: string): string {
  return value.trim();
}

function authorNames(raw: string): string[] {
  return raw.split(";").map(clean).filter(Boolean);
}

function splitName(raw: string): { family: string; given: string } {
  const name = clean(raw);
  const comma = name.indexOf(",");
  if (comma >= 0) {
    return { family: clean(name.slice(0, comma)), given: clean(name.slice(comma + 1)) };
  }
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { family: name, given: "" };
  return { family: parts[parts.length - 1], given: parts.slice(0, -1).join(" ") };
}

function initials(given: string): string {
  return given
    .split(/[\s.-]+/)
    .filter(Boolean)
    .map((part) => `${part[0].toUpperCase()}.`)
    .join(" ");
}

function apaAuthor(raw: string, isOrganization = false): string {
  if (isOrganization) return clean(raw);
  const { family, given } = splitName(raw);
  const suffix = given.match(/,\s*(Jr\.?|Sr\.?|II|III|IV)$/i)?.[1];
  const givenWithoutSuffix = suffix ? given.replace(/,\s*(Jr\.?|Sr\.?|II|III|IV)$/i, "") : given;
  const name = [family, initials(givenWithoutSuffix)].filter(Boolean).join(", ");
  return suffix ? `${name}, ${suffix}` : name;
}

function mlaAuthor(raw: string, isOrganization = false): string {
  if (isOrganization) return clean(raw);
  const { family, given } = splitName(raw);
  return given ? `${family}, ${given}` : family;
}

function joinApaAuthors(authors: string[], isOrganization: boolean): string {
  if (authors.length > 20) {
    const firstNineteen = authors.slice(0, 19).map(author => apaAuthor(author, isOrganization));
    return `${firstNineteen.join(", ")}, ... ${apaAuthor(authors[authors.length - 1], isOrganization)}`;
  }
  const formatted = authors.map(author => apaAuthor(author, isOrganization));
  if (formatted.length <= 1) return formatted[0] ?? "";
  if (formatted.length === 2) return `${formatted[0]}, & ${formatted[1]}`;
  return `${formatted.slice(0, -1).join(", ")}, & ${formatted[formatted.length - 1]}`;
}

function displayAuthor(authors: string[], style: EssayCitationStyle, isOrganization: boolean): string {
  if (!authors.length) return "";
  const familyNames = authors.map(author => isOrganization ? clean(author) : splitName(author).family);
  if (style === "APA7") {
    if (authors.length >= 3) return `${familyNames[0]} et al.`;
    return familyNames.length === 2 ? `${familyNames[0]} & ${familyNames[1]}` : familyNames[0];
  }
  if (authors.length >= 3) return `${familyNames[0]} et al.`;
  if (authors.length === 2) {
    return `${familyNames[0]} and ${familyNames[1]}`;
  }
  return familyNames[0];
}

function apaDate(source: EssaySource): string {
  if (!source.year.trim()) return "";
  const monthDay = [clean(source.month), clean(source.day)].filter(Boolean);
  return `(${clean(source.year)}${monthDay.length ? `, ${monthDay.join(" ")}` : ""})`;
}

function mlaDate(source: EssaySource): string {
  const parts = [clean(source.day), clean(source.month), clean(source.year)].filter(Boolean);
  return parts.join(" ");
}

function apaReference(source: EssaySource, authors: string[]): string {
  const authorText = joinApaAuthors(authors, Boolean(source.authorIsOrganization));
  const date = apaDate(source);
  const title = clean(source.title);
  const container = clean(source.containerTitle);
  const publisher = clean(source.publisher);
  const pages = clean(source.pages);
  const volumeIssue = [
    clean(source.volume),
    source.issue.trim() ? `(${clean(source.issue)})` : "",
  ].filter(Boolean).join("");
  const link = clean(source.doi)
    ? (source.doi.startsWith("http") ? clean(source.doi) : `https://doi.org/${clean(source.doi).replace(/^doi:\s*/i, "")}`)
    : clean(source.url);

  if (source.type === "journal") {
    return [
      authorText,
      date,
      title ? `${title}.` : "",
      container ? `${container}${volumeIssue ? `, ${volumeIssue}` : ""}${pages ? `, ${pages}` : ""}.` : "",
      link ? `${link}.` : "",
    ].filter(Boolean).join(" ");
  }
  if (source.type === "website") {
    return [
      authorText,
      date ? `${date}.` : "",
      title ? `${title}.` : "",
      container ? `${container}.` : "",
      link ? `${link}.` : "",
    ].filter(Boolean).join(" ");
  }
  return [
    authorText,
    date ? `${date}.` : "",
    title ? `${title}.` : "",
    publisher ? `${publisher}.` : "",
  ].filter(Boolean).join(" ");
}

function mlaReference(source: EssaySource, authors: string[]): string {
  let authorText = "";
  if (authors.length === 1) authorText = mlaAuthor(authors[0], Boolean(source.authorIsOrganization));
  else if (authors.length === 2) {
    const first = mlaAuthor(authors[0], Boolean(source.authorIsOrganization));
    const second = mlaAuthor(authors[1], Boolean(source.authorIsOrganization));
    authorText = `${first}, and ${second}`;
  } else if (authors.length > 2) {
    authorText = `${mlaAuthor(authors[0], Boolean(source.authorIsOrganization))}, et al.`;
  }

  const title = clean(source.title);
  const container = clean(source.containerTitle);
  const publisher = clean(source.publisher);
  const date = mlaDate(source);
  const volumeIssue = [
    source.volume.trim() ? `vol. ${clean(source.volume)}` : "",
    source.issue.trim() ? `no. ${clean(source.issue)}` : "",
  ].filter(Boolean).join(", ");
  const link = clean(source.doi)
    ? (source.doi.startsWith("http") ? clean(source.doi) : `https://doi.org/${clean(source.doi).replace(/^doi:\s*/i, "")}`)
    : clean(source.url);
  const fields: string[] = [];
  if (authorText) fields.push(`${authorText}.`);
  if (source.type === "journal") {
    if (title) fields.push(`"${title}."`);
    const journalParts = [
      container,
      volumeIssue ? `vol. ${clean(source.volume)}${source.issue.trim() ? `, no. ${clean(source.issue)}` : ""}` : "",
      date,
      source.pages.trim() ? `pp. ${clean(source.pages)}` : "",
    ].filter(Boolean);
    if (journalParts.length) fields.push(`${journalParts.join(", ")}.`);
  } else {
    if (title) fields.push(`${title}.`);
    if (source.type === "website" && container) fields.push(`${container},`);
    if (publisher) fields.push(`${publisher}${date ? `, ${date}` : ""}.`);
    else if (date) fields.push(`${date}.`);
  }
  if (link) fields.push(`${link}.`);
  if (source.type === "website" && source.accessedDate.trim()) {
    fields.push(`Accessed ${clean(source.accessedDate)}.`);
  }
  return fields.join(" ").replace(/\s+,/g, ",").replace(/,\s*\./g, ".");
}

const REQUIRED_FIELDS: Record<EssaySource["type"], Array<[keyof EssaySource, string]>> = {
  book: [
    ["authors", "Add the author or organization."],
    ["title", "Add the book title."],
    ["publisher", "Add the publisher."],
    ["year", "Add the publication year."],
  ],
  journal: [
    ["authors", "Add the author or organization."],
    ["title", "Add the article title."],
    ["containerTitle", "Add the journal title."],
    ["year", "Add the publication year."],
    ["volume", "Add the journal volume if listed."],
    ["pages", "Add the page range if listed."],
  ],
  website: [
    ["authors", "Add the author or organization."],
    ["title", "Add the page title."],
    ["containerTitle", "Add the website name."],
    ["year", "Add the publication date if listed."],
    ["url", "Add the source URL."],
  ],
};

export function formatEssayCitation(
  source: EssaySource,
  style: EssayCitationStyle,
): EssayCitationPreview {
  const authors = authorNames(source.authors);
  const author = displayAuthor(authors, style, Boolean(source.authorIsOrganization));
  const titleFallback = clean(source.title);
  const citationAuthor = author || (titleFallback ? `"${titleFallback}"` : "");
  const date = style === "APA7" ? clean(source.year) : "";
  const page = clean(source.pageNumber);
  const inText = citationAuthor
    ? style === "APA7"
      ? `(${citationAuthor}${date ? `, ${date}` : ""}${page ? `, p. ${page}` : ""})`
      : `(${citationAuthor}${page ? ` ${page}` : ""})`
    : "";
  const warnings = REQUIRED_FIELDS[source.type]
    .filter(([field]) => !String(source[field] ?? "").trim())
    .map(([, warning]) => warning);
  if (!citationAuthor) warnings.unshift("Add an author or title before inserting an in-text citation.");
  return {
    inText,
    reference: style === "APA7" ? apaReference(source, authors) : mlaReference(source, authors),
    warnings: [...new Set(warnings)],
  };
}

export function formatEssayDocument(
  title: string,
  body: string,
  sources: EssaySource[],
  style: EssayCitationStyle,
): string {
  const heading = style === "APA7" ? "References" : "Works Cited";
  const references = sources
    .map((source) => formatEssayCitation(source, style).reference)
    .filter(Boolean)
    .sort((first, second) => first.localeCompare(second, undefined, { sensitivity: "base" }));
  return [
    clean(title) || "Untitled essay",
    "",
    body.trim(),
    ...(references.length ? ["", heading, "", ...references.flatMap((reference) => [reference, ""])] : []),
  ].join("\n").trimEnd() + "\n";
}

export function parseEssaySuggestions(raw: string): Omit<EssaySuggestion, "id">[] {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(text) as unknown;
  const candidates = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { suggestions?: unknown }).suggestions)
      ? (parsed as { suggestions: unknown[] }).suggestions
      : [];
  const valid: Omit<EssaySuggestion, "id">[] = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as Record<string, unknown>;
    const category = item.category;
    if (
      typeof item.original !== "string" ||
      !item.original.trim() ||
      typeof item.replacement !== "string" ||
      typeof item.explanation !== "string" ||
      !item.explanation.trim() ||
      (category !== "grammar" &&
        category !== "clarity" &&
        category !== "structure" &&
        category !== "style" &&
        category !== "tone")
    ) continue;
    valid.push({
      original: item.original,
      replacement: item.replacement,
      category,
      explanation: item.explanation,
    });
  }
  return valid.slice(0, 20);
}

export type SuggestionApplyResult =
  | { ok: true; content: string }
  | { ok: false; reason: "empty" | "missing" | "ambiguous" };

export function applyEssaySuggestion(
  content: string,
  suggestion: Pick<EssaySuggestion, "original" | "replacement">,
): SuggestionApplyResult {
  if (!suggestion.original) return { ok: false, reason: "empty" };
  const firstIndex = content.indexOf(suggestion.original);
  if (firstIndex < 0) return { ok: false, reason: "missing" };
  if (content.indexOf(suggestion.original, firstIndex + suggestion.original.length) >= 0) {
    return { ok: false, reason: "ambiguous" };
  }
  return {
    ok: true,
    content: content.slice(0, firstIndex) + suggestion.replacement + content.slice(firstIndex + suggestion.original.length),
  };
}

export function applyAllWritingSuggestions(
  content: string,
  suggestions: Array<Pick<EssaySuggestion, "original" | "replacement">>,
): { content: string; applied: number; skipped: number } {
  const candidates: Array<{ start: number; end: number; replacement: string }> = [];
  let skipped = 0;
  for (const suggestion of suggestions) {
    if (!suggestion.original) {
      skipped += 1;
      continue;
    }
    const start = content.indexOf(suggestion.original);
    if (start < 0 || content.indexOf(suggestion.original, start + suggestion.original.length) >= 0) {
      skipped += 1;
      continue;
    }
    candidates.push({
      start,
      end: start + suggestion.original.length,
      replacement: suggestion.replacement,
    });
  }

  candidates.sort((a, b) => a.start - b.start);
  const nonOverlapping: typeof candidates = [];
  for (const candidate of candidates) {
    const previous = nonOverlapping.at(-1);
    if (previous && previous.end > candidate.start) {
      skipped += 1;
      continue;
    }
    nonOverlapping.push(candidate);
  }

  let next = content;
  for (const candidate of nonOverlapping.reverse()) {
    next = next.slice(0, candidate.start) + candidate.replacement + next.slice(candidate.end);
  }
  return { content: next, applied: nonOverlapping.length, skipped };
}

import { describe, expect, it } from "vitest";
import {
  applyEssaySuggestion,
  formatEssayCitation,
  formatEssayDocument,
  parseEssaySuggestions,
  type EssaySource,
} from "./essay-tools";

const source: EssaySource = {
  id: "source-1",
  type: "book",
  authors: "Jane Doe",
  title: "Writing with Evidence",
  containerTitle: "",
  publisher: "Example Press",
  year: "2022",
  month: "",
  day: "",
  volume: "",
  issue: "",
  pages: "",
  doi: "",
  url: "",
  accessedDate: "",
  pageNumber: "7",
};

describe("Hemingway academic writing helpers", () => {
  it("formats APA 7 and MLA 9 citations from supplied source details", () => {
    const apa = formatEssayCitation(source, "APA7");
    expect(apa.inText).toBe("(Doe, 2022, p. 7)");
    expect(apa.reference).toBe("Doe, J. (2022). Writing with Evidence. Example Press.");
    expect(apa.warnings).toEqual([]);

    const mla = formatEssayCitation(source, "MLA9");
    expect(mla.inText).toBe("(Doe 7)");
    expect(mla.reference).toBe("Doe, Jane. Writing with Evidence. Example Press, 2022.");
  });

  it("flags missing fields and never invents a missing source identity", () => {
    const incomplete = { ...source, authors: "", title: "", publisher: "", year: "" };
    const preview = formatEssayCitation(incomplete, "APA7");
    expect(preview.inText).toBe("");
    expect(preview.reference).toBe("");
    expect(preview.warnings).toContain("Add the author or organization.");
    expect(preview.warnings).toContain("Add the book title.");
    expect(preview.warnings).toContain("Add the publication year.");
  });

  it("formats journal details and uses a supplied DOI without claiming source access", () => {
    const journal: EssaySource = {
      ...source,
      type: "journal",
      title: "Evidence in Practice",
      containerTitle: "Journal of Writing",
      volume: "12",
      issue: "3",
      pages: "41-58",
      doi: "10.1234/example.56",
      url: "",
    };
    const preview = formatEssayCitation(journal, "APA7");
    expect(preview.reference).toContain("Journal of Writing, 12(3), 41-58.");
    expect(preview.reference).toContain("https://doi.org/10.1234/example.56.");
    expect(preview.warnings).toEqual([]);
  });

  it("formats two authors and preserves group authors as organizations", () => {
    const coauthored = { ...source, authors: "Jane Doe; John Smith" };
    expect(formatEssayCitation(coauthored, "APA7").inText).toBe("(Doe & Smith, 2022, p. 7)");
    expect(formatEssayCitation(coauthored, "MLA9").inText).toBe("(Doe and Smith 7)");

    const organization = {
      ...source,
      authors: "World Health Organization",
      authorIsOrganization: true,
      pageNumber: "",
    };
    expect(formatEssayCitation(organization, "APA7").inText).toBe("(World Health Organization, 2022)");
    expect(formatEssayCitation(organization, "APA7").reference)
      .toBe("World Health Organization (2022). Writing with Evidence. Example Press.");
  });

  it("exports an essay body and only supplied reference entries", () => {
    const text = formatEssayDocument("My Essay", "A supported claim.", [source], "MLA9");
    expect(text).toContain("My Essay\n\nA supported claim.");
    expect(text).toContain("Works Cited");
    expect(text).toContain("Doe, Jane. Writing with Evidence.");
  });

  it("parses bounded proofreading suggestions and ignores malformed entries", () => {
    const parsed = parseEssaySuggestions(JSON.stringify({
      suggestions: [
        { original: "The policy improve", replacement: "The policy improves", category: "grammar", explanation: "Match the verb to its singular subject." },
        { original: "", replacement: "x", category: "clarity", explanation: "Empty excerpt." },
        { original: "bad", replacement: "good", category: "authorship", explanation: "Invalid category." },
      ],
    }));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].category).toBe("grammar");
  });

  it("applies only a single exact match and leaves missing or ambiguous text unchanged", () => {
    expect(applyEssaySuggestion("The policy improve access.", {
      original: "policy improve",
      replacement: "policy improves",
    })).toEqual({ ok: true, content: "The policy improves access." });

    expect(applyEssaySuggestion("An unchanged paragraph.", {
      original: "policy improve",
      replacement: "policy improves",
    })).toEqual({ ok: false, reason: "missing" });

    expect(applyEssaySuggestion("The policy improve; the policy improve.", {
      original: "policy improve",
      replacement: "policy improves",
    })).toEqual({ ok: false, reason: "ambiguous" });
  });
});

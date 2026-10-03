import { describe, expect, it } from "vitest";
import { parseGeneratedWorkspaceDraft } from "../lib/pablo-creation";

const safePrototype = `<!doctype html>
<html><head><meta charset="utf-8"><title>Local prototype</title></head>
<body><button id="toggle">Open</button><p id="state">Ready</p>
<script>document.querySelector("#toggle").onclick = () => { document.querySelector("#state").textContent = "Updated"; };</script>
</body></html>`;

function asModelResponse(prototype: string) {
  return JSON.stringify({
    plan: "First milestone: make the main interaction work. Then review the layout and collect feedback.",
    prototype,
  });
}

describe("parseGeneratedWorkspaceDraft", () => {
  it("accepts complete self-contained HTML with local interaction", () => {
    const parsed = parseGeneratedWorkspaceDraft(`\`\`\`json\n${asModelResponse(safePrototype)}\n\`\`\``);
    expect(parsed?.prototype).toContain("<html>");
  });

  it("rejects malformed JSON and incomplete documents", () => {
    expect(parseGeneratedWorkspaceDraft("not json")).toBeNull();
    expect(parseGeneratedWorkspaceDraft(asModelResponse("<main>Not a document</main>"))).toBeNull();
  });

  it("rejects network access and external resources", () => {
    expect(parseGeneratedWorkspaceDraft(asModelResponse(
      safePrototype.replace("</body>", "<script>fetch('/api/private')</script></body>"),
    ))).toBeNull();
    expect(parseGeneratedWorkspaceDraft(asModelResponse(
      safePrototype.replace("</head>", '<script src="//cdn.example.test/app.js"></script></head>'),
    ))).toBeNull();
  });
});
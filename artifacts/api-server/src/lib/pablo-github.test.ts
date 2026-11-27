import { describe, expect, it } from "vitest";
import { readGithubRepositoryFile, readGithubRepositoryFiles } from "./pablo-github";

describe("Pablo GitHub file access", () => {
  it.each([
    "../package.json",
    "/etc/passwd",
    ".github/workflows/deploy.yml",
    "nested/.github/workflows/deploy.yml",
  ])("rejects unsafe repository paths before accessing GitHub: %s", async (path) => {
    await expect(readGithubRepositoryFile("user", "123", path))
      .rejects.toMatchObject({ status: 400 });
  });

  it("validates every multi-file path before accessing the selected repository", async () => {
    await expect(readGithubRepositoryFiles("user", "123", ["README.md", "../package.json"]))
      .rejects.toMatchObject({ status: 400 });
  });

  it("rejects duplicate entries in multi-file reads", async () => {
    await expect(readGithubRepositoryFiles("user", "123", ["README.md", "README.md"]))
      .rejects.toMatchObject({ status: 400 });
  });
});

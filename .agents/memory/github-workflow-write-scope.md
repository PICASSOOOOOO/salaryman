---
name: GitHub workflow write scope
description: GitHub connector limitation encountered when synchronizing source and CI workflow files.
---

The user wants each completed workspace update synced to the connected GitHub
repository.

**Why:** the user asked for project updates to stay synchronized with GitHub.

**How to apply:** include a GitHub sync in each completed change where the
connection permits it. Verify the change first, never expose credentials, and
handle protected workflow files through the required separate permission path.

The regular GitHub connector may read and administer a repository yet reject
tree entries under `.github/workflows` with 403/404 responses. Treat workflow
files as a separately privileged write.

**Why:** GitHub protects workflow modification behind a dedicated permission
that is not implied by ordinary repository push/admin access.

**How to apply:** Sync normal source through the connector, stage the workflow
YAML at an ordinary repository path, and have the repository owner move it into
`.github/workflows` in GitHub's web editor. A valid fine-grained token with the
required workflow permissions is the alternative.

For ordinary source-file syncs, Git Database POSTs can fail through the
connector even when reads work. The documented Contents API `PUT
/repos/{owner}/{repo}/contents/{path}` succeeded when calls were serialized;
read the current blob SHA before replacing a file and omit it for new files.

**Why:** Source synchronization was blocked by proxy 500s on Git blobs and
commits, while sequential Contents API writes succeeded.

**How to apply:** Prefer the configured GitHub connection's Contents API for
source updates, one file at a time. Never expose or store credential values.

Before syncing, compare the local and remote branch histories. If they have no
common base, ordinary fast-forward pushes and pull requests cannot carry the
workspace tree into the current default branch safely.

**Why:** This project's Replit and GitHub `main` branches were found to have
unrelated histories and thousands of differing files.

**How to apply:** Never replace the remote default branch without explicit user
approval. If the user approves replacement, first create and verify a backup
branch at the current remote head, then use a force-with-lease push so newer
remote commits cannot be overwritten silently.
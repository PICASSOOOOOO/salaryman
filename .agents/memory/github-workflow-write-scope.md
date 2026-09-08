---
name: GitHub workflow write scope
description: GitHub connector limitation encountered when synchronizing source and CI workflow files.
---

The regular GitHub connector may read and administer a repository yet reject
tree entries under `.github/workflows` with 403/404 responses. Treat workflow
files as a separately privileged write.

**Why:** GitHub protects workflow modification behind a dedicated permission
that is not implied by ordinary repository push/admin access.

**How to apply:** Sync normal source through the connector, stage the workflow
YAML at an ordinary repository path, and have the repository owner move it into
`.github/workflows` in GitHub's web editor. A valid fine-grained token with the
required workflow permissions is the alternative.
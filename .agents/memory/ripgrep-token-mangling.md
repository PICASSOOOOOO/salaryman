---
name: ripgrep token mangling in this repo
description: rg output corrupts identifiers here; use the read tool for exact text.
---

# ripgrep output mangles identifiers in this workspace

`rg` matches in this repo come back with identifiers replaced by placeholders like `ln` / `n` (e.g. `usersTable.ln`, `import n from "./chat"`). Line numbers and file lists are still reliable; the **token text is not**.

**How to apply:** use `rg`/`grep -n` to locate files and line numbers, then open the exact lines with the `read` tool before quoting or editing. Never copy an identifier straight out of rg output into an edit.

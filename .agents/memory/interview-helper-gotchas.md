---
name: interview-helper repo gotchas
description: Non-obvious environment quirks when working in artifacts/interview-helper
---

# Ripgrep output is mangled
In this repo `rg` returns CORRUPTED text — e.g. the word "desk" renders as "n",
"rent"/"lease" as "ln". **Do not trust rg's printed matches.** Use the `read`
tool, or `grep`/`awk` matching by literal content, to read actual file text.

**Why:** observed repeatedly; rg substitutes/garbles characters in this workspace.
**How to apply:** use rg only to locate that a string exists; verify exact
content + surrounding code with `read` or `awk`.

# WorldPlay.tsx line numbers disagree across tools
`grep -n` reports line numbers (e.g. ~22394) far beyond what the `read` tool
reports as the file length (~16662 lines). Trust nothing by line number in this
file — locate code by content (`awk '/PATTERN/{...}'`) before editing.

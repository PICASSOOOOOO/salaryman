---
name: ripgrep output mangling in interview-helper
description: Why rg text matches can't be trusted in this repo and what to do instead.
---

# ripgrep mangles tokens in the interview-helper artifact

In `artifacts/interview-helper`, ripgrep (`rg`) frequently garbles matched text
in its output — identifiers get scrambled (e.g. `<ProGate>` rendered as `<n>` /
`<ln>`, "asynchronously" → "asyninusly", building IDs collapsed to "in"). Match
counts and file lists are usually fine, but the printed line content is not
reliable.

**How to apply:** Use `rg` only to locate files / line numbers, then open them
with the `read` tool to see the true content before editing or drawing
conclusions. Never quote rg's printed line text as ground truth. For broad
multi-file understanding, prefer the explore subagent.

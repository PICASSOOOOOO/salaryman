---
name: Deployment build history
description: Distinguish the latest failed publish attempt from the still-active deployment.
---

Use deployment build history to diagnose a failed publish. `getDeploymentInfo().hasSuccessfulBuild` can describe the still-active prior deployment even when the newest attempt failed; check `listDeploymentBuilds()` and inspect the newest failed build. A candidate that never becomes ready may have no runtime logs, and its build log can stop at “Waiting for deployment to be ready.”

**Why:** A recent publish completed typecheck, artifact builds, image creation, and VM creation, then failed readiness while the previous live build continued serving traffic.

**How to apply:** Separate build-phase errors from readiness/promotion failures. If the candidate log stops while waiting and runtime logs are absent, do not change app code speculatively; request the exact final readiness error from the Publishing UI.
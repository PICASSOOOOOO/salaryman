---
name: Object storage ACL is effectively disabled
description: Why new endpoints that read /objects/ must NOT call canAccessObject(READ), and the safe ownership-guard pattern instead.
---

# Object storage ACL is effectively disabled project-wide

In api-server, object reads are **path-protected, not ACL-gated**:
- `routes/storage.ts` serves `/objects/:path` with the `canAccessObjectEntity` check **commented out** — anyone with a path can read any object.
- Avatar/upload flows (`/storage/uploads/request-url` → `/account/avatar`) store the raw objectPath and **never call `setObjectAclPolicy`**, so objects carry no ACL metadata.
- `canAccessObject({...})` in `lib/objectAcl.ts` returns **`false` when there is no ACL policy** (`if (!aclPolicy) return false`).

**Consequence / rule:** A new endpoint that reads a user's object (e.g. their `users.profileImageUrl`) must NOT gate on `canAccessObject(READ)` — every legitimate, policy-less avatar would 403 and the feature breaks.

**Safe pattern instead:** default-allow when no policy; only refuse when an object carries an *explicit* policy owned by a different user:
```ts
const aclPolicy = await getObjectAclPolicy(file);
if (aclPolicy && aclPolicy.visibility !== "public" && aclPolicy.owner && aclPolicy.owner !== req.user.id) {
  // deny
}
```
**Why:** matches the codebase's existing posture (no regressions) while still refusing explicitly-owned foreign objects. The real residual gap is that `/account/avatar` accepts any `/objects/...` string without verifying ownership at set-time — pre-existing, out of scope for feature work; revisit if locking down object access globally.

**How to apply:** any future server route that downloads an object the user "owns" by virtue of a DB pointer (avatar, attachments, etc.).

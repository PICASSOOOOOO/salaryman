# Organization connector calls and files API contract

**Status: Partial — `calls:read` and the organization document metadata schema
are implemented; `calls:write` and all documents/files routes remain proposals.**

This contract defines provider-independent behavior for organization connector
tokens. It does not connect STEC or any other provider, and a granted scope does
not mean its routes are live.

## Shared rules

- Base path: `/api/connectors/v1`.
- Authenticate with `Authorization: Bearer <organization connector token>`.
- Each request must use the token's active connection, active app, organization,
  and approved scopes. Never treat the connector as a SALARYMAN user or accept
  an organization ID from the request as authority.
- Every record lookup and mutation must include the token's organization in the
  database predicate. A resource from another organization returns `404`, not
  an existence-revealing response.
- The connector grant is the maximum access the app can receive. Actions that
  require a member, role, phone entitlement, or user consent must independently
  enforce those controls.
- List endpoints use bounded pagination (`limit` default 100, maximum 200) and
  return stable ordering. Reject malformed filters and unsupported write fields.
- Return `401` for a missing, invalid, inactive, or revoked token; `403` for a
  missing scope; `404` for an absent or out-of-organization resource; `400` for
  invalid input; and `409` for an idempotency conflict.
- Activity records may identify the app, operation, resource type, and outcome.
  Do not log bearer tokens, phone numbers, file contents, transcripts, notes,
  storage paths, or request payloads.

## Existing connector CRM contract

The following connector routes are implemented:

| Method | Path | Required scope |
| --- | --- | --- |
| `GET` | `/crm/leads` | `crm:read` |
| `GET` | `/crm/leads/{id}` | `crm:read` |
| `GET` | `/crm/custom-fields` | `crm:read` |
| `POST` | `/crm/leads` | `crm:write` |
| `PATCH` | `/crm/leads/{id}` | `crm:write` |
| `GET` | `/calls` | `calls:read` |

No delete operation is implied by `crm:write`.

## Calls

### `calls:read` — implemented

`GET /calls` returns organization CRM call and voicemail *metadata* only. It
must read from organization-scoped activity records and must not use a
user-owned call history row as proof of organization access.

Supported query parameters:

- `leadId`: optional lead ID; it must belong to the token organization.
- `channel`: `call` or `voicemail` only.
- `direction`: `inbound` or `outbound`.
- `limit` and `offset`: bounded pagination.

Proposed response:

```json
{
  "activities": [
    {
      "id": 842,
      "leadId": 19,
      "channel": "call",
      "direction": "outbound",
      "status": "completed",
      "durationSeconds": 94,
      "occurredAt": "2026-10-24T09:30:00.000Z"
    }
  ],
  "limit": 100,
  "offset": 0
}
```

The response deliberately excludes phone numbers, contact names, bodies,
summaries, transcripts, recordings and recording URLs, provider IDs, and
voicemail content. These fields can contain personal or sensitive information.
Access to them would need a separately reviewed scope and consent policy; it
must not be inferred from `calls:read`.

### `calls:write` — deferred pending product approval

Do not expose direct dialing, arbitrary destination numbers, recording controls,
or campaign/bulk calls through an organization token.

If SALARYMAN later supports connector-requested calls, the proposed operation is
`POST /calls/actions` with an organization-owned `leadId` and an
`Idempotency-Key`. It creates a pending request only; a signed-in, authorized
organization member must confirm it in SALARYMAN before the existing phone
system starts a call. The server chooses the permitted organization line and
destination from verified records. The connector cannot claim the confirming
user's identity or supply a raw destination number.

The exact response and expiry policy for pending actions need product approval.
Until then, `calls:write` has no callable route and cannot initiate a call.

## Documents and files

### Ownership prerequisite

The existing `files_folders` records are owned by `userId`, not by an
organization. They must not be returned, modified, or downloaded using an
organization connector token just because the user belongs to that organization.

#### Recommended ownership model

- Store organization documents as organization-owned records, separate from
  `files_folders`. The organization is the owner; `uploadedByUserId` is
  attribution only and must never determine connector authorization.
- Put `orgId` on every document and folder record. A parent folder must belong to
  the same organization. Every lookup, list, move, and content operation must
  constrain by the token organization in the database query.
- Keep personal files personal. Membership in an organization does not share a
  member's files; sharing or moving one into the organization must be an
  explicit, user-initiated copy/import into the organization document area.
- Keep document bytes in App Storage and metadata in PostgreSQL. Storage paths
  remain server-controlled and are never returned by the API.
- Preserve uploader attribution for audit, but do not make a connector call as
  that user. Connector activity is attributed to the app/connection.

#### Organization API preferences

The current connector model stores API preferences per organization-app
connection as `grantedScopes`. The organization owner selects a subset of the
app's requested scopes when approving it; `documents:read` and
`documents:write` are independent choices. Enforce those live grants on every
request. Revoking a connection or changing its grants must immediately remove
the corresponding access.

Do not add a second organization-wide document API preference or infer access
from organization membership. If SALARYMAN later introduces a separate
organization-level API setting, treat it as an additional gate, not a
replacement for the connection's granted scopes.

The `org_documents` metadata schema exists, but it does not provide storage,
upload/import, download, or connector routes. Before adding those routes, confirm
the member upload/import flow and any separate organization-level setting with
product and security owners. `documents:read` and `documents:write` still expose
no data routes.

### `documents:read` — proposed after the ownership prerequisite

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/documents` | List metadata for documents explicitly owned/shared with the token organization. |
| `GET` | `/documents/{id}` | Read one document's metadata after organization-scoped lookup. |
| `GET` | `/documents/{id}/content` | Stream the bytes after the same authorization check; never return an unrestricted storage URL. |

Metadata may include `id`, `name`, `parentId`, `isFolder`, `mimeType`,
`fileSize`, and timestamps. It must omit `userId`, raw object paths, storage
keys, public share tokens, and unrelated user-file metadata.

### `documents:write` — proposed after the ownership prerequisite

| Method | Path | Behavior |
| --- | --- | --- |
| `POST` | `/documents/uploads` | Create a short-lived upload intent for a validated organization folder and file metadata. |
| `POST` | `/documents/uploads/{uploadId}/complete` | Verify the uploaded object, then register it as an organization document. |
| `PATCH` | `/documents/{id}` | Update allow-listed metadata, such as a name or parent folder within the same organization. |

Upload creation and completion must be bound to the token organization, limited
by platform size/type rules, and safe to retry with an `Idempotency-Key`.
Upload/download capabilities, if used by the storage provider, must be short
lived and scoped to one object and one operation. Never accept a caller-chosen
object path or return a reusable public share token.

`documents:write` does not grant delete, public sharing, permission changes, or
access to a member's personal files.

## Implementation gates

Before enabling any remaining proposed route:

1. Have SALARYMAN product and security owners approve the data categories,
   member-consent flow, and organization document ownership model.
2. Keep the API provider-neutral. Do not claim STEC or another provider sync is
   connected until its counterpart API and supported operations actually exist.
3. Implement database-backed tests for scope denial, organization isolation,
   revoked/inactive tokens, and sensitive-field omission.
4. For call actions, test that no phone-provider call occurs before explicit
   member confirmation and that retries cannot create duplicate calls.
5. For files, test that user-owned files and cross-organization objects remain
   inaccessible and that upload/download capabilities expire and stay scoped.
6. Update the Platform API catalog only when the routes are mounted and verified.

---
name: Business data platform
description: Canonical organization-scoped storage for CRM entities and large files.
---

The business data foundation separates PostgreSQL metadata from App Storage bytes. Canonical org entities cover people, companies, leads, contacts, employees, vendors, and customers; contact points, relationships, files, documents, activities, and audit events attach to those entities. API access must resolve the caller's active organization and enforce live CRM permissions before reading or writing.

**Why:** SALARYMAN needs to support organizations with thousands of employees and large volumes of leads, contacts, phone numbers, documents, files, and videos without duplicating every feature into another bespoke table or placing binary content in PostgreSQL.

**How to apply:** Add new business records to the canonical data layer first, keep object paths and searchable metadata in PostgreSQL, paginate all org list queries, and migrate legacy feature tables incrementally rather than silently changing their existing contracts.
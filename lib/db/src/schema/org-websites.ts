import { pgTable, serial, varchar, text, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";

// ── Org websites ─────────────────────────────────────────────────────────────
// An org can connect its OWN published Framer site, which SALARYMAN serves under
// a path-based URL `/sites/<slug>` via a reverse proxy (Framer has no HTML
// export; reverse-proxy is its officially supported self-hosting path). One site
// per org. `slug` is the globally-unique URL path segment. `framerOrigin` is the
// org's published Framer URL (validated server-side for SSRF before it is ever
// fetched). Gated to orgs with a registered real business.
export const orgWebsitesTable = pgTable(
  "org_websites",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    slug: varchar("slug", { length: 40 }).notNull(),
    framerOrigin: text("framer_origin").notNull(),
    title: varchar("title", { length: 120 }),
    status: varchar("status", { length: 16 }).notNull().default("active"), // 'active' | 'disabled'
    createdByUserId: varchar("created_by_user_id", { length: 256 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("org_websites_org_id_unique_idx").on(t.orgId),
    uniqueIndex("org_websites_slug_unique_idx").on(t.slug),
    index("org_websites_status_idx").on(t.status),
  ]
);

export type OrgWebsite = typeof orgWebsitesTable.$inferSelect;
export type InsertOrgWebsite = typeof orgWebsitesTable.$inferInsert;

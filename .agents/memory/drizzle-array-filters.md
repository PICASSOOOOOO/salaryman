---
name: Drizzle array filters
description: Binding dynamic value lists in raw Drizzle SQL.
---

Drizzle expands interpolated JavaScript arrays into SQL tuples; they are not bound as PostgreSQL array literals. Dynamic `ANY(${values}::text[])` filters can therefore produce invalid SQL. Build a parameterized `IN` list with `sql.join(values.map((value) => sql`${value}`), sql`, `)` and handle empty lists explicitly.

**Why:** A development reset initially stopped at its first row-lock query because Drizzle emitted tuple syntax where PostgreSQL expected an array.

**How to apply:** For raw Drizzle SQL membership filters, use parameterized `IN` lists or a documented driver-level array binder; never assume tagged-template interpolation binds a JavaScript array as a PostgreSQL array.
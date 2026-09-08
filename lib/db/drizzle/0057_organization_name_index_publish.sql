-- Keep the canonical organization-name index valid in Replit's publish diff.
-- The POSIX whitespace class avoids the renderer issue with quoted \s+.
DROP INDEX IF EXISTS "organizations_name_canonical_unique_idx";
CREATE UNIQUE INDEX "organizations_name_canonical_unique_idx"
  ON "organizations" (lower(regexp_replace(btrim("name"), '[[:space:]]+', ' ', 'g')));
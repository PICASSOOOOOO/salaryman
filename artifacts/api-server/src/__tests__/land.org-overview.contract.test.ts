import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(process.cwd(), 'src/routes/land.ts'), 'utf8');

describe('organization construction overview route contract', () => {
  it('requires authentication and active membership before returning org projects', () => {
    const start = source.indexOf('router.get("/construction/org-overview"');
    const end = source.indexOf('router.get("/construction/org-labor-summary"', start);
    const route = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(route).toContain('requireAuth(req, res)');
    expect(route).toContain('eq(orgMembersTable.userId, userId)');
    expect(route).toContain('eq(orgMembersTable.orgId, orgId)');
    expect(route).toContain('eq(orgMembersTable.status, "active")');
    expect(route).toContain('eq(constructionProjectsTable.owningOrgId, String(orgId))');
  });

  it('leaves plot approval authorization on the existing server endpoints', () => {
    expect(source).toContain('router.post("/land/plots/:id/open"');
    expect(source).toContain('router.post("/land/plots/:id/close"');
    expect(source.match(/if \(!\(await canApprove\(userId\)\)\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
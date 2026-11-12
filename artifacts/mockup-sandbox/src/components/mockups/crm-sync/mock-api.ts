const sources = [{"id":18,"name":"Customer directory","provider":"rest","direction":"pull","configJson":{"endpoint":"https://crm.example.test/contacts","method":"GET","keyField":"email"},"credential":"configured"},{"id":21,"name":"Pipeline tracker","provider":"google_sheets","direction":"bidirectional","configJson":{"spreadsheetId":"sheet_demo_1234567890","range":"Contacts!A1:Z","keyField":"email"},"credential":"configured"}];
const conflicts = [{"id":2408,"connectionId":21,"leadId":1024,"createdAt":"2026-09-30T09:15:00.000Z","sourceSnapshotJson":{"name":"Ari Vega","email":"ari@example.test","phone":"+1 555 010 2408","company":"Northstar Studio","status":"qualified"},"crmSnapshotJson":{"name":"Ari Vega","email":"ari@example.test","phone":"+1 555 010 2408","company":"Northstar Studio","status":"contacted"}}];
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = String(init.method ?? 'GET').toUpperCase();
  let data: unknown = {};
  let status = 200;
  if (path.includes('/crm/sources') && method === 'GET') data = { sources };
  else if (path.includes('/crm/sync/conflicts') && method === 'GET') data = { conflicts };
  else if (path.includes('/crm/google/connect')) data = { authorizationUrl: 'https://accounts.google.com/' };
  else if (path.endsWith('/sync')) data = { created: 2, pulled: 12, pushed: 3, conflicts: 1 };
  else if (method === 'POST' && path.endsWith('/crm/sources')) status = 201;
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
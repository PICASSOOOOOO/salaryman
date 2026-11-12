import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const apiRoot = resolve(import.meta.dirname, "..");
const read = (relative: string) => readFileSync(resolve(apiRoot, relative), "utf8");

describe("CRM telephony coverage", () => {
  it("routes every supported SMS sender through the shared recorder", () => {
    const campaigns = read("routes/campaigns.ts");
    const crm = read("routes/crm.ts");
    const telephony = read("lib/telephony-service.ts");
    const autopilot = read("lib/autopilot/crm-handler.ts");

    expect(campaigns).toMatch(/router\.post\("\/sms\/webhook\/inbound"/);
    expect(campaigns).toMatch(/recordTelephonyActivity\(\{/);
    expect(campaigns).toMatch(/orgId: ownerOrgId/);
    expect(campaigns).toMatch(/sendSmsMessage\(\{/);
    expect(crm).toMatch(/sendSmsMessage\(\{/);
    expect(telephony).toMatch(/recordTelephonyActivity\(\{/);
    expect(autopilot).toMatch(/orgId: ctx\.orgId/);
  });

  it("keeps voice status, recordings, and transcription on one deduped CRM contract", () => {
    const twilio = read("routes/twilio.ts");
    const recorder = read("lib/crm-recorder.ts");

    expect(twilio).toMatch(/router\.post\("\/twilio\/webhook\/status"/);
    expect(twilio).toMatch(/router\.post\("\/twilio\/webhook\/recording"/);
    expect(twilio).toMatch(/router\.post\("\/twilio\/webhook\/transcription"/);
    expect(twilio.match(/recordTelephonyActivity\(\{/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
    expect(recorder).toMatch(/eq\(crmActivitiesTable\.orgId, orgId\)/);
    expect(recorder).toMatch(/eq\(crmActivitiesTable\.twilioSid, opts\.twilioSid\)/);
    expect(recorder).toMatch(/let isNewActivity = activityId === null/);
  });
});
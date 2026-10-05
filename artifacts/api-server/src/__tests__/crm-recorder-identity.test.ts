import { describe, expect, it } from "vitest";
import {
  extractCallerIdentityEvidence,
  selectExistingCallLead,
} from "../lib/crm-recorder";

describe("call transcript identity evidence", () => {
  it("extracts only explicit Caller-labelled identity details", () => {
    const evidence = extractCallerIdentityEvidence([
      "Employee: My name is Alex Example. DOB is 1970-01-02.",
      "Caller: My name is Mai Nguyen. My date of birth is 1985-04-03. My email is mai@example.com. I work for Acme Clinic.",
    ].join("\n"));

    expect(evidence).toEqual({
      name: "Mai Nguyen",
      dateOfBirth: "1985-04-03",
      email: "mai@example.com",
      company: "Acme Clinic",
    });
  });

  it("ignores unlabeled identity details and ambiguous slash dates", () => {
    expect(extractCallerIdentityEvidence(
      "My name is Alex Example. My DOB is 1/2/1980.\nEmployee: I am not the caller.",
    )).toEqual({});
    expect(extractCallerIdentityEvidence(
      "Caller: My name is Alex Example. My DOB is 1/2/1980.",
    )).toEqual({ name: "Alex Example" });
  });

  it("does not merge people who only share a phone number", () => {
    const sharedPhoneLeads = [
      { id: 1, name: "Mai Nguyen", phone: "+15551234567", customFieldsJson: { dateOfBirth: "1985-04-03" } },
      { id: 2, name: "Alex Nguyen", phone: "+15551234567", customFieldsJson: {} },
    ];

    expect(selectExistingCallLead(sharedPhoneLeads, "+15551234567")).toBeUndefined();
    expect(selectExistingCallLead(sharedPhoneLeads, "+15551234567", "Mai Nguyen", "1985-04-03")?.id).toBe(1);
    expect(selectExistingCallLead(sharedPhoneLeads, "+15551234567", "Mai Nguyen", "1990-08-12")).toBeUndefined();
    expect(selectExistingCallLead(sharedPhoneLeads, "+15550009999", "Mai Nguyen", "1985-04-03")).toBeUndefined();
  });

  it("reuses only one unidentified phone placeholder when the caller remains unidentified", () => {
    const placeholders = [
      { id: 3, name: "+15551234567", phone: "+15551234567", customFieldsJson: {} },
    ];
    expect(selectExistingCallLead(placeholders, "+15551234567")?.id).toBe(3);
    expect(selectExistingCallLead(placeholders, "+15551234567", "Mai Nguyen")).toBeUndefined();
  });
});

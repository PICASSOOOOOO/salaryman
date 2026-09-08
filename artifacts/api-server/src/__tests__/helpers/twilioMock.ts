import { vi } from "vitest";

// Mutable state read at call-time by the mocked Twilio client. Tests set
// `mockState.callSid` to the sid of the call they're exercising so the mocked
// conference participant list "contains" that participant.
export const mockState = {
  callSid: "CAtest00000000000000000000000000000",
  // groupSid returned by calls(sid).fetch() — truthy means the call is already
  // in a conference, so mute/hold take the participant-update branch.
  conferenceGroupSid: "CFgroup0000000000000000000000000000",
  createdCallSid: "CAcreated000000000000000000000000000",
  createdStatus: "queued",
};

// Build a fake `twilio` module. `import twilio from "twilio"` resolves to the
// default export, which is both callable (twilio(sid, token) -> client) and
// carries `.jwt` and `.validateRequest`. The same `client` instance is returned
// on every call, so all spies are shared and assertable across requests.
export function makeTwilioMock() {
  const participantUpdate = vi.fn().mockResolvedValue({});
  const participantsCallable: any = vi.fn(() => ({ update: participantUpdate }));
  participantsCallable.list = vi.fn(async () => [{ callSid: mockState.callSid, muted: false, hold: false }]);

  const conferenceUpdate = vi.fn().mockResolvedValue({});
  const conferenceFetch = vi.fn().mockResolvedValue({ sid: "CFx", status: "in-progress" });
  const conferencesCallable: any = vi.fn(() => ({
    participants: participantsCallable,
    update: conferenceUpdate,
    fetch: conferenceFetch,
  }));
  conferencesCallable.list = vi.fn(async () => []);
  conferencesCallable.create = vi.fn().mockResolvedValue({ sid: "CFnew" });

  const callFetch = vi.fn(async () => ({
    sid: mockState.callSid,
    groupSid: mockState.conferenceGroupSid,
    status: "in-progress",
    duration: "42",
    to: "+15551234567",
    from: "+15557654321",
  }));
  const callUpdate = vi.fn().mockResolvedValue({ sid: mockState.callSid, status: "completed" });
  const callsCallable: any = vi.fn(() => ({ fetch: callFetch, update: callUpdate }));
  callsCallable.create = vi.fn(async () => ({ sid: mockState.createdCallSid, status: mockState.createdStatus }));

  const incomingList = vi.fn(async () => []);
  const incomingRemove = vi.fn(async () => true);
  const incomingCreate = vi.fn(async (opts: { phoneNumber?: string; friendlyName?: string } = {}) => ({
    sid: `PNtest${Math.random().toString(36).slice(2, 12).padEnd(28, "0")}`,
    phoneNumber: opts.phoneNumber ?? "+15550000000",
    friendlyName: opts.friendlyName ?? opts.phoneNumber ?? "Twilio Number",
  }));
  const incomingFetch = vi.fn(async () => ({
    sid: "PNpaid",
    phoneNumber: "+15558881111",
    friendlyName: "Twilio Number",
  }));
  const incomingCallable: any = vi.fn(() => ({ remove: incomingRemove, fetch: incomingFetch }));
  incomingCallable.list = incomingList;
  incomingCallable.create = incomingCreate;

  // availablePhoneNumbers(country).local.list({...}). The returned number is
  // country-prefixed so tests can assert the search respected the country.
  const availableLocalList = vi.fn(async () => [
    { phoneNumber: "+15558881111", friendlyName: "(555) 888-1111", locality: "San Francisco", region: "CA", capabilities: { voice: true, sms: true } },
    { phoneNumber: "+15558882222", friendlyName: "(555) 888-2222", locality: "Oakland", region: "CA", capabilities: { voice: true, sms: true } },
  ]);
  const availablePhoneNumbers = vi.fn((country: string) => ({
    local: {
      list: vi.fn(async (opts: { contains?: string } = {}) => {
        const dial = country === "VN" ? "+84" : "+1";
        const base = (await availableLocalList()).map((n) => ({
          ...n,
          phoneNumber: n.phoneNumber.replace("+1", dial),
        }));
        return opts.contains ? base.filter((n) => n.phoneNumber.includes(opts.contains!)) : base;
      }),
    },
  }));

  const messagesCreate = vi.fn(async (opts: { to?: string } = {}) => ({
    sid: `SMtest${Math.random().toString(36).slice(2, 12).padEnd(28, "0")}`,
    status: "queued",
    to: opts.to ?? "+15551234567",
  }));

  const client = {
    calls: callsCallable,
    conferences: conferencesCallable,
    messages: { create: messagesCreate },
    incomingPhoneNumbers: incomingCallable,
    availablePhoneNumbers,
    newKeys: { create: vi.fn().mockResolvedValue({ sid: "SKtest", secret: "secret" }) },
    applications: Object.assign(
      vi.fn(() => ({
        fetch: vi.fn().mockResolvedValue({ voiceUrl: "" }),
        update: vi.fn().mockResolvedValue({}),
      })),
      { create: vi.fn().mockResolvedValue({ sid: "APtest" }) },
    ),
  };

  class AccessTokenMock {
    static VoiceGrant = class {
      constructor(_opts?: unknown) {}
    };
    constructor(..._args: unknown[]) {}
    addGrant(_grant: unknown) {}
    toJwt() {
      return "FAKE.JWT.TOKEN";
    }
  }

  const twilioFn: any = vi.fn(() => client);
  twilioFn.jwt = { AccessToken: AccessTokenMock };
  twilioFn.validateRequest = vi.fn(() => true);

  // Expose shared spies + the client for assertions inside tests.
  twilioFn.__client = client;
  twilioFn.__spies = {
    callsCreate: callsCallable.create,
    messagesCreate,
    callUpdate,
    callFetch,
    participantUpdate,
    participantsList: participantsCallable.list,
    conferencesList: conferencesCallable.list,
    conferenceUpdate,
    incomingCreate,
    incomingList,
    incomingRemove,
    incomingFetch,
    availablePhoneNumbers,
  };

  return { default: twilioFn };
}

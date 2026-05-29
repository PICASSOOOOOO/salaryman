// Global test setup. Runs before every test file.
//
// The Twilio SDK is mocked in each test file (see helpers/twilioMock.ts), so no
// real Twilio API calls or charges ever happen. We still need the TWILIO_*
// environment variables present because the route handlers read them at
// call-time (getTwilioClient / system-status) before touching the client.
//
// Setting TWILIO_API_KEY_SID/SECRET and TWILIO_TWIML_APP_SID short-circuits the
// lazy auto-provisioning path in ensureTwilioApiKey()/ensureTwimlApp() so the
// token route stays deterministic and never calls the (mocked) provisioning API.
process.env.TWILIO_ACCOUNT_SID = "ACtest00000000000000000000000000000";
process.env.TWILIO_AUTH_TOKEN = "test_auth_token";
process.env.TWILIO_PHONE_NUMBER = "+15557654321";
process.env.TWILIO_API_KEY_SID = "SKtest00000000000000000000000000000";
process.env.TWILIO_API_KEY_SECRET = "test_api_key_secret";
process.env.TWILIO_TWIML_APP_SID = "APtest00000000000000000000000000000";

// Keep the app host empty so handlers skip building absolute webhook URLs;
// this keeps the mocked Twilio call payloads small and predictable.
delete process.env.APP_DOMAIN;
delete process.env.REPLIT_DEPLOYMENT_URL;
delete process.env.REPLIT_DOMAINS;
delete process.env.REPLIT_DEV_DOMAIN;

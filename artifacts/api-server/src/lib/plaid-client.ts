import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  type CountryCode,
  type Products,
} from "plaid";

// Thin wrapper around the official Plaid SDK. Credentials are PER-USER
// (bring-your-own, like the trading system's broker keys): each user supplies
// their own Plaid client_id + secret from dashboard.plaid.com. The platform
// never provides a shared key, so there is no global "configured" state — every
// caller builds a client from the authenticated user's stored credentials.

export interface PlaidCredentials {
  clientId: string;
  secret: string;
  env: string;
}

export function normalizePlaidEnv(env: string | null | undefined): string {
  const e = (env || "sandbox").toLowerCase();
  return e in PlaidEnvironments ? e : "sandbox";
}

// Build a Plaid client for a specific user's credentials. Not cached: different
// users have different keys and may target different environments.
export function makePlaidClient(creds: PlaidCredentials): PlaidApi {
  if (!creds.clientId || !creds.secret) {
    throw new Error("Plaid credentials are incomplete (missing client_id / secret)");
  }
  const env = normalizePlaidEnv(creds.env);
  const config = new Configuration({
    basePath: PlaidEnvironments[env],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": creds.clientId,
        "PLAID-SECRET": creds.secret,
      },
    },
  });
  return new PlaidApi(config);
}

// View-only: we only need the Balance product to read account balances. No
// transactions, transfers, or payment-initiation products are requested.
export const PLAID_PRODUCTS: Products[] = ["balance" as Products];
export const PLAID_COUNTRY_CODES: CountryCode[] = [
  "US" as CountryCode,
  "CA" as CountryCode,
  "GB" as CountryCode,
];

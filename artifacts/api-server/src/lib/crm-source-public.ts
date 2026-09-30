import { maskProtectedRecord } from "./org-protected-records-crypto";

export function publicCrmSource(source: any) {
  const safe = { ...source };
  const configured = Boolean(safe.encryptedAuth);
  delete safe.encryptedAuth;
  delete safe.oauthStateHash;
  delete safe.oauthStateExpiresAt;
  if (safe.provider === "rest" && safe.configJson?.endpoint) {
    const config = { ...safe.configJson };
    try {
      const endpoint = new URL(String(config.endpoint));
      endpoint.search = "";
      endpoint.hash = "";
      config.endpoint = endpoint.toString();
      safe.configJson = config;
    } catch {
      delete config.endpoint;
      safe.configJson = config;
    }
  }
  return { ...safe, credential: configured ? maskProtectedRecord("configured") : null };
}
import dns from "node:dns/promises";
import { isIP } from "node:net";

export class SafeFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeFetchError";
  }
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "169.254.169.254",
  "100.100.100.200",
]);

function isPrivateIpv4(a: number, b: number, c: number, d: number): boolean {
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  if (a === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}

function parseIpv4Octets(ip: string): [number, number, number, number] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map(Number);
  if (octets.some(n => isNaN(n) || n < 0 || n > 255)) return null;
  return octets as [number, number, number, number];
}

function isBlockedIpv4(ip: string): boolean {
  const octets = parseIpv4Octets(ip);
  if (!octets) return false;
  return isPrivateIpv4(...octets);
}

function ipv4MappedToIpv4(ip: string): string | null {
  const lower = ip.toLowerCase();
  if (lower.startsWith("::ffff:")) {
    const rest = lower.slice(7);
    if (rest.includes(".")) return rest;
    const parts = rest.split(":");
    if (parts.length === 2) {
      const hi = parseInt(parts[0], 16);
      const lo = parseInt(parts[1], 16);
      if (!isNaN(hi) && !isNaN(lo)) {
        return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      }
    }
  }
  if (lower.startsWith("::") && lower.includes(".")) {
    return lower.slice(2);
  }
  return null;
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");

  if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;

  if (lower === "::" || lower === "0:0:0:0:0:0:0:0") return true;

  const mapped = ipv4MappedToIpv4(lower);
  if (mapped !== null) {
    return isBlockedIpv4(mapped);
  }

  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fe90:") ||
      lower.startsWith("fea0:") || lower.startsWith("feb0:")) return true;
  if (lower.startsWith("ff")) return true;

  return false;
}

function isBlockedIp(ip: string): boolean {
  if (BLOCKED_HOSTNAMES.has(ip)) return true;

  const version = isIP(ip);
  if (version === 4) return isBlockedIpv4(ip);
  if (version === 6) return isBlockedIpv6(ip);
  return false;
}

async function resolveAndValidate(hostname: string): Promise<void> {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (BLOCKED_HOSTNAMES.has(lower)) {
    throw new SafeFetchError(`Hostname not allowed: ${hostname}`);
  }

  if (isIP(hostname) || isIP(lower)) {
    if (isBlockedIp(lower)) {
      throw new SafeFetchError(`IP address not allowed: ${hostname}`);
    }
    return;
  }

  const v4Results = await dns.resolve4(hostname).catch(() => [] as string[]);
  const v6Results = await dns.resolve6(hostname).catch(() => [] as string[]);
  const addresses = [...v4Results, ...v6Results];

  if (addresses.length === 0) {
    throw new SafeFetchError(`DNS resolution failed for: ${hostname}`);
  }

  for (const addr of addresses) {
    if (isBlockedIp(addr)) {
      throw new SafeFetchError(`Hostname resolves to blocked address: ${hostname} -> ${addr}`);
    }
  }
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

const DEFAULT_FETCH_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (compatible; SEOAuditBot/1.0)",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export async function safeFetch(
  url: string,
  options: SafeFetchOptions = {}
): Promise<Response> {
  const { timeoutMs = 15000, maxResponseBytes = 5 * 1024 * 1024, maxRedirects = 5 } = options;
  const method = options.method ?? "GET";
  const requestHeaders = options.headers ?? DEFAULT_FETCH_HEADERS;
  const requestBody = options.body;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new SafeFetchError(`Invalid URL: ${url}`);
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new SafeFetchError(`Only http and https URLs are allowed, got: ${parsedUrl.protocol}`);
  }

  await resolveAndValidate(parsedUrl.hostname);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let redirectCount = 0;
  let currentUrl = url;

  try {
    while (redirectCount <= maxRedirects) {
      const response = await fetch(currentUrl, {
        method,
        signal: controller.signal,
        redirect: "manual",
        headers: requestHeaders,
        ...(requestBody !== undefined ? { body: requestBody } : {}),
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new SafeFetchError("Redirect with no Location header");
        }

        redirectCount++;
        if (redirectCount > maxRedirects) {
          throw new SafeFetchError(`Too many redirects (max ${maxRedirects})`);
        }

        let nextUrl: URL;
        try {
          nextUrl = new URL(location, currentUrl);
        } catch {
          throw new SafeFetchError(`Invalid redirect URL: ${location}`);
        }

        if (nextUrl.protocol !== "http:" && nextUrl.protocol !== "https:") {
          throw new SafeFetchError(`Redirect to non-http(s) URL blocked: ${nextUrl.protocol}`);
        }

        await resolveAndValidate(nextUrl.hostname);
        currentUrl = nextUrl.toString();
        continue;
      }

      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > maxResponseBytes) {
        throw new SafeFetchError(`Response too large (content-length: ${contentLength} bytes)`);
      }

      if (!response.body) return response;

      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      const reader = response.body.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > maxResponseBytes) {
            reader.cancel().catch(() => {});
            throw new SafeFetchError(`Response body too large (exceeded ${maxResponseBytes} bytes)`);
          }
          chunks.push(value);
        }
      }

      const body = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }

      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }

    throw new SafeFetchError(`Too many redirects`);
  } finally {
    clearTimeout(timeout);
  }
}

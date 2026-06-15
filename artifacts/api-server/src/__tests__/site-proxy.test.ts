import { describe, it, expect } from "vitest";
import {
  validateSlug,
  normalizeSlug,
  classifyOrigin,
  isPrivateIp,
  rewriteHtml,
} from "../lib/site-proxy";

describe("validateSlug", () => {
  it("accepts normal slugs", () => {
    for (const s of ["acme", "acme-corp", "a1b2", "my-cool-site-2026"]) {
      expect(validateSlug(s).ok).toBe(true);
    }
  });

  it("lowercases via normalizeSlug but validates case-insensitively", () => {
    expect(validateSlug("ACME").ok).toBe(true);
    expect(normalizeSlug("  ACME  ")).toBe("acme");
  });

  it("rejects bad formats", () => {
    expect(validateSlug("a").reason).toBe("format"); // too short
    expect(validateSlug("-acme").reason).toBe("format"); // leading hyphen
    expect(validateSlug("acme-").reason).toBe("format"); // trailing hyphen
    expect(validateSlug("ac me").reason).toBe("format"); // space
    expect(validateSlug("ac_me").reason).toBe("format"); // underscore
    expect(validateSlug("a".repeat(41)).reason).toBe("format"); // too long
    expect(validateSlug("").reason).toBe("empty");
    expect(validateSlug(123 as unknown).reason).toBe("empty");
  });

  it("rejects reserved words", () => {
    for (const s of ["api", "ws", "sites", "admin", "www", "pablo", "world"]) {
      expect(validateSlug(s).reason).toBe("reserved");
    }
  });
});

describe("isPrivateIp", () => {
  it("flags private / loopback / link-local IPv4", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "0.0.0.0", "100.64.0.1"]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
  });
  it("allows public IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "151.101.1.69"]) {
      expect(isPrivateIp(ip)).toBe(false);
    }
  });
  it("handles IPv6 loopback / unique-local / mapped", () => {
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
    expect(isPrivateIp("fd00::1")).toBe(true);
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIp("2606:4700:4700::1111")).toBe(false);
  });
});

describe("classifyOrigin", () => {
  it("accepts https public hosts and returns the origin", () => {
    const c = classifyOrigin("https://my-site.framer.app/some/path?x=1");
    expect(c.ok).toBe(true);
    expect(c.origin).toBe("https://my-site.framer.app");
  });

  it("rejects non-https", () => {
    expect(classifyOrigin("http://my-site.framer.app").reason).toBe("protocol");
    expect(classifyOrigin("ftp://x.com").reason).toBe("protocol");
  });

  it("rejects internal / private hosts", () => {
    expect(classifyOrigin("https://localhost/").reason).toBe("private_host");
    expect(classifyOrigin("https://127.0.0.1/").reason).toBe("private_host");
    expect(classifyOrigin("https://10.0.0.5/").reason).toBe("private_host");
    expect(classifyOrigin("https://169.254.169.254/").reason).toBe("private_host");
    expect(classifyOrigin("https://service.internal/").reason).toBe("private_host");
    expect(classifyOrigin("https://box.local/").reason).toBe("private_host");
  });

  it("rejects garbage", () => {
    expect(classifyOrigin("not a url").reason).toBe("invalid_url");
    expect(classifyOrigin("").reason).toBe("invalid_url");
    expect(classifyOrigin("https://router/").reason).toBe("bad_host"); // bare host, no dot, not IP
  });
});

describe("rewriteHtml", () => {
  const slug = "acme";

  it("prefixes root-relative href/src", () => {
    const out = rewriteHtml('<a href="/about">x</a><img src="/img/logo.png">', slug);
    expect(out).toContain('href="/sites/acme/about"');
    expect(out).toContain('src="/sites/acme/img/logo.png"');
  });

  it("leaves absolute and protocol-relative URLs alone", () => {
    const html = '<img src="https://framerusercontent.com/a.png"><script src="//cdn.example.com/x.js"></script>';
    const out = rewriteHtml(html, slug);
    expect(out).toContain('src="https://framerusercontent.com/a.png"');
    expect(out).toContain('src="//cdn.example.com/x.js"');
  });

  it("rewrites srcset entries and css url()", () => {
    const out = rewriteHtml('<img srcset="/a.png 1x, /b.png 2x"><div style="background:url(/bg.jpg)">', slug);
    expect(out).toContain("/sites/acme/a.png 1x");
    expect(out).toContain("/sites/acme/b.png 2x");
    expect(out).toContain("url(/sites/acme/bg.jpg)");
  });

  it("injects a <base> tag in the head", () => {
    const out = rewriteHtml("<html><head><meta charset=utf-8></head><body></body></html>", slug);
    expect(out).toContain('<base href="/sites/acme/">');
    expect(out.indexOf("<base")).toBeGreaterThan(out.indexOf("<head"));
  });
});

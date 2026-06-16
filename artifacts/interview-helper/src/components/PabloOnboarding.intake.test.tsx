// @vitest-environment jsdom
//
// Integration test for the PabloOnboarding identity step gallery.
//
// Unit tests already cover applyCharacterTemplate, factionGarb, and the
// CHARACTER_TEMPLATES catalog in isolation. What they do NOT cover is the
// seam where the user actually picks a template inside the onboarding form
// and the resulting save blob (OnboardingAnswers) carries the right values.
// That is exactly what this file guards:
//
//   • The fallback gallery renders (3 pixel archetypes) when the API fails.
//   • Picking a fallback template writes the matching gender + faction garb
//     into the save blob's `appearance` field.
//   • Picking a template that already has a portrait URL also sets
//     `appearance.portraitUrl` in the save blob.
//   • A portrait URL that becomes available AFTER the initial pick (the
//     "art bakes in" upgrade path via onTemplateUrlReady) is reflected in the
//     save blob without clobbering a subsequently painted photo.
//   • The "Generate from photo" file input is present alongside the gallery
//     on the identity step — the two paths coexist.
//
// Navigation: each test walks the full step sequence
// (destination → greet → identity → business → estate → done) so the save
// blob is captured exactly as the real caller would see it (via the
// onComplete callback on the "STEP OUTSIDE" button).
//
// All browser-only or network-heavy dependencies are stubbed so the suite
// runs in jsdom without a server.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// ── Hoisted shared fixtures ──────────────────────────────────────────────────
// vi.mock factories are hoisted before any module-level code executes, so
// shared data used inside them must be defined via vi.hoisted().
const { MOCK_CITY_ID, MOCK_CITY } = vi.hoisted(() => {
  const MOCK_CITY_ID = "test_city";
  const MOCK_CITY = {
    cityId: MOCK_CITY_ID,
    cityName: "TEST CITY",
    region: "TEST",
    timezone: "America/Los_Angeles",
    themeStyle: "cyberpunk_neon",
    accentColor: "#38bdf8",
    bgGradient: "linear-gradient(135deg, #0c1929 0%, #1a2744 100%)",
    icon: "🏙️",
    tagline: "TEST",
    description: "Test city for unit tests.",
    isLive: true,
    maxPlayers: 50,
    serverUrl: "",
  };
  return { MOCK_CITY_ID, MOCK_CITY };
});

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@workspace/replit-auth-web", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: false,
    user: null,
    logout: vi.fn(),
  }),
}));

// apiFetch double: controls template list, portrait generation, and register.
const apiFetchMock = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args as [string]),
}));

// useArtAsset double: controlled per-test so the "art bakes in after pick" case
// can be simulated by updating the mock between render cycles.
const artAssetMock = vi.fn((_key: string): string | null => null);
vi.mock("@/lib/art", () => ({
  useArtAsset: (key: string) => artAssetMock(key),
}));

vi.mock("@/lib/ui-sound", () => ({
  playStep: vi.fn(),
  playError: vi.fn(),
  playMilestone: vi.fn(),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useBoomerMode: () => [false, vi.fn()] as const,
  useIsMobile: () => false,
}));

vi.mock("@/lib/tutorial-progress", () => ({
  getSalarymanBizPath: () => null,
  getSalarymanName: () => null,
  // A pre-filled email lets canAdvance() pass the identity step so NEXT is
  // enabled without manually typing in the form.
  getSalarymanEmail: () => "test@example.com",
  isLikelyEmail: (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s),
  getSalarymanGender: () => null,
  setSalarymanGender: vi.fn(),
  salarymanTerm: () => "SALARYMAN",
}));

vi.mock("@/lib/world-servers", () => ({
  PLANNED_CITIES: [MOCK_CITY],
  getCityById: (id: string) => (id === MOCK_CITY_ID ? MOCK_CITY : undefined),
  resolveHomeCity: () => ({ city: MOCK_CITY, confidence: 1 }),
  getLocalTimezone: () => "America/Los_Angeles",
  getOperationalCities: () => [MOCK_CITY],
}));

// PixelOffice is canvas-based — stub it to avoid jsdom canvas noise.
vi.mock("./PixelOffice", () => ({ PixelOffice: () => null }));

vi.mock("@/lib/avatar", () => ({
  resolveAvatarUrl: (url: string) => url,
}));

// Stub the global fetch used by the component for /api/world/locate and
// /api/world/population. Both are non-critical enhancements that fail silently.
globalThis.fetch = vi.fn(async () => ({
  ok: false,
  status: 503,
  json: async () => ({}),
})) as unknown as typeof fetch;

// ── Import after mocks ───────────────────────────────────────────────────────
import { PabloOnboarding, type OnboardingAnswers } from "./PabloOnboarding";

// ── Test harness ─────────────────────────────────────────────────────────────

let root: Root;
let container: HTMLDivElement;
let completeSpy: ReturnType<typeof vi.fn<(answers: OnboardingAnswers) => void>>;

function qs(testid: string): HTMLElement | null {
  return container.querySelector(`[data-testid="${testid}"]`);
}

async function flush(rounds = 4) {
  await act(async () => {
    for (let i = 0; i < rounds; i++) await Promise.resolve();
  });
}

async function mountOnboarding() {
  await act(async () => {
    root.render(
      <PabloOnboarding
        charName="TESTER"
        charClass="TRADER"
        onComplete={completeSpy}
      />
    );
  });
  await flush(6);
}

async function clickNext() {
  const btn = qs("onboarding-next") as HTMLButtonElement | null;
  if (!btn) throw new Error("onboarding-next button not found");
  await act(async () => { btn.click(); });
  await flush();
}

/**
 * Walk destination → greet → identity.
 * After this the identity step is visible and the fallback gallery has rendered
 * (the templates API call has already settled in the background).
 */
async function navigateToIdentity() {
  await clickNext(); // destination → greet
  await clickNext(); // greet → identity
  await flush(6);   // let the templates-fetch effect settle (→ sets templatesErr)
}

/**
 * Continue from identity → business → estate → done.
 * Picks UNEMPLOYED on the business step so no company fields are needed.
 * Clicks FILE WITH PABLO which triggers submit(); the register endpoint is
 * expected to return 200 (set up per-test).
 */
async function navigateFromIdentityToDone() {
  // identity → business
  await clickNext();
  await flush();

  // business: pick UNEMPLOYED so canAdvance becomes true.
  const unemployedBtn = qs("onboarding-choice-unemployed");
  if (!unemployedBtn) throw new Error("unemployed choice button not found");
  await act(async () => { unemployedBtn.click(); });
  await flush();

  // business → estate
  await clickNext();
  await flush();

  // estate → submit (FILE WITH PABLO)
  const submitBtn = qs("onboarding-submit");
  if (!submitBtn) throw new Error("onboarding-submit button not found");
  await act(async () => { submitBtn.click(); });
  await flush(8); // await register API + setStep('done')
}

/**
 * Capture buildAnswers() from the STEP OUTSIDE button on the 'done' step.
 * Callers must have reached the done step first via navigateFromIdentityToDone.
 */
function captureAnswers(): OnboardingAnswers {
  completeSpy.mockClear();
  const btn = qs("onboarding-step-outside") as HTMLButtonElement | null;
  if (!btn) throw new Error("onboarding-step-outside button not found — is the component on the done step?");
  btn.click();
  expect(completeSpy).toHaveBeenCalledOnce();
  return completeSpy.mock.calls[0][0];
}

function defaultApiFetchImpl() {
  apiFetchMock.mockImplementation(async (path: string) => {
    if (path === "/salaryman/character/templates") {
      // Fail → triggers fallback gallery (CHARACTER_TEMPLATES pixel archetypes).
      return { ok: false, status: 500, json: async () => ({}) } as unknown as Response;
    }
    if (path === "/api/world/register") {
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  });
}

beforeEach(() => {
  completeSpy = vi.fn();
  apiFetchMock.mockReset();
  artAssetMock.mockReset();
  artAssetMock.mockReturnValue(null);
  defaultApiFetchImpl();
  try { window.localStorage.clear(); } catch {}
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  try { window.localStorage.clear(); } catch {}
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("PabloOnboarding identity step gallery saves the chosen look", () => {
  it("renders the fallback gallery (3 archetypes) when the templates API fails", async () => {
    await mountOnboarding();
    await navigateToIdentity();

    const gallery = qs("onboarding-template-gallery");
    expect(gallery, "gallery grid should render").not.toBeNull();

    // All three fallback cards from CHARACTER_TEMPLATES must appear.
    const cards = container.querySelectorAll('[data-testid^="onboarding-template-fallback_"]');
    expect(cards.length).toBe(3);

    // The "Generate from photo" file input coexists alongside the gallery.
    expect(qs("onboarding-portrait-input"), "portrait file input should be present").not.toBeNull();
  });

  it("picking the woman fallback template writes gender=f and suit-faction dress to the save blob", async () => {
    await mountOnboarding();
    await navigateToIdentity();

    const womanCard = qs("onboarding-template-fallback_woman") as HTMLButtonElement;
    expect(womanCard, "woman fallback card should exist").not.toBeNull();
    await act(async () => { womanCard.click(); });
    await flush();

    await navigateFromIdentityToDone();
    const answers = captureAnswers();

    expect(answers.appearance.gender).toBe("f");
    // suit faction garb for a woman resolves to 'dress'.
    expect(answers.appearance.outfitStyle).toBe("dress");
    // No portrait URL available at pick time — must be absent.
    expect(answers.appearance.portraitUrl).toBeUndefined();
    expect(answers.gender).toBe("woman");
    expect(answers.faction).toBe("suit");
  });

  it("picking the man fallback template writes gender=m and suit faction to the save blob", async () => {
    await mountOnboarding();
    await navigateToIdentity();

    const manCard = qs("onboarding-template-fallback_man") as HTMLButtonElement;
    expect(manCard, "man fallback card should exist").not.toBeNull();
    await act(async () => { manCard.click(); });
    await flush();

    await navigateFromIdentityToDone();
    const answers = captureAnswers();

    expect(answers.appearance.gender).toBe("m");
    expect(answers.appearance.outfitStyle).toBe("suit");
    expect(answers.appearance.portraitUrl).toBeUndefined();
    expect(answers.gender).toBe("man");
  });

  it("picking a template whose imageUrl is ready also sets portraitUrl in the save blob", async () => {
    const PORTRAIT_URL = "https://cdn.example.com/woman-portrait.jpg";

    // Serve real API templates — one has a pre-rendered realistic portrait URL.
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === "/salaryman/character/templates") {
        return {
          ok: true, status: 200,
          json: async () => ({
            templates: [
              {
                id: "api_woman",
                artKey: "__none_api_woman",
                label: "SALARYWOMAN",
                archetype: "woman",
                faction: "suit",
                imageUrl: PORTRAIT_URL,
                status: "ready",
                appearance: { skinTone: "#e8c4a0", hairStyle: "long", hairColor: "#0a0a0a" },
              },
              {
                id: "api_man",
                artKey: "__none_api_man",
                label: "SALARYMAN",
                archetype: "man",
                faction: "suit",
                imageUrl: null,
                status: "none",
                appearance: { skinTone: "#d4a878", hairStyle: "short", hairColor: "#2a1808" },
              },
            ],
          }),
        } as unknown as Response;
      }
      if (path === "/api/world/register") {
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    });

    await mountOnboarding();
    await navigateToIdentity();

    const womanCard = qs("onboarding-template-api_woman") as HTMLButtonElement;
    expect(womanCard, "api woman card should exist").not.toBeNull();
    await act(async () => { womanCard.click(); });
    await flush();

    await navigateFromIdentityToDone();
    const answers = captureAnswers();

    expect(answers.appearance.gender).toBe("f");
    expect(answers.appearance.outfitStyle).toBe("dress");
    // The pre-rendered portrait URL must travel into the save blob.
    expect(answers.appearance.portraitUrl).toBe(PORTRAIT_URL);
  });

  it("portrait URL bakes into the save blob when art becomes available after the initial pick", async () => {
    const ART_KEY = "tpl_bake_woman";
    const LATE_URL = "https://cdn.example.com/late-bake.jpg";

    // Serve a template with a real artKey but no pre-loaded imageUrl.
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === "/salaryman/character/templates") {
        return {
          ok: true, status: 200,
          json: async () => ({
            templates: [{
              id: "bake_woman",
              artKey: ART_KEY,
              label: "SALARYWOMAN",
              archetype: "woman",
              faction: "suit",
              imageUrl: null,
              status: "pending",
              appearance: { skinTone: "#e8c4a0" },
            }],
          }),
        } as unknown as Response;
      }
      if (path === "/api/world/register") {
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    });

    await mountOnboarding();
    await navigateToIdentity();

    const bakeCard = qs("onboarding-template-bake_woman") as HTMLButtonElement;
    expect(bakeCard, "bake_woman card should exist").not.toBeNull();

    // Pick while art is still pending — no URL at this moment.
    await act(async () => { bakeCard.click(); });
    await flush();

    // Verify portraitUrl is absent immediately after pick.
    expect(
      qs("onboarding-portrait-img"),
      "portrait img absent before art is ready",
    ).toBeNull();

    // Simulate the render backend finishing: useArtAsset now returns the URL.
    artAssetMock.mockImplementation((key: string) =>
      key === ART_KEY ? LATE_URL : null
    );

    // A re-render cycle (root.render with identical props preserves state in
    // React 18) causes TemplateCard to re-run, url becomes non-null on the
    // selected card, the useEffect fires → onTemplateUrlReady → portraitUrl set.
    await act(async () => {
      root.render(
        <PabloOnboarding
          charName="TESTER"
          charClass="TRADER"
          onComplete={completeSpy}
        />
      );
    });
    await flush(6);

    // The portrait image should now be visible in the identity step preview.
    expect(
      qs("onboarding-portrait-img"),
      "portrait img appears after art bakes in",
    ).not.toBeNull();

    await navigateFromIdentityToDone();
    const answers = captureAnswers();
    expect(answers.appearance.portraitUrl).toBe(LATE_URL);
  });

  it("switching to a template without a URL clears a previously set portraitUrl", async () => {
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === "/salaryman/character/templates") {
        return {
          ok: true, status: 200,
          json: async () => ({
            templates: [
              {
                id: "sw",
                artKey: "__none_sw",
                label: "SALARYWOMAN",
                archetype: "woman",
                faction: "suit",
                imageUrl: "https://cdn.example.com/w.jpg",
                status: "ready",
                appearance: {},
              },
              {
                id: "sm",
                artKey: "__none_sm",
                label: "SALARYMAN",
                archetype: "man",
                faction: "suit",
                imageUrl: null,
                status: "none",
                appearance: {},
              },
            ],
          }),
        } as unknown as Response;
      }
      if (path === "/api/world/register") {
        return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    });

    await mountOnboarding();
    await navigateToIdentity();

    // Pick woman card — has portraitUrl.
    const wCard = qs("onboarding-template-sw") as HTMLButtonElement;
    await act(async () => { wCard.click(); });
    await flush();
    expect(
      qs("onboarding-portrait-img"),
      "portrait img should show after picking a card with imageUrl",
    ).not.toBeNull();

    // Pick man card — no imageUrl → stale portraitUrl must be cleared.
    const mCard = qs("onboarding-template-sm") as HTMLButtonElement;
    await act(async () => { mCard.click(); });
    await flush();
    expect(
      qs("onboarding-portrait-img"),
      "portrait img should be gone after switching to a card without imageUrl",
    ).toBeNull();

    await navigateFromIdentityToDone();
    const answers = captureAnswers();
    expect(answers.appearance.gender).toBe("m");
    expect(answers.appearance.portraitUrl).toBeUndefined();
  });

  it("the 'Generate from photo' file input coexists with the gallery — picking a template does not remove it", async () => {
    await mountOnboarding();
    await navigateToIdentity();

    // Both must be present before any interaction.
    expect(qs("onboarding-template-gallery"), "gallery present before pick").not.toBeNull();
    expect(qs("onboarding-portrait-input"), "photo input present before pick").not.toBeNull();

    // Picking a template must not hide the photo upload path.
    const fallbackCard = qs("onboarding-template-fallback_replicant") as HTMLButtonElement;
    await act(async () => { fallbackCard.click(); });
    await flush();

    expect(qs("onboarding-template-gallery"), "gallery present after pick").not.toBeNull();
    expect(qs("onboarding-portrait-input"), "photo input present after pick").not.toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const responsesCreate = vi.fn();

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { responses: { create: responsesCreate } },
}));

describe("Pablo live context", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    responsesCreate.mockReset();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses live weather data for an explicitly named city without waiting on web search", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        results: [{ name: "Hanoi", admin1: "Hanoi", country: "Vietnam", latitude: 21.0245, longitude: 105.84117 }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        timezone: "Asia/Bangkok",
        current: {
          time: "2026-10-19T16:30",
          temperature_2m: 30,
          apparent_temperature: 34.1,
          relative_humidity_2m: 70,
          precipitation: 0,
          weather_code: 0,
          wind_speed_10m: 13.1,
        },
        daily: {
          time: ["2026-10-19", "2026-10-20"],
          weather_code: [51, 3],
          temperature_2m_min: [25, 24.8],
          temperature_2m_max: [32.1, 32.3],
          precipitation_probability_max: [40, 25],
        },
      }), { status: 200 }));

    const { buildLiveContext } = await import("./pablo-live");
    const context = await buildLiveContext("What's the weather in Hanoi tomorrow?");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("name=Hanoi");
    expect(context).toContain("LIVE WEATHER from Open-Meteo for Hanoi, Vietnam");
    expect(context).toContain("30°C");
    expect(context).toContain("feels like 34.1°C");
    expect(context).toContain("40% precipitation chance");
    expect(context).toContain("Three-day forecast");
    expect(responsesCreate).not.toHaveBeenCalled();
  });

  it("asks for a city instead of guessing when a weather request has no location", async () => {
    const { buildLiveContext } = await import("./pablo-live");
    const context = await buildLiveContext("What's the weather like today?");

    expect(context).toContain("Ask which city or area they mean");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(responsesCreate).not.toHaveBeenCalled();
  });

  it("lets ordinary chat continue after one short live-search attempt", async () => {
    responsesCreate.mockResolvedValue({ output_text: "Current result." });
    const { pabloWebSearch } = await import("./pablo-live");

    await expect(pabloWebSearch("latest news")).resolves.toBe("Current result.");
    expect(responsesCreate.mock.calls[0][1]).toEqual({ timeout: 6000, maxRetries: 0 });
  });
});

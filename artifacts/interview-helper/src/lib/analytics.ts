type AnalyticsValue = string | number | boolean;
type AnalyticsData = Record<string, AnalyticsValue>;

declare global {
  interface Window {
    umami?: {
      track(name: string, data?: AnalyticsData): void;
    };
  }
}

/**
 * Replit injects the Umami tracker on published websites when analytics is
 * enabled. Keep events optional so local development and missing trackers are
 * harmless, and isolate tracker errors from product behavior.
 */
export function trackEvent(name: string, data?: AnalyticsData): void {
  if (typeof window === "undefined") return;

  try {
    window.umami?.track(name, data);
  } catch {
    // Analytics must never break the app.
  }
}
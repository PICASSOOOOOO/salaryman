/**
 * Real-world city time is shared domain data. It is deliberately separate from
 * the fictional world calendar, which controls story/weather presentation.
 */
export const CITY_TIMEZONES = {
  minx_city: "America/Los_Angeles",
  huda_city: "Asia/Ho_Chi_Minh",
  solaris_drift: "America/Mexico_City",
  verde_nexus: "America/Sao_Paulo",
  obsidian_reach: "Africa/Lagos",
  cobalt_harbor: "Europe/London",
  vostok_gate: "Europe/Moscow",
  crescent_spire: "Asia/Dubai",
  amber_circuit: "Asia/Kolkata",
  dragon_forge: "Asia/Tokyo",
  coral_vault: "Australia/Sydney",
} as const;

export type CityTimeId = keyof typeof CITY_TIMEZONES;
export type OfficeHoursProfile = "always" | "day" | "service" | "food" | "night" | "appointment" | "finance";
export type OfficeHoursWindow = {
  /** JavaScript weekday: Sunday = 0. */
  days: readonly number[];
  open: string;
  close: string;
};

export const OFFICE_HOURS: Record<OfficeHoursProfile, readonly OfficeHoursWindow[]> = {
  always: [{ days: [0, 1, 2, 3, 4, 5, 6], open: "00:00", close: "24:00" }],
  day: [{ days: [1, 2, 3, 4, 5], open: "08:00", close: "18:00" }],
  service: [{ days: [1, 2, 3, 4, 5, 6], open: "06:00", close: "22:00" }],
  food: [{ days: [1, 2, 3, 4, 5, 6, 0], open: "06:00", close: "22:00" }],
  night: [{ days: [1, 2, 3, 4, 5, 6, 0], open: "17:00", close: "03:00" }],
  appointment: [{ days: [1, 2, 3, 4, 5, 6], open: "09:00", close: "20:00" }],
  finance: [{ days: [1, 2, 3, 4, 5], open: "08:00", close: "17:00" }],
};

function timeZoneOrUtc(timeZone: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return timeZone;
  } catch {
    return "UTC";
  }
}

function partsFor(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZoneOrUtc(timeZone),
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const values: Record<string, string> = {};
  for (const part of parts) if (part.type !== "literal") values[part.type] = part.value;
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour) % 24,
    minute: Number(values.minute),
    second: Number(values.second),
    weekday: weekdays.indexOf(values.weekday),
  };
}

function offsetMinutes(at: Date, timeZone: string): number {
  const local = partsFor(at, timeZone);
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  return Math.round((asUtc - at.getTime()) / 60_000);
}

export function cityTimezone(cityId: string): string {
  return CITY_TIMEZONES[cityId as CityTimeId] ?? "UTC";
}

export type CityClock = {
  cityId: string;
  timezone: string;
  serverNow: string;
  localDate: string;
  weekday: number;
  hour: number;
  minute: number;
  second: number;
  offsetMinutes: number;
  label: string;
};

export function getCityClock(at: Date, cityId: string): CityClock {
  const timezone = cityTimezone(cityId);
  const local = partsFor(at, timezone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    cityId,
    timezone,
    serverNow: at.toISOString(),
    localDate: `${local.year}-${pad(local.month)}-${pad(local.day)}`,
    weekday: local.weekday,
    hour: local.hour,
    minute: local.minute,
    second: local.second,
    offsetMinutes: offsetMinutes(at, timezone),
    label: `${pad(local.hour)}:${pad(local.minute)}:${pad(local.second)}`,
  };
}

function minutesFromTime(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid office-hours time: ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 24 || minute > 59 || (hour === 24 && minute !== 0)) throw new Error(`Invalid office-hours time: ${value}`);
  return hour * 60 + minute;
}

function windowContains(clock: Pick<CityClock, "weekday" | "hour" | "minute">, window: OfficeHoursWindow): boolean {
  const open = minutesFromTime(window.open);
  const close = minutesFromTime(window.close);
  const current = clock.hour * 60 + clock.minute;
  const currentDay = clock.weekday;
  if (close > open) return window.days.includes(currentDay) && current >= open && current < close;
  if (close === open) return window.days.includes(currentDay);
  const previousDay = (currentDay + 6) % 7;
  return (window.days.includes(currentDay) && current >= open)
    || (window.days.includes(previousDay) && current < close);
}

export function isOfficeOpenAt(at: Date, cityId: string, profile: OfficeHoursProfile): boolean {
  const clock = getCityClock(at, cityId);
  return OFFICE_HOURS[profile].some((window) => windowContains(clock, window));
}

export function officeHoursFor(profile: OfficeHoursProfile) {
  return OFFICE_HOURS[profile];
}

/**
 * Each catalog business gets an intentional operating rhythm. This is not a
 * visual tag: the API uses it when deciding whether a service can be booked or
 * settled, while clients use the same value for truthful floor signage.
 */
export function businessOfficeHoursProfile(businessKey: string, category = ""): OfficeHoursProfile {
  if (businessKey === "tower_black_market") return "night";
  if (["tower_vending", "tower_atm", "tower_security", "tower_sanitation", "tower_courier"].includes(businessKey)) return "always";
  if (["tower_restaurant", "shadow_cafeteria", "tower_florist"].includes(businessKey)) return "food";
  if (["tower_clinic", "tower_doctor", "tower_dentist", "tower_pharmacy", "tower_massage", "tower_childcare"].includes(businessKey)) return "appointment";
  if (["tower_stock_broker", "tower_gold_exchange", "tower_accounting", "tower_insurance", "tower_realty"].includes(businessKey)) return "finance";
  if (["tower_jeweler", "tower_tailor", "tower_terminal_repair", "tower_import_export", "tower_mineral_rights", "tower_law", "tower_weapons_licensing"].includes(businessKey)) return "day";
  if (/restaurant|cafeteria|florist/i.test(category)) return "food";
  return "service";
}

export function businessOfficeHours(businessKey: string, category = "") {
  const profile = businessOfficeHoursProfile(businessKey, category);
  return { profile, windows: officeHoursFor(profile) };
}

export function officeHoursLabel(profile: OfficeHoursProfile): string {
  return OFFICE_HOURS[profile]
    .map((window) => `${window.open}–${window.close}`)
    .join(" / ");
}
// Owned-property source of truth (client mirror).
//
// The real-estate showroom (RealtyStore), the pledge store, and the personal
// office (PabloOffice) all need to agree on WHAT the player owns and WHICH
// artwork represents it. The authoritative record lives in the salaryman save
// blob (`data.office` / `data.home`, written server-side by the atomic
// /real-estate/acquire endpoint). This module is the client-side mirror: it
// reads/writes the same `sm_save` localStorage blob so every page can render
// the owned property instantly without a server round-trip, and keeps the
// legacy `salaryman_office_tier` key in sync so the office interior scales.

import { setSalarymanOfficeTier, type SalarymanOfficeTier } from "./tutorial-progress";
import type { PropertyCustomization } from "../gameSystems";

export type OfficeTenure = "rent" | "own";
export type PropertyKind = "home" | "office";

export interface PropertyRenovation {
  themeColor?: string;   // accent hex applied to banners + interior lighting
  signage?: string;      // 1–18 char label override for the banner
  lighting?: "dim" | "normal" | "bright";
  renovatedAt?: string;  // ISO of the last renovation
}

export interface OwnedProperty {
  artKey: string;        // Nano Banana art key, shared with the realty card
  propertyKey: string;   // canonical id (same as artKey)
  name: string;          // display name, e.g. "CORNER OFFICE"
  kind: PropertyKind;
  tier: SalarymanOfficeTier; // interior scale bucket
  tenure: OfficeTenure;
  acquiredAt: string;
  price?: number;        // ƒ paid
  monthly?: number;      // ƒ/mo at time of acquisition
  customization?: PropertyRenovation; // cosmetic renovation (swatch/signage/lighting)
}

// artKey -> interior tier (drives PixelOffice room scale / head-count). The
// art itself distinguishes the high tiers; the interior only has four buckets.
const OFFICE_ARTKEY_TIER: Record<string, SalarymanOfficeTier> = {
  property_apartment_office: "studio",
  property_coworking_suite: "coworking",
  property_corner_office: "suite",
  property_warehouse: "suite",
  property_hq_floor: "suite",
  property_tower: "suite",
  property_campus: "suite",
};

export function tierForArtKey(artKey: string): SalarymanOfficeTier {
  return OFFICE_ARTKEY_TIER[artKey] ?? "capsule";
}

const SAVE_KEY = "sm_save";

function readSave(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  try {
    const r = window.localStorage.getItem(SAVE_KEY);
    return r ? (JSON.parse(r) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function patchSave(patch: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    const cur = readSave() ?? {};
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ ...cur, ...patch }));
  } catch {
    /* ignore quota / serialization errors */
  }
}

function asOwned(v: unknown): OwnedProperty | null {
  return v && typeof v === "object" && typeof (v as OwnedProperty).artKey === "string"
    ? (v as OwnedProperty)
    : null;
}

export function getOwnedOffice(): OwnedProperty | null {
  return asOwned(readSave()?.office);
}

export function getOwnedHome(): OwnedProperty | null {
  return asOwned(readSave()?.home);
}

/**
 * Persist an owned property into the local save mirror after a successful
 * server acquire. For offices we also mirror the interior tier so PabloOffice
 * renders the right room before the cloud save loads.
 */
export function setOwnedPropertyLocal(p: OwnedProperty): void {
  if (p.kind === "office") {
    patchSave({ office: p });
    setSalarymanOfficeTier(p.tier);
  } else {
    patchSave({ home: p });
  }
}

/** Replace both local deed mirrors from one authoritative save slot. */
export function syncOwnedPropertiesLocal(office: OwnedProperty | null, home: OwnedProperty | null): void {
  patchSave({ office, home });
  if (office) setSalarymanOfficeTier(office.tier);
}

/**
 * Read-only: the deed customization (theme color / signage / lighting) applied
 * to the player's personal office, if any. The in-world building customizer
 * writes `data.propertyCustomization` keyed by building id; the office maps to
 * the player's workstation building (cached on `sm_char.workstation`). The
 * /office view only REFLECTS this — it never sets it. Returns undefined when
 * nothing has been customized (office then renders the default grade).
 */
export function getOwnedOfficeCustomization(): PropertyCustomization | undefined {
  if (typeof window === "undefined") return undefined;
  const save = readSave();
  const map = save && save.propertyCustomization && typeof save.propertyCustomization === "object"
    ? (save.propertyCustomization as Record<string, PropertyCustomization>)
    : null;
  if (!map) return undefined;
  // The office building id: workstation on the save, else the cached character.
  let officeBid: string | null =
    (typeof save?.workstation === "string" && save.workstation) ||
    (typeof (save as { buildingId?: unknown })?.buildingId === "string"
      ? ((save as { buildingId: string }).buildingId)
      : null);
  if (!officeBid) {
    try {
      const ch = window.localStorage.getItem("sm_char");
      if (ch) {
        const c = JSON.parse(ch) as { workstation?: unknown };
        if (typeof c.workstation === "string") officeBid = c.workstation;
      }
    } catch {
      /* ignore malformed char cache */
    }
  }
  if (!officeBid) return undefined;
  return map[officeBid];
}

export function getFiatBalanceLocal(): number {
  return Number(readSave()?.salary ?? 0);
}

export function setFiatBalanceLocal(n: number): void {
  patchSave({ salary: Math.max(0, Math.floor(n)) });
}

import { ApiError, USE_MOCKS } from "./client";
import type { Category, PersonContribution, PersonProfile, PersonRef, PersonReliability, TopDocument } from "./types";

/**
 * People directory + v2 person profile. Mirrors backend/app/schemas.py (SolvedCase, PersonProfileV2).
 * Falls back to the in-memory fixtures (src/api/mocks/people.ts) when mocks are on, or when the
 * backend does not serve these endpoints yet (404/405/501) or is unreachable.
 */

export interface SolvedCase {
  dossier_item_id: string;
  client_label: string;
  category: Category;
  title: string;
  date: string;
}

/** PersonContribution plus the client it belongs to (optional: v1 backend omits it). */
export interface ClientContribution extends PersonContribution {
  client_id?: string;
  client_label?: string;
}

export interface PersonProfileV2 extends PersonProfile {
  contributions: ClientContribution[];
  title: string;
  location: string;
  languages: string[];
  bio: string;
  years_at_sdworx: number | null;
  solved_cases: SolvedCase[];
  documents: TopDocument[];
  clients_count: number;
  total_hours: number;
  /** Optional work email. Only used for mailto when it passes isValidEmail. */
  email?: string;
}

export interface PersonListItem {
  person: PersonRef;
  domains: string[];
  countries?: string[];
  reliability: PersonReliability;
  title?: string;
  location?: string;
  solved_count?: number;
  solved_clients_count?: number;
}

const BASE = import.meta.env.VITE_API_BASE || "/api";
const PERSON_ID = /^p-[a-z0-9-]{1,38}$/;
const FALLBACK_STATUSES = new Set([404, 405, 501]);

export function isValidEmail(value: string | undefined | null): value is string {
  return typeof value === "string" && value.length <= 254 && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value);
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { method: "GET", credentials: "same-origin", headers: { Accept: "application/json" } });
  if (!res.ok) throw new ApiError(res.status, `Request failed with status ${res.status}`);
  return (await res.json()) as T;
}

function shouldFallBack(err: unknown): boolean {
  if (err instanceof ApiError) return FALLBACK_STATUSES.has(err.status);
  return true; // network error / invalid JSON: backend not there, use demo data
}

export async function listPeople(): Promise<PersonListItem[]> {
  const mocks = () => import("./mocks/people").then((m) => m.mockListPeople());
  if (USE_MOCKS) return mocks();
  try {
    const data = await getJson<PersonListItem[]>("/people");
    if (!Array.isArray(data)) return mocks();
    return data;
  } catch (err) {
    if (shouldFallBack(err)) return mocks();
    throw err;
  }
}

export async function getPersonProfile(id: string): Promise<PersonProfileV2> {
  if (!PERSON_ID.test(id)) throw new ApiError(404, "Unknown person");
  const { mockPersonProfile } = await import("./mocks/people");
  const mock = () => {
    const p = mockPersonProfile(id);
    if (!p) throw new ApiError(404, "Unknown person");
    return p;
  };
  if (USE_MOCKS) return mock();
  try {
    const data = await getJson<Partial<PersonProfileV2> & PersonProfile>(`/people/${encodeURIComponent(id)}`);
    const fallback = mockPersonProfile(id);
    // v1 contributions carry no client name: keep the richer fixture rows when we have them.
    const contributions = data.contributions as ClientContribution[] | undefined;
    if (fallback && contributions && !contributions.some((c) => c.client_label)) {
      (data as Partial<PersonProfileV2>).contributions = fallback.contributions;
    }
    // v1 backend: fill the v2-only fields from the fixtures so the drawer stays complete.
    return {
      title: "",
      location: "",
      languages: [],
      bio: "",
      years_at_sdworx: null,
      solved_cases: [],
      documents: [],
      clients_count: data.contributions?.length ?? 0,
      total_hours: (data.contributions ?? []).reduce((s, c) => s + c.hours, 0),
      ...(fallback ?? {}),
      ...stripEmpty(data),
    } as PersonProfileV2;
  } catch (err) {
    if (shouldFallBack(err)) return mock();
    throw err;
  }
}

/** Drops empty strings/arrays/null so a partial backend answer doesn't wipe richer demo data. */
function stripEmpty<T extends object>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj) as [keyof T, T[keyof T]][]) {
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

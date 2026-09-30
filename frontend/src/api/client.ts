import type {
  Answer,
  AskRequest,
  ClientRecord,
  ClientSummary,
  Conflict,
  ConflictResolve,
  CreateAnywayRequest,
  DossierItem,
  EventCreate,
  EventResult,
  Experts,
  LoginRequest,
  Me,
  PersonProfile,
  Precedent,
  Solution,
  SolutionRequest,
  Category,
} from "./types";

/**
 * Typed API client. Auth is an httpOnly cookie set by the backend: nothing is stored in the
 * browser by this code. In dev, Vite proxies /api to the backend so requests are same-origin.
 * With VITE_USE_MOCKS=true, requests are answered by in-memory fixtures (src/api/mocks).
 */

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";
const BASE = import.meta.env.VITE_API_BASE || "/api";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

/** Generic, user-safe copy. Server detail is never shown except for the login message. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.status) {
      case 401:
        return "Your session has ended. Log in again.";
      case 403:
        return "You can view this client, but you are not assigned to change it.";
      case 404:
        return "We couldn't find that item.";
      case 422:
        return "Some fields are not valid. Check them and try again.";
      case 429:
        return "Too many requests. Wait a moment and try again.";
    }
  }
  return "Something went wrong. Try again in a moment.";
}

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

/** The auth provider registers this so any 401 sends the user back to the login screen. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

type Method = "GET" | "POST";

export interface RawResponse {
  status: number;
  body: unknown;
}

async function send(method: Method, path: string, body?: unknown): Promise<RawResponse> {
  if (USE_MOCKS) {
    const { mockFetch } = await import("./mocks/server");
    return mockFetch(method, path, body);
  }
  const res = await fetch(BASE + path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed: unknown = null;
  if (res.status !== 204) {
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("application/json")) {
      parsed = await res.json().catch(() => null);
    }
  }
  return { status: res.status, body: parsed };
}

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const { status, body: data } = await send(method, path, body);
  if (status === 401 && path !== "/auth/login" && path !== "/auth/me") {
    onUnauthorized?.();
  }
  if (status < 200 || status >= 300) {
    throw new ApiError(status, `Request failed with status ${status}`);
  }
  return data as T;
}

const seg = (value: string) => encodeURIComponent(value);

function qs(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const CLIENT_ID_PATTERN = /^cl-[a-z0-9-]{1,36}$/;

export const api = {
  login: (body: LoginRequest) => request<Me>("POST", "/auth/login", body),
  logout: () => request<void>("POST", "/auth/logout"),
  me: () => request<Me>("GET", "/auth/me"),

  clients: () => request<ClientSummary[]>("GET", "/clients"),
  client: (clientId: string) => request<ClientRecord>("GET", `/clients/${seg(clientId)}`),
  experts: (clientId: string, category?: Category) =>
    request<Experts>("GET", `/clients/${seg(clientId)}/experts${qs({ category })}`),

  createEvent: (body: EventCreate) => request<EventResult>("POST", "/events", body),
  createAnyway: (itemId: string, body: CreateAnywayRequest) =>
    request<DossierItem>("POST", `/dossier-items/${seg(itemId)}/create-anyway`, body),

  conflicts: (params: { client_id?: string; status?: "pending" | "resolved" }) =>
    request<Conflict[]>("GET", `/conflicts${qs(params)}`),
  resolveConflict: (conflictId: string, body: ConflictResolve) =>
    request<Conflict>("POST", `/conflicts/${seg(conflictId)}/resolve`, body),

  precedents: (params: { q: string; exclude_client_id?: string; category?: Category }) =>
    request<Precedent[]>("GET", `/search/precedents${qs(params)}`),
  person: (personId: string) => request<PersonProfile>("GET", `/people/${seg(personId)}`),

  ask: (body: AskRequest) => request<Answer>("POST", "/ask", body),
  buildSolution: (body: SolutionRequest) => request<Solution>("POST", "/solutions", body),
};

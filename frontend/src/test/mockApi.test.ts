import { describe, expect, it } from "vitest";
import { mockFetch } from "../api/mocks/server";
import type { EventResult } from "../api/types";

describe("mock API (demo scenarios)", () => {
  it("rejects bad logins with the generic message", async () => {
    const r = await mockFetch("POST", "/auth/login", { email: "nobody@example.com", password: "x" });
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ detail: "Email or password is incorrect" });
  });

  it("flags the full-price invoice as a high within-record conflict", async () => {
    expect((await mockFetch("POST", "/auth/login", { email: "sofie@example.com", password: "demo" })).status).toBe(200);
    const r = await mockFetch("POST", "/events", { client_id: "cl-kaneka", type: "note", text: "Invoice the follow-up at full price." });
    expect(r.status).toBe(201);
    const body = r.body as EventResult;
    expect(body.conflicts_within_record[0].severity).toBe("high");
    expect(body.conflicts_within_record[0].explanation).toBe(
      "You're invoicing full price, but Jan Peeters promised a 10% discount in writing on 14 Mar 2025.",
    );
  });

  it("links a restated discount as a confirmation", async () => {
    await mockFetch("POST", "/auth/login", { email: "sofie@example.com", password: "demo" });
    const r = await mockFetch("POST", "/events", { client_id: "cl-kaneka", type: "meeting", text: "HR restated the 10% discount." });
    const body = r.body as EventResult;
    expect(body.dedup[0].level).toBe("claim");
    expect(body.confirmed_claims[0].evidence_count).toBeGreaterThanOrEqual(4);
  });

  it("refuses writes on clients the consultant is not assigned to", async () => {
    await mockFetch("POST", "/auth/login", { email: "sofie@example.com", password: "demo" });
    const r = await mockFetch("POST", "/events", { client_id: "cl-skhitech", type: "note", text: "Anything at all" });
    expect(r.status).toBe(403);
  });
});

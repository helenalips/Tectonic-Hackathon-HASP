import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { people } from "../api/mocks/fixtures";
import { previewCheck } from "../api/mocks/server";
import type { HorizontalFinding } from "../api/types";
import { replaceQuote } from "../components/assistant/actions";
import { CheckResultView } from "../components/assistant/CheckResultView";
import { HighlightedTextarea } from "../components/assistant/HighlightedTextarea";
import { GridMap } from "../components/grid/GridMap";
import { docsFromCheck, looksLikeDraft } from "../components/grid/gridData";
import { FindingCard } from "../components/grid/Lanes";
import { PersonChip, ProfileDrawerProvider } from "../components/profile/ProfileDrawer";

const DRAFT =
  "Dear An,\n\nThank you for confirming the scope for your 350 employees. The follow-up is invoiced at full price, as per our standard rate card.\n\nKind regards,\nSofie";

function kanekaCheck() {
  return previewCheck({ client_id: "cl-kaneka", channel: "email", text: DRAFT });
}

function wrap(ui: React.ReactNode) {
  return render(
    <MemoryRouter>
      <ProfileDrawerProvider>{ui}</ProfileDrawerProvider>
    </MemoryRouter>,
  );
}

describe("preview check engine", () => {
  it("flags the Kaneka full-price email as a horizontal conflict with an exact quote", () => {
    const r = kanekaCheck();
    const conflict = r.horizontal_findings.find((f) => f.kind === "conflict")!;
    expect(r.horizontal.status).toBe("conflict");
    expect(DRAFT).toContain(conflict.draft_quote);
    expect(conflict.sources[0].author.name).toBe("Jan Peeters");
    expect(r.similar_cases.length).toBeGreaterThanOrEqual(3);
    expect(looksLikeDraft(DRAFT)).toBe(true);
  });
});

describe("GridMap", () => {
  it("renders the horizontal row, the vertical column and opens a document from a dot", async () => {
    const r = kanekaCheck();
    wrap(<GridMap clientName="Kaneka Belgium" docs={docsFromCheck(r)} cases={r.similar_cases} newItemLabel="Your email" />);
    expect(screen.getByText("checked against the record ↔")).toBeInTheDocument();
    expect(screen.getByText(/↕ checked against all clients/)).toBeInTheDocument();
    expect(screen.getByText("Your email")).toBeInTheDocument();
    const solved = screen.getAllByRole("button", { name: /Same problem, already solved at/ });
    expect(solved.length).toBe(Math.min(5, r.similar_cases.length));
    await userEvent.click(screen.getAllByRole("button", { name: /conflicts with the new item/ })[0]);
    expect(screen.getByRole("article", { name: /^Source:/ })).toBeInTheDocument();
  });

  it("splits every result into a horizontal and a vertical lane", () => {
    wrap(<CheckResultView idPrefix="t" result={kanekaCheck()} onApply={() => undefined} />);
    const hz = screen.getByRole("region", { name: "Kaneka Belgium's record" });
    const vt = screen.getByRole("region", { name: "Across all clients" });
    expect(within(hz).getByText(/Horizontal · checked against the record/)).toBeInTheDocument();
    expect(within(hz).getByRole("button", { name: /Update my email/ })).toBeInTheDocument();
    expect(within(vt).getByText(/Vertical · checked against all clients/)).toBeInTheDocument();
    // Calm by default: the rest of the similar cases sit behind "… N more"
    const more = within(vt).getByRole("button", { name: /more similar case/ });
    fireEvent.click(more);
    expect(within(vt).getAllByRole("article").length).toBeGreaterThanOrEqual(3);
  });
});

function Harness({ finding }: { finding: HorizontalFinding }) {
  const [text, setText] = useState(DRAFT);
  return (
    <>
      <HighlightedTextarea aria-label="Body" value={text} onValueChange={setText} highlights={[{ quote: finding.draft_quote, tone: "conflict" }]} />
      <FindingCard f={finding} onApply={(f) => setText((t) => replaceQuote(t, f.draft_quote, f.suggested_rewrite!))} />
    </>
  );
}

describe("Update my email", () => {
  it("replaces the conflicting quote with the suggested rewrite", async () => {
    const f = kanekaCheck().horizontal_findings.find((x) => x.kind === "conflict")!;
    wrap(<Harness finding={f} />);
    const body = screen.getByLabelText("Body") as HTMLTextAreaElement;
    expect(body.value).toContain(f.draft_quote);
    await userEvent.click(screen.getByRole("button", { name: /Update my email/ }));
    expect(body.value).not.toContain(f.draft_quote);
    expect(body.value).toContain(f.suggested_rewrite!);
  });

  it("highlights with <mark> elements, never injected HTML", () => {
    const f = kanekaCheck().horizontal_findings.find((x) => x.kind === "conflict")!;
    const { container } = wrap(<Harness finding={f} />);
    const mark = container.querySelector('mark[data-tone="conflict"]');
    expect(mark?.textContent).toBe(f.draft_quote.trim());
  });
});

describe("profile drawer", () => {
  it("opens from a person chip", async () => {
    wrap(<PersonChip person={people.jan} />);
    await userEvent.click(screen.getByRole("button", { name: /Jan Peeters/ }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

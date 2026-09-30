import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { people } from "../api/mocks/fixtures";
import { DuplicateNotice } from "../components/DuplicateNotice";

describe("DuplicateNotice", () => {
  it("explains a linked claim duplicate", () => {
    render(
      <DuplicateNotice
        decision={{
          level: "claim",
          outcome: "linked",
          matched_id: "doc-kan-email",
          matched_title: "Pay equity audit offer: 10% discount confirmed",
          matched_author: people.jan,
          matched_date: "2025-03-14T15:20:00Z",
          similarity: 1,
          reason: "Same fact: discount_pct = 10 %",
        }}
      />,
    );
    expect(
      screen.getByText(
        "Already known in this record, confirmed by Pay equity audit offer: 10% discount confirmed from Jan Peeters on 14 Mar 2025. Linked as confirmation.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/100% similar · Same fact/)).toBeInTheDocument();
  });

  it("shows the open dossier item and requires a reason to create a separate one", async () => {
    const onCreateAnyway = vi.fn(async () => {});
    render(
      <DuplicateNotice
        decision={{
          level: "dossier_item",
          outcome: "linked",
          matched_id: "di-kan-paygap",
          matched_title: "Adjusted and unadjusted pay gap report",
          matched_author: people.sofie,
          matched_date: "2026-09-10T08:45:00Z",
          similarity: 0.91,
          reason: "Same client, same category, item still open",
        }}
        handledBy="Sofie Maes"
        canOverride
        onCreateAnyway={onCreateAnyway}
      />,
    );
    expect(
      screen.getByText("This question is already open in Adjusted and unadjusted pay gap report, handled by Sofie Maes."),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create separate item" }));
    const submit = screen.getByRole("button", { name: "Create separate item" });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Why is this a separate item?"), "short");
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Why is this a separate item?"), " but now long enough");
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    expect(onCreateAnyway).toHaveBeenCalledWith("short but now long enough");
  });
});

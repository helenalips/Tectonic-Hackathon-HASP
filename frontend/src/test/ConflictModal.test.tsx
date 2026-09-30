import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { kanekaDiscountConflict } from "../api/mocks/fixtures";
import { ConflictModal } from "../components/ConflictModal";

describe("ConflictModal", () => {
  it("is an accessible, labelled modal dialog", () => {
    render(<ConflictModal conflict={kanekaDiscountConflict} onClose={() => {}} onResolve={async () => {}} />);
    const dialog = screen.getByRole("dialog", { name: "Resolve this conflict" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText(/Jan Peeters promised a 10% discount in writing on 14 Mar 2025/)).toBeInTheDocument();
  });

  it("requires a note for 'Both are valid'", async () => {
    const onResolve = vi.fn(async () => {});
    render(<ConflictModal conflict={kanekaDiscountConflict} onClose={() => {}} onResolve={onResolve} />);
    const save = screen.getByRole("button", { name: "Save decision" });
    expect(save).toBeDisabled();

    await userEvent.click(screen.getByRole("radio", { name: /Both are valid/ }));
    const note = screen.getByLabelText(/Note \(required\)/);
    expect(note).toBeRequired();
    expect(save).toBeDisabled();

    await userEvent.type(note, "Discount applies to the audit, full price to the new module.");
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(onResolve).toHaveBeenCalledWith({
      resolution: "both_valid",
      note: "Discount applies to the audit, full price to the new module.",
    });
  });

  it("does not require a note for 'Update the record'", async () => {
    const onResolve = vi.fn(async () => {});
    render(<ConflictModal conflict={kanekaDiscountConflict} onClose={() => {}} onResolve={onResolve} />);
    await userEvent.click(screen.getByRole("radio", { name: /Update the record/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save decision" }));
    expect(onResolve).toHaveBeenCalledWith({ resolution: "updated_record" });
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<ConflictModal conflict={kanekaDiscountConflict} onClose={onClose} onResolve={async () => {}} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { TrustScore } from "../api/types";
import { TrustBadge } from "../components/TrustBadge";

const factors: TrustScore["factors"] = [
  { name: "recency", value: 0.9, weight: 0.2, reason: "Updated 12 days ago" },
  { name: "ownership", value: 0, weight: 0.15, reason: "No owner assigned" },
];

function trust(score: number): TrustScore {
  return { score, label: score >= 75 ? "Reliable" : score >= 50 ? "Verify" : "Uncertain", factors };
}

describe("TrustBadge", () => {
  it.each([
    [92, "Reliable", "shield-check"],
    [75, "Reliable", "shield-check"],
    [74, "Verify", "alert-triangle"],
    [50, "Verify", "alert-triangle"],
    [49, "Uncertain", "shield-alert"],
    [12, "Uncertain", "shield-alert"],
  ])("score %i shows label %s with icon %s", (score, label, icon) => {
    const { container } = render(<TrustBadge trust={trust(score)} />);
    const badge = screen.getByLabelText(`Trust: ${label}, score ${score} of 100`);
    expect(badge).toHaveTextContent(label);
    expect(badge).toHaveTextContent(String(score));
    expect(container.querySelector(`svg[data-icon="${icon}"]`)).not.toBeNull();
  });

  it("derives the band from the score, not from colour alone", () => {
    // Even if a stale label arrives, icon + label follow the score.
    render(<TrustBadge trust={{ score: 30, label: "Reliable", factors }} />);
    expect(screen.getByText("Uncertain")).toBeInTheDocument();
  });

  it("expands into the factor table", async () => {
    render(<TrustBadge trust={trust(80)} expandable />);
    const button = screen.getByRole("button", { name: /Reliable, score 80/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Recency")).toBeInTheDocument();
    expect(screen.getByText("No owner assigned")).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
  });
});

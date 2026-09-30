import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { kanekaDiscountClaim, people } from "../api/mocks/fixtures";
import { AnswerText } from "../pages/AskPage";

describe("AnswerText", () => {
  it("turns [n] markers into source links and renders markup as plain text", () => {
    const citations = [
      { ref: 1, document_id: "doc-kan-email", title: "Pay equity audit offer", author: people.jan, date: "2025-03-14T15:20:00Z", trust: kanekaDiscountClaim.trust, confirmed_by: 3 },
    ];
    const { container } = render(<AnswerText text={"A 10% discount applies [1]. <b>bold</b> [9]"} citations={citations} />);
    const link = screen.getByRole("link", { name: "Source 1: Pay equity audit offer" });
    expect(link).toHaveAttribute("href", "#source-1");
    expect(container.querySelector("b")).toBeNull();
    expect(container).toHaveTextContent("<b>bold</b> [9]");
  });
});

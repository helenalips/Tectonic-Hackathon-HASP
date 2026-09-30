import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PersonChip, ProfileDrawerProvider } from "../components/profile/ProfileDrawer";
import { PeoplePage } from "../pages/people/PeoplePage";

// No backend in tests: every request fails with 404 so the API layer falls back to the fixtures.
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
});

const sofie = { id: "p-sofie", name: "Sofie Maes", role: "Pay transparency consultant", team: "Reward & Compliance BE" };

describe("ProfileDrawer", () => {
  it("opens with the profile and closes on Escape, returning focus", async () => {
    const user = userEvent.setup();
    render(
      <ProfileDrawerProvider>
        <PersonChip person={sofie} />
      </ProfileDrawerProvider>,
    );
    const trigger = screen.getByRole("button", { name: /Sofie Maes/ });
    await user.click(trigger);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(await within(dialog).findByRole("heading", { name: "Sofie Maes" })).toBeInTheDocument();
    expect(dialog).toHaveAccessibleName("Sofie Maes");
    expect(within(dialog).getByText("Problems solved across clients")).toBeInTheDocument();
    expect(within(dialog).getByText("Client records")).toBeInTheDocument();
    expect(within(dialog).getByText("Pay framework and pay gap reporting after a merger")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /Email Sofie/ })).toHaveAttribute("href", "mailto:sofie.maes@example.com");
    expect(within(dialog).getAllByRole("button", { name: /Trust: / }).length).toBeGreaterThan(0);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("shows an error state for an unknown person", async () => {
    const user = userEvent.setup();
    render(
      <ProfileDrawerProvider>
        <PersonChip person={{ ...sofie, id: "p-nobody", name: "Nobody Here" }} />
      </ProfileDrawerProvider>,
    );
    await user.click(screen.getByRole("button", { name: /Nobody Here/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't find that item.");
  });
});

describe("PeoplePage", () => {
  it("lists 16+ people and filters by domain", async () => {
    const user = userEvent.setup();
    render(
      <ProfileDrawerProvider>
        <PeoplePage />
      </ProfileDrawerProvider>,
    );
    const list = await screen.findByRole("list", { name: "People" });
    expect(within(list).getAllByRole("listitem").length).toBeGreaterThanOrEqual(16);

    await user.selectOptions(screen.getByLabelText("Domain"), "Pay transparency");
    const names = within(screen.getByRole("list", { name: "People" }))
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label")?.split(",")[0]);
    expect(names.sort()).toEqual(["Lucía García", "Marc Dubois", "Sofie Maes"]);

    await user.click(screen.getByRole("button", { name: /Sofie Maes/ }));
    expect(await screen.findByRole("dialog")).toHaveAccessibleName("Sofie Maes");
  });
});

describe("people source safety", () => {
  const root = resolve(__dirname, "..");
  const dirs = ["pages/people", "components/profile"].map((d) => join(root, d));
  const walk = (d: string): string[] =>
    readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
  const files = [...dirs.flatMap((d) => walk(d)), join(root, "api/people.ts"), join(root, "api/mocks/people.ts")];

  it("never renders raw HTML", () => {
    const needle = "dangerously" + "SetInnerHTML";
    expect(files.filter((f) => readFileSync(f, "utf8").includes(needle))).toEqual([]);
  });
});

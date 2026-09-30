import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|jsx?|css|html)$/.test(name) ? [p] : [];
  });
}

// Built from parts so this file does not match itself.
const FORBIDDEN = ["dangerously" + "SetInnerHTML", "inner" + "HTML", "outer" + "HTML", "local" + "Storage", "ev" + "al("];

describe("source safety", () => {
  const all = [...files(SRC), resolve(SRC, "../index.html")];

  it("scans a meaningful number of files", () => {
    expect(all.length).toBeGreaterThan(20);
  });

  it.each(FORBIDDEN)("no source file contains %s", (needle) => {
    const hits = all.filter((f) => readFileSync(f, "utf8").includes(needle));
    expect(hits).toEqual([]);
  });

  it("does not load scripts from other origins", () => {
    const html = readFileSync(resolve(SRC, "../index.html"), "utf8");
    expect(html).not.toMatch(/<script[^>]+src="https?:/);
  });
});

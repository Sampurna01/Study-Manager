import { describe, expect, it } from "vitest";
import { repairDecodedLatex, repairJsonLatex, repairStrings } from "../shared/latex";

// What a model typically emits: LaTeX with single backslashes inside JSON.
const RAW = String.raw`{"prompt":"Evaluate $\oint_C \text{Im}\bigg(\frac{f(z)}{z+1}\bigg)\,\text{d}z$ where $z \neq -1$ and $\nabla \cdot F$, with \right) and \alpha.\nNext line \"quoted\" \\sqrt{2}"}`;

describe("repairJsonLatex", () => {
  it("keeps LaTeX commands that JSON would misread", () => {
    const parsed = JSON.parse(repairJsonLatex(RAW));
    expect(parsed.prompt).toBe(
      String.raw`Evaluate $\oint_C \text{Im}\bigg(\frac{f(z)}{z+1}\bigg)\,\text{d}z$ where $z \neq -1$ and $\nabla \cdot F$, with \right) and \alpha.` +
        "\nNext line \"quoted\" " +
        String.raw`\sqrt{2}`,
    );
  });

  it("makes otherwise-invalid JSON parseable", () => {
    expect(() => JSON.parse(String.raw`{"a":"$\int_0^1 x\,dx$"}`)).toThrow();
    expect(JSON.parse(repairJsonLatex(String.raw`{"a":"$\int_0^1 x\,dx$"}`)).a).toBe(String.raw`$\int_0^1 x\,dx$`);
  });

  // Trade-off: a real tab directly before a letter is indistinguishable from \t starting
  // a LaTeX command (\text, \theta); LaTeX is far more common in answers, so it wins.
  it("leaves correct JSON unchanged", () => {
    const good = JSON.stringify({ a: String.raw`$\frac{1}{2}$ and $\text{x}$`, b: "line1\nline2\t42", c: "é é" });
    expect(repairJsonLatex(good)).toBe(good);
    expect(JSON.parse(repairJsonLatex(good))).toEqual(JSON.parse(good));
  });
});

describe("repairDecodedLatex", () => {
  it("restores commands from control characters in already-saved text", () => {
    const damaged = "$\text{Im}\bigg(\frac{f(z)}{z+1}\bigg)\text{d}z$"; // note: not String.raw
    expect(repairDecodedLatex(damaged)).toBe(String.raw`$\text{Im}\bigg(\frac{f(z)}{z+1}\bigg)\text{d}z$`);
    expect(repairDecodedLatex("$a \neq b$")).toBe(String.raw`$a \neq b$`);
    expect(repairDecodedLatex("$\right)$")).toBe(String.raw`$\right)$`);
  });

  it("keeps real newlines and tabs", () => {
    expect(repairDecodedLatex("Step 1\nStep 2")).toBe("Step 1\nStep 2");
    expect(repairDecodedLatex("a\t1")).toBe("a\t1");
  });

  it("works through nested objects", () => {
    expect(repairStrings({ q: [{ p: "\frac{1}{2}" }], n: 3 })).toEqual({ q: [{ p: String.raw`\frac{1}{2}` }], n: 3 });
  });
});

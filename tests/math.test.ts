import { describe, expect, it } from "vitest";
import { splitMath } from "../client/src/MathText";

describe("splitMath", () => {
  it("finds inline and display maths", () => {
    expect(splitMath("Find $\\det(A)$ where $$A = \\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}$$.")).toEqual([
      { text: "Find " },
      { tex: "\\det(A)", display: false },
      { text: " where " },
      { tex: "A = \\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}", display: true },
      { text: "." },
    ]);
  });

  it("supports \\( \\) and \\[ \\] delimiters", () => {
    expect(splitMath("x \\(a^2\\) y \\[b\\]")).toEqual([
      { text: "x " },
      { tex: "a^2", display: false },
      { text: " y " },
      { tex: "b", display: true },
    ]);
  });

  it("leaves prices alone", () => {
    expect(splitMath("It costs $5 and $10 today.")).toEqual([{ text: "It costs $5 and $10 today." }]);
    expect(splitMath("Pay $5, then $x$ more")).toEqual([{ text: "Pay $5, then " }, { tex: "x", display: false }, { text: " more" }]);
  });
});

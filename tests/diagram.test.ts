import { describe, expect, it } from "vitest";
import { EMPTY_DIAGRAM, cleanDiagram } from "../shared/diagram";
import { layoutFlow, plainLabel } from "../client/src/Diagram";
import { demoDiagram } from "../server/demo";

describe("cleanDiagram", () => {
  it("drops formulas it can't evaluate and keeps the rest", () => {
    const d = cleanDiagram({
      ...EMPTY_DIAGRAM,
      kind: "plot",
      functions: [
        { expr: "x^2 - 3*x + 2", label: "f" },
        { expr: "window.alert(1)", label: "bad" },
        { expr: "y = sin(x)", label: "g" },
      ],
    });
    expect(d.functions.map((f) => f.label)).toEqual(["f", "g"]);
  });

  it("fixes reversed or missing ranges from the content", () => {
    const d = cleanDiagram({ ...EMPTY_DIAGRAM, kind: "plot", xMin: 5, xMax: -5, yMin: 0, yMax: 0, points: [{ x: 10, y: 20, label: "p" }] });
    expect(d.xMin).toBeLessThan(0);
    expect(d.xMax).toBeGreaterThan(10);
    expect(d.yMax).toBeGreaterThan(20);
  });

  it("turns empty diagrams into 'none'", () => {
    expect(cleanDiagram({ ...EMPTY_DIAGRAM, kind: "plot" }).kind).toBe("none");
    expect(cleanDiagram({ ...EMPTY_DIAGRAM, kind: "flow" }).kind).toBe("none");
  });

  it("removes flow edges to unknown nodes, self-loops and duplicate nodes", () => {
    const d = cleanDiagram({
      ...EMPTY_DIAGRAM,
      kind: "flow",
      nodes: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
        { id: "a", label: "dup" },
      ],
      edges: [
        { from: "a", to: "b", label: "" },
        { from: "a", to: "zzz", label: "" },
        { from: "b", to: "b", label: "" },
      ],
    });
    expect(d.nodes).toHaveLength(2);
    expect(d.edges).toEqual([{ from: "a", to: "b", label: "" }]);
  });
});

describe("layoutFlow", () => {
  it("ranks nodes by their longest path and survives cycles", () => {
    const nodes = ["a", "b", "c", "d"].map((id) => ({ id, label: id }));
    const rank = layoutFlow({
      ...EMPTY_DIAGRAM,
      kind: "flow",
      nodes,
      edges: [
        { from: "a", to: "b", label: "" },
        { from: "b", to: "c", label: "" },
        { from: "a", to: "c", label: "" },
        { from: "c", to: "d", label: "" },
        { from: "d", to: "b", label: "loop" },
      ],
    });
    expect(rank.get("a")).toBe(0);
    expect(rank.get("b")).toBe(1);
    expect(rank.get("c")).toBe(2);
    expect(rank.get("d")).toBe(3);
  });
});

describe("plainLabel", () => {
  it("turns LaTeX into readable text", () => {
    expect(plainLabel("$\\lambda_1 = 3$")).toBe("λ₁ = 3");
    expect(plainLabel("$x^2$")).toBe("x²");
    expect(plainLabel("\\frac{1}{2}")).toBe("(1)/(2)");
  });
});

describe("demo diagrams", () => {
  it("draws plots for functions and eigenvectors, and flows for processes", () => {
    expect(demoDiagram("Taylor series of sin x").kind).toBe("plot");
    expect(demoDiagram("eigenvectors of B").vectors.length).toBeGreaterThan(0);
    expect(demoDiagram("First list what you know. Then pick the right equation. Finally solve it and check the units.").kind).toBe("flow");
  });
});

import { z } from "zod/v4";
import { tryCompile } from "./expr";

/**
 * A diagram the AI describes and the app draws itself. Every field is always
 * present (empty when unused) so it works well with structured outputs.
 */
export const DiagramSchema = z.object({
  kind: z
    .enum(["plot", "flow", "none"])
    .describe(
      "plot = graph on axes (functions, points, vectors, circles; also the complex plane); flow = boxes and arrows (processes, steps, cycles, hierarchies, relationships); none = a diagram wouldn't help",
    ),
  title: z.string(),
  caption: z.string().describe("One sentence telling the student what to notice"),
  xMin: z.number(),
  xMax: z.number(),
  yMin: z.number(),
  yMax: z.number(),
  xLabel: z.string().describe('e.g. "x", "t (s)", "Re"'),
  yLabel: z.string().describe('e.g. "y", "v (m/s)", "Im"'),
  equalAxes: z.boolean().describe("true when distances/angles matter: geometry, vectors, the complex plane, circles"),
  functions: z
    .array(
      z.object({
        expr: z
          .string()
          .describe("y as an expression in x, e.g. x^2 - 3*x + 2, sin(x), exp(-x)*cos(2*x). Allowed: + - * / ^ ( ), sin cos tan exp ln log sqrt abs, pi, e"),
        label: z.string(),
      }),
    )
    .describe("Curves y = f(x) to draw"),
  points: z.array(z.object({ x: z.number(), y: z.number(), label: z.string() })),
  vectors: z.array(z.object({ fromX: z.number(), fromY: z.number(), toX: z.number(), toY: z.number(), label: z.string() })),
  circles: z.array(z.object({ cx: z.number(), cy: z.number(), r: z.number(), label: z.string() })),
  nodes: z.array(z.object({ id: z.string(), label: z.string() })).describe("Boxes in a flow diagram"),
  edges: z.array(z.object({ from: z.string(), to: z.string(), label: z.string() })).describe("Arrows between node ids"),
});
export type Diagram = z.infer<typeof DiagramSchema>;

export const DiagramRequestSchema = z.object({
  content: z.string().min(1),
  about: z.string().min(1, "Nothing to draw"),
});

const LIMITS = { functions: 6, points: 24, vectors: 12, circles: 8, nodes: 16, edges: 30 };
const finite = (...n: number[]) => n.every((v) => Number.isFinite(v));

function niceRange(values: number[], fallback: [number, number]): [number, number] {
  const v = values.filter(Number.isFinite);
  if (!v.length) return fallback;
  let lo = Math.min(...v);
  let hi = Math.max(...v);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * 0.1;
  return [lo - pad, hi + pad];
}

/**
 * Make a diagram safe and drawable: drop formulas that can't be evaluated and
 * items with bad numbers, fix empty or reversed ranges, and cap sizes.
 */
export function cleanDiagram(d: Diagram): Diagram {
  const out: Diagram = {
    ...d,
    functions: d.functions.filter((f) => f.expr.trim() && tryCompile(f.expr)).slice(0, LIMITS.functions),
    points: d.points.filter((p) => finite(p.x, p.y)).slice(0, LIMITS.points),
    vectors: d.vectors.filter((v) => finite(v.fromX, v.fromY, v.toX, v.toY)).slice(0, LIMITS.vectors),
    circles: d.circles.filter((c) => finite(c.cx, c.cy, c.r) && c.r > 0).slice(0, LIMITS.circles),
    nodes: [],
    edges: [],
  };

  if (d.kind === "flow") {
    const seen = new Set<string>();
    out.nodes = d.nodes
      .filter((n) => n.id.trim() && !seen.has(n.id) && seen.add(n.id))
      .slice(0, LIMITS.nodes);
    const ids = new Set(out.nodes.map((n) => n.id));
    out.edges = d.edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to).slice(0, LIMITS.edges);
    if (!out.nodes.length) out.kind = "none";
    return out;
  }

  if (d.kind !== "plot") return { ...out, kind: "none" };
  const hasContent = out.functions.length || out.points.length || out.vectors.length || out.circles.length;
  if (!hasContent) return { ...out, kind: "none" };

  // x range: trust the model if sensible, else fit the geometry.
  const xs = [
    ...out.points.map((p) => p.x),
    ...out.vectors.flatMap((v) => [v.fromX, v.toX]),
    ...out.circles.flatMap((c) => [c.cx - c.r, c.cx + c.r]),
    0,
  ];
  let [xMin, xMax] = finite(d.xMin, d.xMax) && d.xMax > d.xMin ? [d.xMin, d.xMax] : niceRange(xs, [-5, 5]);
  if (xMax - xMin > 1e6) [xMin, xMax] = niceRange(xs, [-5, 5]);

  // y range: trust the model if sensible, else fit points and sampled curves.
  let [yMin, yMax] = [d.yMin, d.yMax];
  if (!(finite(yMin, yMax) && yMax > yMin && yMax - yMin < 1e6)) {
    const ys = [
      ...out.points.map((p) => p.y),
      ...out.vectors.flatMap((v) => [v.fromY, v.toY]),
      ...out.circles.flatMap((c) => [c.cy - c.r, c.cy + c.r]),
      0,
    ];
    for (const f of out.functions) {
      const fn = tryCompile(f.expr)!;
      for (let i = 0; i <= 50; i++) {
        const y = fn(xMin + ((xMax - xMin) * i) / 50);
        if (Number.isFinite(y) && Math.abs(y) < 1e6) ys.push(y);
      }
    }
    [yMin, yMax] = niceRange(ys, [-5, 5]);
  }
  return { ...out, xMin, xMax, yMin, yMax };
}

export const EMPTY_DIAGRAM: Diagram = {
  kind: "none",
  title: "",
  caption: "",
  xMin: -5,
  xMax: 5,
  yMin: -5,
  yMax: 5,
  xLabel: "x",
  yLabel: "y",
  equalAxes: false,
  functions: [],
  points: [],
  vectors: [],
  circles: [],
  nodes: [],
  edges: [],
};

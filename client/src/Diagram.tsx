import { useId, useMemo, type ReactNode } from "react";
import type { Diagram as DiagramData } from "../../shared/diagram";
import { tryCompile } from "../../shared/expr";
import { repairDecodedLatex } from "../../shared/latex";

const W = 560;
const PAD = { left: 48, right: 20, top: 16, bottom: 40 };
const SERIES = 6;

/** Turn common LaTeX in labels into readable text: $\lambda_1$ → λ₁. */
export function plainLabel(s: string): string {
  const greek: Record<string, string> = {
    alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", theta: "θ", lambda: "λ", mu: "μ", pi: "π",
    rho: "ρ", sigma: "σ", tau: "τ", phi: "φ", omega: "ω", Delta: "Δ", Sigma: "Σ", Omega: "Ω", infty: "∞",
    cdot: "·", times: "×", le: "≤", ge: "≥", neq: "≠", to: "→", pm: "±", int: "∫", sum: "Σ",
  };
  const sub: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", n: "ₙ", k: "ₖ", i: "ᵢ" };
  const sup: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", n: "ⁿ", "-": "⁻", "+": "⁺" };
  return repairDecodedLatex(s)
    .replace(/\$/g, "")
    .replace(/\\(?:mathrm|text|mathbf)\{([^}]*)\}/g, "$1")
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^}]*)\}/g, "√($1)")
    .replace(/\\([a-zA-Z]+)/g, (m, name) => greek[name] ?? name)
    .replace(/_\{?([0-9nki]+)\}?/g, (m, d: string) => (d.split("").every((c) => sub[c]) ? d.split("").map((c) => sub[c]).join("") : m))
    .replace(/\^\{?([0-9n+-]+)\}?/g, (m, d: string) => (d.split("").every((c) => sup[c]) ? d.split("").map((c) => sup[c]).join("") : m))
    .replace(/[{}]/g, "")
    .trim();
}

/** Tick values at 1, 2 or 5 × 10ⁿ spacing. */
function ticks(min: number, max: number, target = 8): number[] {
  const span = max - min;
  if (!(span > 0)) return [];
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

const fmt = (v: number) => (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(0) : String(+v.toFixed(2)));

export function Diagram({ diagram }: { diagram: DiagramData }) {
  if (diagram.kind === "none") return null;
  return (
    <figure className="diagram">
      {diagram.title && <figcaption className="diagram-title">{plainLabel(diagram.title)}</figcaption>}
      {diagram.kind === "plot" ? <Plot d={diagram} /> : <Flow d={diagram} />}
      {diagram.caption && <p className="diagram-caption small muted">{plainLabel(diagram.caption)}</p>}
    </figure>
  );
}

function Plot({ d }: { d: DiagramData }) {
  const uid = useId().replace(/:/g, "");
  let { xMin, xMax, yMin, yMax } = d;
  const plotW = W - PAD.left - PAD.right;
  const plotH = 340;
  if (d.equalAxes) {
    // Same scale on both axes: widen whichever range is too narrow.
    const sx = plotW / (xMax - xMin);
    const sy = plotH / (yMax - yMin);
    if (sx < sy) {
      const extra = (plotH / sx - (yMax - yMin)) / 2;
      yMin -= extra;
      yMax += extra;
    } else {
      const extra = (plotW / sy - (xMax - xMin)) / 2;
      xMin -= extra;
      xMax += extra;
    }
  }
  const X = (x: number) => PAD.left + ((x - xMin) / (xMax - xMin)) * plotW;
  const Y = (y: number) => PAD.top + (1 - (y - yMin) / (yMax - yMin)) * plotH;
  const H = plotH + PAD.top + PAD.bottom;
  const xt = ticks(xMin, xMax);
  const yt = ticks(yMin, yMax, 6);
  const axisX = yMin <= 0 && yMax >= 0 ? Y(0) : Y(yMin);
  const axisY = xMin <= 0 && xMax >= 0 ? X(0) : X(xMin);

  const curves = useMemo(
    () =>
      d.functions.map((f) => {
        const fn = tryCompile(f.expr);
        if (!fn) return "";
        const span = yMax - yMin;
        let path = "";
        let pen = false;
        let prev = NaN;
        const N = 500;
        for (let i = 0; i <= N; i++) {
          const x = xMin + ((xMax - xMin) * i) / N;
          const y = fn(x);
          // Lift the pen at gaps and asymptotes (e.g. tan x, 1/x).
          const ok = Number.isFinite(y) && Math.abs(y - (yMin + yMax) / 2) < span * 20;
          const jump = Number.isFinite(prev) && Math.abs(y - prev) > span * 2;
          if (!ok || jump) pen = false;
          if (ok) {
            path += `${pen ? "L" : "M"}${X(x).toFixed(1)},${Y(y).toFixed(1)}`;
            pen = true;
          }
          prev = y;
        }
        return path;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.functions, xMin, xMax, yMin, yMax],
  );

  const legend: { label: string; color: number }[] = d.functions.map((f, i) => ({ label: plainLabel(f.label || f.expr), color: i % SERIES }));

  return (
    <div className="diagram-canvas">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={plainLabel(d.title || "Graph")}>
        <defs>
          <clipPath id={`clip-${uid}`}>
            <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
          </clipPath>
          {Array.from({ length: SERIES }, (_, i) => (
            <marker key={i} id={`arrow-${uid}-${i}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className={`dg-arrowhead f${i}`} />
            </marker>
          ))}
        </defs>
        {/* grid */}
        {xt.map((v) => (
          <line key={`gx${v}`} x1={X(v)} x2={X(v)} y1={PAD.top} y2={PAD.top + plotH} className="dg-grid" />
        ))}
        {yt.map((v) => (
          <line key={`gy${v}`} y1={Y(v)} y2={Y(v)} x1={PAD.left} x2={PAD.left + plotW} className="dg-grid" />
        ))}
        {/* axes */}
        <line x1={PAD.left} x2={PAD.left + plotW} y1={axisX} y2={axisX} className="dg-axis" />
        <line x1={axisY} x2={axisY} y1={PAD.top} y2={PAD.top + plotH} className="dg-axis" />
        {xt.map((v) => (
          <text key={`tx${v}`} x={X(v)} y={Math.min(axisX + 14, PAD.top + plotH + 14)} className="dg-tick" textAnchor="middle">
            {v === 0 && axisY === X(0) ? "" : fmt(v)}
          </text>
        ))}
        {yt.map((v) => (
          <text key={`ty${v}`} x={Math.max(axisY - 6, PAD.left - 6)} y={Y(v) + 4} className="dg-tick" textAnchor="end">
            {v === 0 && axisX === Y(0) ? "0" : fmt(v)}
          </text>
        ))}
        <text x={PAD.left + plotW} y={H - 6} className="dg-axis-label" textAnchor="end">
          {plainLabel(d.xLabel || "x")}
        </text>
        <text x={12} y={PAD.top + 4} className="dg-axis-label" textAnchor="start" dominantBaseline="hanging">
          {plainLabel(d.yLabel || "y")}
        </text>

        <g clipPath={`url(#clip-${uid})`}>
          {d.circles.map((c, i) => (
            <ellipse
              key={`c${i}`}
              cx={X(c.cx)}
              cy={Y(c.cy)}
              rx={Math.abs(X(c.cx + c.r) - X(c.cx))}
              ry={Math.abs(Y(c.cy + c.r) - Y(c.cy))}
              className={`dg-circle s${(d.functions.length + i) % SERIES}`}
            />
          ))}
          {curves.map((p, i) => (p ? <path key={`f${i}`} d={p} className={`dg-curve s${i % SERIES}`} /> : null))}
          {d.vectors.map((v, i) => (
            <line
              key={`v${i}`}
              x1={X(v.fromX)}
              y1={Y(v.fromY)}
              x2={X(v.toX)}
              y2={Y(v.toY)}
              className={`dg-vector s${(i + 1) % SERIES}`}
              markerEnd={`url(#arrow-${uid}-${(i + 1) % SERIES})`}
            />
          ))}
          {d.points.map((p, i) => (
            <circle key={`p${i}`} cx={X(p.x)} cy={Y(p.y)} r={4.5} className="dg-point" />
          ))}
        </g>
        {/* labels drawn last so they sit on top */}
        {d.circles.map((c, i) =>
          c.label ? (
            <Label key={`cl${i}`} x={X(c.cx + c.r * 0.72)} y={Y(c.cy + c.r * 0.72) - 4}>
              {plainLabel(c.label)}
            </Label>
          ) : null,
        )}
        {d.vectors.map((v, i) =>
          v.label ? (
            <Label key={`vl${i}`} x={X(v.toX) + 6} y={Y(v.toY) - 6}>
              {plainLabel(v.label)}
            </Label>
          ) : null,
        )}
        {d.points.map((p, i) =>
          p.label ? (
            <Label key={`pl${i}`} x={X(p.x) + 7} y={Y(p.y) - 7}>
              {plainLabel(p.label)}
            </Label>
          ) : null,
        )}
      </svg>
      {legend.length > 0 && (
        <ul className="dg-legend">
          {legend.map((l, i) => (
            <li key={i}>
              <span className={`dg-swatch s${l.color}`} />
              {l.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Label({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <text x={Math.min(Math.max(x, 4), W - 4)} y={Math.max(y, 12)} className="dg-label" textAnchor={x > W - 120 ? "end" : "start"}>
      {children}
    </text>
  );
}

// ---- Flow diagrams --------------------------------------------------------

const BOX_W = 150;
const LINE_H = 15;
const GAP_X = 26;
const GAP_Y = 46;

function wrap(text: string, max = 22): string[] {
  const words = plainLabel(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max && line) {
      lines.push(line);
      line = w;
    } else line = (line + " " + w).trim();
  }
  if (line) lines.push(line);
  return lines.length > 4 ? [...lines.slice(0, 3), lines.slice(3).join(" ").slice(0, max - 1) + "…"] : lines;
}

/**
 * Rank nodes top-to-bottom. Loop-back arrows (found by depth-first search) are
 * ignored for ranking, then each node goes one row below its lowest parent.
 */
export function layoutFlow(d: DiagramData) {
  const ids = d.nodes.map((n) => n.id);
  const out = new Map(ids.map((id) => [id, [] as string[]]));
  const indeg = new Map(ids.map((id) => [id, 0]));
  for (const e of d.edges) {
    out.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  // 1. Find back edges with a DFS from the start nodes (then any unvisited node).
  const state = new Map<string, "visiting" | "done">();
  const back = new Set<string>();
  const visit = (id: string) => {
    state.set(id, "visiting");
    for (const to of out.get(id)!) {
      if (state.get(to) === "visiting") back.add(`${id}->${to}`);
      else if (!state.has(to)) visit(to);
    }
    state.set(id, "done");
  };
  for (const id of [...ids.filter((id) => indeg.get(id) === 0), ...ids]) if (!state.has(id)) visit(id);

  // 2. Longest path over the remaining (acyclic) edges, in topological order.
  const forward = d.edges.filter((e) => !back.has(`${e.from}->${e.to}`));
  const remaining = new Map(ids.map((id) => [id, 0]));
  for (const e of forward) remaining.set(e.to, remaining.get(e.to)! + 1);
  const rank = new Map(ids.map((id) => [id, 0]));
  const queue = ids.filter((id) => remaining.get(id) === 0);
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of forward) {
      if (e.from !== id) continue;
      rank.set(e.to, Math.max(rank.get(e.to)!, rank.get(id)! + 1));
      remaining.set(e.to, remaining.get(e.to)! - 1);
      if (remaining.get(e.to) === 0) queue.push(e.to);
    }
  }
  return rank;
}

function Flow({ d }: { d: DiagramData }) {
  const uid = useId().replace(/:/g, "");
  const rank = layoutFlow(d);
  const rows: string[][] = [];
  for (const n of d.nodes) (rows[rank.get(n.id)!] ??= []).push(n.id);
  const compactRows = rows.filter(Boolean);
  const labels = new Map(d.nodes.map((n) => [n.id, wrap(n.label)]));
  const rowHeights = compactRows.map((row) => Math.max(...row.map((id) => labels.get(id)!.length)) * LINE_H + 18);
  const widest = Math.max(...compactRows.map((r) => r.length));
  // Only as wide as needed (plus room for loop-back arrows), so text stays readable in narrow panels.
  const width = Math.max(300, widest * (BOX_W + GAP_X) + GAP_X + (d.edges.length ? 80 : 0));
  const pos = new Map<string, { x: number; y: number; h: number }>();
  let y = 12;
  compactRows.forEach((row, ri) => {
    const rowW = row.length * BOX_W + (row.length - 1) * GAP_X;
    row.forEach((id, i) => {
      const h = labels.get(id)!.length * LINE_H + 18;
      pos.set(id, { x: (width - rowW) / 2 + i * (BOX_W + GAP_X), y: y + (rowHeights[ri] - h) / 2, h });
    });
    y += rowHeights[ri] + GAP_Y;
  });
  const height = y - GAP_Y + 12;

  return (
    <div className="diagram-canvas">
      <svg className="flow" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={plainLabel(d.title || "Flow diagram")}>
        <defs>
          <marker id={`farrow-${uid}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="dg-arrowhead" />
          </marker>
        </defs>
        {d.edges.map((e, i) => {
          const a = pos.get(e.from)!;
          const b = pos.get(e.to)!;
          const down = b.y > a.y + 1;
          const ax = a.x + BOX_W / 2;
          const bx = b.x + BOX_W / 2;
          let path: string;
          let lx: number;
          let ly: number;
          if (down) {
            const y1 = a.y + a.h;
            const y2 = b.y;
            const my = (y1 + y2) / 2;
            path = `M${ax},${y1} C${ax},${my} ${bx},${my} ${bx},${y2 - 2}`;
            lx = (ax + bx) / 2 + 6;
            ly = my;
          } else {
            // Back or sideways edge (e.g. a loop): curve around the right-hand side.
            const x1 = a.x + BOX_W;
            const x2 = b.x + BOX_W;
            const out = Math.max(x1, x2) + 40;
            path = `M${x1},${a.y + a.h / 2} C${out},${a.y + a.h / 2} ${out},${b.y + b.h / 2} ${x2 + 2},${b.y + b.h / 2}`;
            lx = out - 10;
            ly = (a.y + b.y) / 2 + a.h / 2;
          }
          return (
            <g key={i}>
              <path d={path} className="dg-edge" markerEnd={`url(#farrow-${uid})`} />
              {e.label && (
                <text x={lx} y={ly} className="dg-edge-label">
                  {plainLabel(e.label)}
                </text>
              )}
            </g>
          );
        })}
        {d.nodes.map((n) => {
          const p = pos.get(n.id)!;
          const lines = labels.get(n.id)!;
          return (
            <g key={n.id}>
              <rect x={p.x} y={p.y} width={BOX_W} height={p.h} rx={10} className="dg-node" />
              {lines.map((line, i) => (
                <text key={i} x={p.x + BOX_W / 2} y={p.y + 14 + LINE_H * i + 4} className="dg-node-text" textAnchor="middle">
                  {line}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

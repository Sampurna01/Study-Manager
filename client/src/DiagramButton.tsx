import { useState } from "react";
import { api } from "./api";
import { Diagram } from "./Diagram";
import type { Diagram as DiagramData } from "../../shared/diagram";

/**
 * "Draw a diagram" button: asks the AI to describe a diagram for `about`, then draws it.
 * Pass `saved`/`onDrawn` to keep the diagram (e.g. on a tutor message).
 */
export function DiagramButton({
  content,
  about,
  label = "📈 Draw a diagram",
  saved,
  onDrawn,
}: {
  content: string;
  about: string;
  label?: string;
  saved?: DiagramData;
  onDrawn?: (d: DiagramData) => void;
}) {
  const [diagram, setDiagram] = useState<DiagramData | null>(saved ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function draw() {
    setLoading(true);
    setError(null);
    try {
      const d = await api.diagram(content, about);
      setDiagram(d);
      onDrawn?.(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (diagram && diagram.kind !== "none") {
    return (
      <div className="diagram-wrap">
        <Diagram diagram={diagram} />
        <button className="btn ghost small" onClick={draw} disabled={loading}>
          {loading ? "Drawing…" : "↻ Draw a different diagram"}
        </button>
      </div>
    );
  }
  return (
    <div className="diagram-wrap">
      <button className="btn ghost small diagram-btn" onClick={draw} disabled={loading}>
        {loading ? "Drawing…" : label}
      </button>
      {diagram?.kind === "none" && <span className="small muted"> The AI didn't think a diagram would help here — try again or ask the tutor.</span>}
      {error && <div className="banner error">{error}</div>}
    </div>
  );
}

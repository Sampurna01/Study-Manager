import { useEffect, useState } from "react";
import type { Course } from "../types";
import { MasteryBar } from "./Overview";

const DIFFICULTY_LABEL = { foundational: "Foundational", intermediate: "Intermediate", advanced: "Advanced" };

export function Guide({ course, mastery }: { course: Course; mastery: Record<string, number> }) {
  const { guide } = course;
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState("");
  const names = new Map(guide.topics.map((t) => [t.id, t.name]));
  const base = `#/course/${course.id}`;

  // Deep link: #/course/:id/guide#topic-id opens that topic.
  useEffect(() => {
    const anchor = window.location.hash.split("#")[2];
    if (anchor) {
      setOpen(new Set([anchor]));
      setTimeout(() => document.getElementById(`topic-${anchor}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, []);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const glossary = guide.glossary
    .filter((g) => !filter || (g.term + " " + g.definition).toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.term.localeCompare(b.term));

  return (
    <div className="guide">
      {guide.learningObjectives.length > 0 && (
        <div className="card">
          <h2>Learning objectives</h2>
          <ul className="checklist">
            {guide.learningObjectives.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="row spread">
        <h2>Topics</h2>
        <button
          className="btn ghost small"
          onClick={() => setOpen(open.size === guide.topics.length ? new Set() : new Set(guide.topics.map((t) => t.id)))}
        >
          {open.size === guide.topics.length ? "Collapse all" : "Expand all"}
        </button>
      </div>
      <ol className="topics">
        {guide.topics.map((t, i) => (
          <li key={t.id} id={`topic-${t.id}`} className={`topic card ${open.has(t.id) ? "open" : ""}`}>
            <button className="topic-head" onClick={() => toggle(t.id)} aria-expanded={open.has(t.id)}>
              <span className="topic-num">{i + 1}</span>
              <span className="topic-name">{t.name}</span>
              <span className={`chip ${t.difficulty}`}>{DIFFICULTY_LABEL[t.difficulty]}</span>
              <span className="muted small nowrap">~{t.estimatedMinutes} min</span>
              <MasteryBar value={mastery[t.id] ?? 0} />
            </button>
            {open.has(t.id) && (
              <div className="topic-body">
                <p>{t.summary}</p>
                <h4>Key points</h4>
                <ul>
                  {t.keyPoints.map((k, j) => (
                    <li key={j}>{k}</li>
                  ))}
                </ul>
                {t.prerequisites.length > 0 && (
                  <p className="small muted">Builds on: {t.prerequisites.map((p) => names.get(p) ?? p).join(", ")}</p>
                )}
                <div className="row">
                  <a className="btn small" href={`${base}/quiz?topic=${encodeURIComponent(t.id)}`}>
                    Quiz me on this
                  </a>
                  <a className="btn ghost small" href={`${base}/tutor?topic=${encodeURIComponent(t.id)}`}>
                    Ask the tutor
                  </a>
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>

      {guide.glossary.length > 0 && (
        <div className="card">
          <div className="row spread">
            <h2>Glossary</h2>
            <input className="search" placeholder="Search terms…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <dl className="glossary">
            {glossary.map((g) => (
              <div key={g.term}>
                <dt>{g.term}</dt>
                <dd>{g.definition}</dd>
              </div>
            ))}
          </dl>
          {glossary.length === 0 && <p className="muted">No matching terms.</p>}
        </div>
      )}
    </div>
  );
}

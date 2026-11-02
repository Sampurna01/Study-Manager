import { useCallback, useEffect, useRef, useState } from "react";
import type { Course } from "../types";
import { MasteryBar } from "./Overview";
import { GlossaryText, useGlossaryMatcher } from "./guide/GlossaryText";
import { InlineQuiz } from "./guide/InlineQuiz";
import { ExplainPanel, type ExplainRequest } from "./guide/ExplainPanel";

type Set_ = (fn: (c: Course) => Course) => void;

const DIFFICULTY_LABEL = { foundational: "Foundational", intermediate: "Intermediate", advanced: "Advanced" };

interface Selection_ {
  text: string;
  topicName: string;
  x: number;
  y: number;
}

export function Guide({ course, mastery, set }: { course: Course; mastery: Record<string, number>; set: Set_ }) {
  const { guide } = course;
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState("");
  const [activeTerm, setActiveTerm] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection_ | null>(null);
  const [explain, setExplain] = useState<ExplainRequest | null>(null);
  const topicsRef = useRef<HTMLOListElement>(null);
  const matcher = useGlossaryMatcher(guide.glossary);
  const names = new Map(guide.topics.map((t) => [t.id, t.name]));
  const checked = new Set(course.checked ?? []);
  const base = `#/course/${course.id}`;

  // Deep link: #/course/:id/guide#topic-id opens that topic.
  useEffect(() => {
    const anchor = window.location.hash.split("#")[2];
    if (anchor) {
      setOpen(new Set([anchor]));
      setTimeout(() => document.getElementById(`topic-${anchor}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, []);

  // Show an "Explain this" button above any text selected inside a topic.
  useEffect(() => {
    let timer: number | undefined;
    const update = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      if (!sel || sel.rangeCount === 0 || text.length < 3 || text.length > 2000) return setSelection(null);
      const node = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
      const topicEl = node?.closest<HTMLElement>("[data-topic]");
      if (!topicEl || !topicsRef.current?.contains(topicEl)) return setSelection(null);
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setSelection({
        text,
        topicName: topicEl.dataset.topic ?? "",
        x: Math.min(Math.max(rect.left + rect.width / 2, 90), window.innerWidth - 90),
        y: Math.max(rect.top, 50),
      });
    };
    const onChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(update, 200);
    };
    const hide = () => setSelection(null);
    document.addEventListener("selectionchange", onChange);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("selectionchange", onChange);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);

  // Clicking anywhere else closes an open glossary definition.
  useEffect(() => {
    if (!activeTerm) return;
    const close = () => setActiveTerm(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [activeTerm]);

  const closeExplain = useCallback(() => setExplain(null), []);

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleCheck = (key: string) =>
    set((c) => {
      const current = new Set(c.checked ?? []);
      if (current.has(key)) current.delete(key);
      else current.add(key);
      return { ...c, checked: [...current] };
    });

  const totalPoints = guide.topics.reduce((s, t) => s + t.keyPoints.length, 0);
  const totalChecked = guide.topics.reduce((s, t) => s + t.keyPoints.filter((_, j) => checked.has(`${t.id}|${j}`)).length, 0);

  const glossary = guide.glossary
    .filter((g) => !filter || (g.term + " " + g.definition).toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.term.localeCompare(b.term));

  return (
    <div className="guide">
      <div className="guide-tip small muted">
        💡 Select any text to get it explained · click <span className="term demo">underlined terms</span> for definitions ·
        tick key points as you learn them
      </div>

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
        <h2>
          Topics{" "}
          {totalPoints > 0 && (
            <span className="muted small">
              · {totalChecked} of {totalPoints} key points learned
            </span>
          )}
        </h2>
        <button
          className="btn ghost small"
          onClick={() => setOpen(open.size === guide.topics.length ? new Set() : new Set(guide.topics.map((t) => t.id)))}
        >
          {open.size === guide.topics.length ? "Collapse all" : "Expand all"}
        </button>
      </div>
      <ol className="topics" ref={topicsRef}>
        {guide.topics.map((t, i) => {
          const done = t.keyPoints.filter((_, j) => checked.has(`${t.id}|${j}`)).length;
          const complete = t.keyPoints.length > 0 && done === t.keyPoints.length;
          return (
            <li key={t.id} id={`topic-${t.id}`} className={`topic card ${open.has(t.id) ? "open" : ""}`}>
              <button className="topic-head" onClick={() => toggle(t.id)} aria-expanded={open.has(t.id)}>
                <span className={`topic-num ${complete ? "complete" : ""}`}>{complete ? "✓" : i + 1}</span>
                <span className="topic-name">
                  {t.name}
                  {t.keyPoints.length > 0 && (
                    <span className="muted small nowrap">
                      {" "}
                      · {done}/{t.keyPoints.length}
                    </span>
                  )}
                </span>
                <span className="topic-chips">
                  {t.syllabusOnly && (
                    <span className="chip gap" title="Your syllabus lists this topic, but your notes don't cover it yet">
                      Not in your notes
                    </span>
                  )}
                  <span className={`chip ${t.difficulty}`}>{DIFFICULTY_LABEL[t.difficulty]}</span>
                </span>
                <span className="muted small nowrap">~{t.estimatedMinutes} min</span>
                <MasteryBar value={mastery[t.id] ?? 0} />
              </button>
              {open.has(t.id) && (
                <div className="topic-body" data-topic={t.name}>
                  {t.syllabusOnly && (
                    <p className="banner warn small">
                      Your syllabus lists this topic but your notes don't cover it, so this summary comes from general knowledge of the
                      subject. Add your lecture notes for it to make questions match your course.
                    </p>
                  )}
                  <p>
                    <GlossaryText text={t.summary} matcher={matcher} id={`${t.id}-s`} active={activeTerm} onToggle={setActiveTerm} />
                  </p>
                  <h4>Key points</h4>
                  <ul className="key-points">
                    {t.keyPoints.map((k, j) => {
                      const key = `${t.id}|${j}`;
                      return (
                        <li key={j} className={checked.has(key) ? "learned" : ""}>
                          <input
                            type="checkbox"
                            checked={checked.has(key)}
                            onChange={() => toggleCheck(key)}
                            aria-label="I've learned this"
                            title="I've learned this"
                          />
                          <span>
                            <GlossaryText text={k} matcher={matcher} id={`${t.id}-${j}`} active={activeTerm} onToggle={setActiveTerm} />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {t.prerequisites.length > 0 && (
                    <p className="small muted">Builds on: {t.prerequisites.map((p) => names.get(p) ?? p).join(", ")}</p>
                  )}
                  <InlineQuiz course={course} topic={t} mastery={mastery[t.id] ?? 0} set={set} />
                  <div className="row">
                    <a className="btn ghost small" href={`${base}/quiz?topic=${encodeURIComponent(t.id)}`}>
                      Full quiz on this topic
                    </a>
                    <a className="btn ghost small" href={`${base}/tutor?topic=${encodeURIComponent(t.id)}`}>
                      Learn it with the tutor
                    </a>
                  </div>
                </div>
              )}
            </li>
          );
        })}
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

      {selection && (
        <div className="selection-bar" style={{ left: selection.x, top: selection.y }}>
          <button
            className="btn primary small"
            // Keep the text selected while clicking.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setExplain({ text: selection.text, topicName: selection.topicName });
              setSelection(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            💬 Explain this
          </button>
        </div>
      )}

      {explain && <ExplainPanel course={course} request={explain} set={set} onClose={closeExplain} />}
    </div>
  );
}

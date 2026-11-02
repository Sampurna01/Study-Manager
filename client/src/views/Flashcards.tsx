import { useCallback, useEffect, useMemo, useState } from "react";
import type { Course, Flashcard } from "../types";
import { api } from "../api";
import { uid } from "../store";
import { isDue, newSchedule, review, type Rating } from "../../../shared/srs";
import { TopicPicker } from "./TopicPicker";

type Set_ = (fn: (c: Course) => Course) => void;

const RATINGS: { id: Rating; label: string; key: string }[] = [
  { id: "again", label: "Again", key: "1" },
  { id: "hard", label: "Hard", key: "2" },
  { id: "good", label: "Good", key: "3" },
  { id: "easy", label: "Easy", key: "4" },
];

function formatInterval(card: Flashcard, rating: Rating): string {
  const next = review(card.schedule, rating);
  const ms = new Date(next.due).getTime() - Date.now();
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const days = Math.round(ms / 86_400_000);
  if (days < 31) return `${days}d`;
  return `${Math.round(days / 30)}mo`;
}

function formatDue(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "due now";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours} h`;
  return `in ${Math.round(hours / 24)} days`;
}

export function Flashcards({ course, mastery, set }: { course: Course; mastery: Record<string, number>; set: Set_ }) {
  const topics = course.guide.topics;
  const names = new Map(topics.map((t) => [t.id, t.name]));
  const [mode, setMode] = useState<"review" | "browse">("review");
  const [selected, setSelected] = useState<string[]>(() => topics.map((t) => t.id));
  const [count, setCount] = useState(15);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBack, setShowBack] = useState(false);
  const [sessionDone, setSessionDone] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  // Re-check what's due every 30s so "again" cards come back during a session.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const due = useMemo(
    () => course.cards.filter((c) => isDue(c.schedule, new Date(now))).sort((a, b) => a.schedule.due.localeCompare(b.schedule.due)),
    [course.cards, now],
  );
  const current = due[0];

  const rate = useCallback(
    (rating: Rating) => {
      if (!current) return;
      set((c) => ({
        ...c,
        cards: c.cards.map((card) => (card.id === current.id ? { ...card, schedule: review(card.schedule, rating) } : card)),
      }));
      setShowBack(false);
      setSessionDone((n) => n + 1);
      setNow(Date.now());
    },
    [current, set],
  );

  useEffect(() => {
    if (mode !== "review" || !current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!showBack && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setShowBack(true);
      } else if (showBack) {
        const r = RATINGS.find((x) => x.key === e.key);
        if (r) rate(r.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, current, showBack, rate]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const picked = topics.filter((t) => selected.includes(t.id)).map((t) => ({ id: t.id, name: t.name, mastery: mastery[t.id] }));
      const drafts = await api.flashcards(course.content, picked, count, course.cards.map((c) => c.front));
      const now = new Date();
      set((c) => ({
        ...c,
        cards: [...c.cards, ...drafts.map((d) => ({ ...d, id: uid(), schedule: newSchedule(now) }))],
      }));
      setNow(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  const nextDue = course.cards.length
    ? course.cards.reduce((min, c) => (c.schedule.due < min ? c.schedule.due : min), course.cards[0].schedule.due)
    : null;

  return (
    <div className="flashcards">
      <div className="row spread">
        <div className="segmented">
          <button className={mode === "review" ? "active" : ""} onClick={() => setMode("review")}>
            Review {due.length > 0 && <span className="badge">{due.length}</span>}
          </button>
          <button className={mode === "browse" ? "active" : ""} onClick={() => setMode("browse")}>
            All cards ({course.cards.length})
          </button>
        </div>
      </div>

      {mode === "review" &&
        (current ? (
          <div className="review">
            <p className="muted small">
              {names.get(current.topicId)} · {due.length} left{sessionDone ? ` · ${sessionDone} reviewed` : ""}
            </p>
            <div className={`flashcard ${showBack ? "flipped" : ""}`} onClick={() => setShowBack(true)}>
              <div className="flashcard-front">{current.front}</div>
              {showBack && <div className="flashcard-back">{current.back}</div>}
            </div>
            {showBack ? (
              <div className="ratings">
                {RATINGS.map((r) => (
                  <button key={r.id} className={`btn rating ${r.id}`} onClick={() => rate(r.id)}>
                    <span>{r.label}</span>
                    <span className="small">{formatInterval(current, r.id)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <button className="btn primary large" onClick={() => setShowBack(true)}>
                Show answer
              </button>
            )}
            <p className="muted small center-text">Keyboard: Space to reveal, 1–4 to rate</p>
          </div>
        ) : (
          <div className="card empty">
            {course.cards.length ? (
              <>
                <h2>All caught up 🎉</h2>
                <p className="muted">
                  {sessionDone ? `You reviewed ${sessionDone} card${sessionDone === 1 ? "" : "s"}. ` : ""}
                  Next card is due {nextDue ? formatDue(nextDue) : "later"}. Add more cards below or take a quiz.
                </p>
              </>
            ) : (
              <>
                <h2>No flashcards yet</h2>
                <p className="muted">Generate a deck from your course material. Cards are scheduled with spaced repetition, so you see hard ones more often.</p>
              </>
            )}
          </div>
        ))}

      {mode === "browse" && (
        <div className="card">
          {course.cards.length === 0 && <p className="muted">No cards yet.</p>}
          <ul className="card-list">
            {course.cards.map((c) => (
              <li key={c.id}>
                <div>
                  <strong>{c.front}</strong>
                  <p>{c.back}</p>
                  <span className="muted small">
                    {names.get(c.topicId)} · {formatDue(c.schedule.due)}
                    {c.schedule.lapses ? ` · forgotten ${c.schedule.lapses}×` : ""}
                  </span>
                </div>
                <button
                  className="btn ghost small"
                  aria-label="Delete card"
                  onClick={() => set((co) => ({ ...co, cards: co.cards.filter((x) => x.id !== c.id) }))}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h2>Generate flashcards</h2>
        <TopicPicker topics={topics} mastery={mastery} selected={selected} onChange={setSelected} />
        <div className="row">
          <label className="inline-field">
            Cards
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {[10, 15, 25, 40].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <button className="btn primary" disabled={generating || selected.length === 0} onClick={generate}>
            {generating ? "Writing cards…" : "Generate"}
          </button>
        </div>
        {error && <div className="banner error">{error}</div>}
      </div>
    </div>
  );
}

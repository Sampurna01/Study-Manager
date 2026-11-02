import { useRef, useState } from "react";
import type { Course, Syllabus as SyllabusData } from "../types";
import { api } from "../api";
import { toDateKey } from "../../../shared/plan";
import { combineSources } from "./NewCourse";

type Set_ = (fn: (c: Course) => Course) => void;
type Assessment = SyllabusData["assessments"][number];

const TYPE_LABEL: Record<Assessment["type"], string> = {
  exam: "Exam",
  midterm: "Midterm",
  final: "Final exam",
  quiz: "Quiz",
  assignment: "Assignment",
  project: "Project",
  presentation: "Presentation",
  participation: "Participation",
  other: "Other",
};
export const EXAM_TYPES = new Set<Assessment["type"]>(["exam", "midterm", "final", "quiz"]);

export function daysUntil(date: string): number {
  const today = new Date(toDateKey(new Date()) + "T00:00:00").getTime();
  return Math.round((new Date(date + "T00:00:00").getTime() - today) / 86_400_000);
}

export function formatDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function countdown(date: string): string {
  const d = daysUntil(date);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d > 1) return `in ${d} days`;
  return d === -1 ? "yesterday" : `${-d} days ago`;
}

/** Upcoming dated assessments, soonest first. */
export function upcomingAssessments(s: SyllabusData | undefined): Assessment[] {
  return (s?.assessments ?? []).filter((a) => a.date && daysUntil(a.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
}

/** The schedule entry for the current week: the latest one that has started. */
function currentIndex(s: SyllabusData): number {
  let idx = -1;
  s.schedule.forEach((e, i) => {
    if (e.date && daysUntil(e.date) <= 0) idx = i;
  });
  return idx;
}

export function Syllabus({ course, set }: { course: Course; set: Set_ }) {
  const s = course.syllabus;
  const names = new Map(course.guide.topics.map((t) => [t.id, t.name]));
  const base = `#/course/${course.id}`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const topicRefs = course.guide.topics.map((t) => ({ id: t.id, name: t.name }));

  /** Read a syllabus and attach it (and its text, so the tutor can answer questions about dates). */
  async function addSyllabus(name: string, text: string) {
    setBusy(true);
    setError(null);
    try {
      const syllabus = await api.syllabus(text, topicRefs);
      set((c) => ({
        ...c,
        syllabus,
        content: `${c.content}\n\n${combineSources([{ name, text, kind: "syllabus" }])}`,
        sources: [...c.sources, { name, chars: text.length, kind: "syllabus" }],
      }));
      setPasted("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const [result] = await api.extract([file]);
      if (!result?.text) throw new Error(result?.error ?? "No text found in that file.");
      await addSyllabus(result.name, result.text);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function reread() {
    // Re-read from the syllabus documents saved in the course material.
    const parts = course.content.split(/\n(?======)/).filter((p) => /^===== .* \(Syllabus\) =====/.test(p));
    if (!parts.length) return;
    setBusy(true);
    setError(null);
    try {
      const syllabus = await api.syllabus(parts.join("\n\n"), topicRefs);
      set((c) => ({ ...c, syllabus }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!s) {
    return (
      <div className="syllabus">
        <div className="card">
          <h2>Add your syllabus</h2>
          <p className="muted">
            The app reads it for your weekly schedule, exam and assignment dates, grade weights and learning outcomes. Then it can
            plan your studying around your real exam dates and point out topics your notes don't cover yet.
          </p>
          <div className="row">
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.txt,.md,.markdown,.html,.htm"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
            <button className="btn primary" disabled={busy} onClick={() => fileInput.current?.click()}>
              {busy ? "Reading syllabus…" : "Upload syllabus"}
            </button>
          </div>
          <label className="field">
            <span>…or paste it</span>
            <textarea rows={8} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste your syllabus here" />
          </label>
          <button className="btn" disabled={busy || !pasted.trim()} onClick={() => addSyllabus("Syllabus (pasted)", pasted.trim())}>
            {busy ? "Reading syllabus…" : "Read pasted syllabus"}
          </button>
          {error && <div className="banner error">{error}</div>}
        </div>
      </div>
    );
  }

  const upcoming = upcomingAssessments(s);
  const nextExam = upcoming.find((a) => EXAM_TYPES.has(a.type));
  const current = currentIndex(s);
  const assessments = [...s.assessments].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  const totalWeight = s.assessments.reduce((sum, a) => sum + (a.weightPercent > 0 ? a.weightPercent : 0), 0);
  const gaps = course.guide.topics.filter((t) => t.syllabusOnly);

  const TopicChips = ({ ids }: { ids: string[] }) =>
    ids.length ? (
      <div className="chips">
        {ids.map((id) => (
          <a key={id} className="chip link-chip" href={`${base}/guide#${id}`}>
            {names.get(id) ?? id}
          </a>
        ))}
      </div>
    ) : null;

  return (
    <div className="syllabus">
      <div className="card syllabus-head">
        <div>
          <h2>
            {s.courseCode && !s.courseName.includes(s.courseCode) && <span className="muted">{s.courseCode} · </span>}
            {s.courseName}
          </h2>
          <p className="muted small">{[s.term, s.instructor].filter(Boolean).join(" · ")}</p>
          {s.description && <p>{s.description}</p>}
        </div>
        {nextExam && (
          <div className="next-exam">
            <span className="small muted">Next exam</span>
            <strong>{nextExam.name}</strong>
            <span className="countdown">{countdown(nextExam.date)}</span>
            <span className="small muted">{formatDate(nextExam.date)}</span>
            <a className="btn primary small" href={`${base}/plan?exam=${nextExam.date}`}>
              Plan for it
            </a>
          </div>
        )}
      </div>

      {gaps.length > 0 && (
        <div className="banner warn">
          <strong>Your syllabus lists topics your notes don't cover yet:</strong> {gaps.map((g) => g.name).join(", ")}. The study guide
          explains them from general knowledge — add your lecture notes for these to get questions that match your course.
        </div>
      )}

      {assessments.length > 0 && (
        <div className="card">
          <h2>Exams & assignments</h2>
          <div className="table-wrap">
            <table className="assessments">
              <thead>
                <tr>
                  <th>What</th>
                  <th>Weight</th>
                  <th>When</th>
                  <th>Covers</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {assessments.map((a, i) => {
                  const past = a.date && daysUntil(a.date) < 0;
                  return (
                    <tr key={i} className={past ? "past" : ""}>
                      <td>
                        <strong>{a.name}</strong>
                        <div className="small muted">{TYPE_LABEL[a.type]}</div>
                        {a.details && <div className="small muted">{a.details}</div>}
                      </td>
                      <td className="nowrap">
                        {a.weightPercent >= 0 ? (
                          <div className="weight">
                            <span>{a.weightPercent}%</span>
                            <div className="weight-bar">
                              <div style={{ width: `${Math.min(100, a.weightPercent)}%` }} />
                            </div>
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="nowrap">
                        {a.date ? (
                          <>
                            {formatDate(a.date)}
                            <div className="small muted">{countdown(a.date)}</div>
                          </>
                        ) : (
                          <span className="muted">Not given</span>
                        )}
                      </td>
                      <td>
                        <TopicChips ids={a.topicIds} />
                      </td>
                      <td className="nowrap">
                        {!past && EXAM_TYPES.has(a.type) && a.date && (
                          <a className="btn small" href={`${base}/plan?exam=${a.date}`}>
                            Plan
                          </a>
                        )}
                        {!past && a.topicIds.length > 0 && (
                          <a className="btn ghost small" href={`${base}/quiz?topic=${a.topicIds.join(",")}`}>
                            Practise
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalWeight > 0 && totalWeight !== 100 && (
            <p className="small muted">Weights add up to {totalWeight}% — check your syllabus if that looks wrong.</p>
          )}
        </div>
      )}

      {s.schedule.length > 0 && (
        <div className="card">
          <h2>Schedule</h2>
          <ol className="schedule">
            {s.schedule.map((e, i) => (
              <li key={i} className={i === current ? "current" : current > i ? "done" : ""}>
                <div className="schedule-when">
                  <strong>{e.label}</strong>
                  {e.date && <span className="small muted">{formatDate(e.date)}</span>}
                  {i === current && <span className="chip now">This week</span>}
                </div>
                <div className="schedule-what">
                  {e.topics.length > 0 && <p>{e.topics.join(" · ")}</p>}
                  {e.readings.length > 0 && <p className="small muted">📚 {e.readings.join("; ")}</p>}
                  <TopicChips ids={e.topicIds} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="grid-2">
        {s.learningOutcomes.length > 0 && (
          <div className="card">
            <h2>Learning outcomes</h2>
            <ul className="checklist">
              {s.learningOutcomes.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </div>
        )}
        {s.requiredMaterials.length > 0 && (
          <div className="card">
            <h2>Required materials</h2>
            <ul className="checklist">
              {s.requiredMaterials.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="row">
        <button className="btn ghost small" disabled={busy} onClick={reread}>
          {busy ? "Reading syllabus…" : "Read the syllabus again"}
        </button>
        <span className="small muted">The AI can misread dates — check them against your syllabus.</span>
      </div>
      {error && <div className="banner error">{error}</div>}
    </div>
  );
}

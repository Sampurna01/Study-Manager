import { useState } from "react";
import type { Course, Grade, Question } from "../types";
import { api } from "../api";
import { uid } from "../store";
import { TopicPicker } from "./TopicPicker";
import { MathText } from "../MathText";
import { DiagramButton } from "../DiagramButton";
import { ProblemInput, WorkedSolution, HINT_PENALTY } from "./quiz/Problem";
import { QUIZ_STYLES, defaultQuizStyle } from "../quizStyle";
import type { QuizStyle } from "../../../shared/schemas";

type Set_ = (fn: (c: Course) => Course) => void;
type Mode = "practice" | "weak_spots" | "exam";

interface Answer {
  choice?: number;
  text?: string;
  working?: string;
  grade?: Grade;
  score: number;
  hintsUsed?: number;
  revealed?: boolean;
}

const MODES: { id: Mode; label: string; desc: string }[] = [
  { id: "practice", label: "Practice", desc: "A balanced mix across the topics you pick." },
  { id: "weak_spots", label: "Weak spots", desc: "Targets the topics and misconceptions you struggle with." },
  { id: "exam", label: "Mock exam", desc: "Exam-style questions across every topic." },
];

function hashParams() {
  return new URLSearchParams(window.location.hash.split("?")[1] ?? "");
}

export function Quiz({ course, mastery, set }: { course: Course; mastery: Record<string, number>; set: Set_ }) {
  const topics = course.guide.topics;
  const names = new Map(topics.map((t) => [t.id, t.name]));
  const params = hashParams();
  const [mode, setMode] = useState<Mode>(() => (MODES.some((m) => m.id === params.get("mode")) ? (params.get("mode") as Mode) : "practice"));
  const [selected, setSelected] = useState<string[]>(() => {
    const ids = (params.get("topic") ?? "").split(",").filter((id) => names.has(id));
    return ids.length ? ids : topics.map((x) => x.id);
  });
  const [count, setCount] = useState(8);
  const [style, setStyle] = useState<QuizStyle>(() => defaultQuizStyle(course));
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const ids = mode === "exam" ? topics.map((t) => t.id) : selected;
      const picked = topics.filter((t) => ids.includes(t.id)).map((t) => ({ id: t.id, name: t.name, mastery: mastery[t.id] ?? 0 }));
      const qs = await api.quiz(course.content, picked, mode === "exam" ? Math.max(count, 12) : count, mode, style);
      if (course.quizStyle !== style) set((c) => ({ ...c, quizStyle: style }));
      if (!qs.length) throw new Error("No questions came back. Try again.");
      setQuestions(qs);
      setAnswers([]);
      setIndex(0);
      setDraft("");
      setFinished(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function record(q: Question, answer: Answer) {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = answer;
      return next;
    });
    // Save each answer as it happens, so leaving mid-quiz still counts.
    set((c) => ({ ...c, attempts: [...c.attempts, { topicId: q.topicId, score: answer.score, at: new Date().toISOString() }] }));
  }

  async function submitShort(q: Question) {
    setGrading(true);
    setError(null);
    try {
      const grade = await api.grade(course.content, q.prompt, q.modelAnswer, draft);
      record(q, { text: draft, grade, score: grade.score });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGrading(false);
    }
  }

  function next() {
    if (!questions) return;
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      setDraft("");
      setError(null);
      return;
    }
    const score = answers.reduce((s, a) => s + (a?.score ?? 0), 0) / questions.length;
    set((c) => ({ ...c, quizzes: [...c.quizzes, { id: uid(), at: new Date().toISOString(), mode, score, total: questions.length }] }));
    setFinished(true);
  }

  // ---- Setup -------------------------------------------------------------
  if (!questions) {
    return (
      <div className="quiz">
        <div className="card">
          <h2>New quiz</h2>
          <div className="mode-picker">
            {MODES.map((m) => (
              <button key={m.id} className={`mode ${mode === m.id ? "active" : ""}`} onClick={() => setMode(m.id)}>
                <strong>{m.label}</strong>
                <span className="small muted">{m.desc}</span>
              </button>
            ))}
          </div>
          <div className="style-picker">
            <span className="small muted">Question style:</span>
            <div className="segmented">
              {QUIZ_STYLES.map((st) => (
                <button key={st.id} className={style === st.id ? "active" : ""} onClick={() => setStyle(st.id)} title={st.desc}>
                  {st.label}
                </button>
              ))}
            </div>
            <span className="small muted">{QUIZ_STYLES.find((st) => st.id === style)?.desc}</span>
          </div>
          {mode !== "exam" && <TopicPicker topics={topics} mastery={mastery} selected={selected} onChange={setSelected} />}
          <div className="row">
            <label className="inline-field">
              Questions
              <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[5, 8, 12, 20].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <button className="btn primary" disabled={loading || (mode !== "exam" && !selected.length)} onClick={start}>
              {loading ? "Writing questions…" : "Start quiz"}
            </button>
          </div>
          {loading && style !== "concepts" && (
            <p className="small muted">The AI works out a full solution for every problem, so this can take a minute or two.</p>
          )}
          {error && <div className="banner error">{error}</div>}
        </div>

        {course.quizzes.length > 0 && (
          <div className="card">
            <h2>History</h2>
            <ul className="history">
              {[...course.quizzes].reverse().slice(0, 10).map((q) => (
                <li key={q.id}>
                  <span>{MODES.find((m) => m.id === q.mode)?.label}</span>
                  <span className="muted small">{new Date(q.at).toLocaleDateString()}</span>
                  <span className={`score ${q.score >= 0.8 ? "high" : q.score >= 0.5 ? "mid" : "low"}`}>
                    {Math.round(q.score * 100)}% of {q.total}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // ---- Results -----------------------------------------------------------
  if (finished) {
    const total = answers.reduce((s, a) => s + (a?.score ?? 0), 0);
    const byTopic = new Map<string, { score: number; n: number }>();
    questions.forEach((q, i) => {
      const e = byTopic.get(q.topicId) ?? { score: 0, n: 0 };
      byTopic.set(q.topicId, { score: e.score + (answers[i]?.score ?? 0), n: e.n + 1 });
    });
    return (
      <div className="quiz">
        <div className="card results">
          <h2>
            You scored {Math.round((total / questions.length) * 100)}%
            <span className="muted small"> ({total.toFixed(1)} / {questions.length})</span>
          </h2>
          <ul className="topic-results">
            {[...byTopic].map(([id, r]) => (
              <li key={id}>
                <span>{names.get(id)}</span>
                <span className={`score ${r.score / r.n >= 0.8 ? "high" : r.score / r.n >= 0.5 ? "mid" : "low"}`}>
                  {Math.round((r.score / r.n) * 100)}%
                </span>
              </li>
            ))}
          </ul>
          <div className="row">
            <button className="btn primary" onClick={start} disabled={loading}>
              {loading ? "Writing questions…" : "Another quiz like this"}
            </button>
            <button
              className="btn"
              onClick={() => {
                setMode("weak_spots");
                setQuestions(null);
              }}
            >
              Drill weak spots
            </button>
            <button className="btn ghost" onClick={() => setQuestions(null)}>
              Back to setup
            </button>
          </div>
          {error && <div className="banner error">{error}</div>}
        </div>
        <h3>Review</h3>
        {questions.map((q, i) => (
          <div key={i} className={`card review-q ${(answers[i]?.score ?? 0) >= 0.8 ? "right" : "wrong"}`}>
            <p>
              <strong>
                {i + 1}. <MathText text={q.prompt} />
              </strong>
            </p>
            {q.type === "multiple_choice" ? (
              <p className="small">
                Your answer: {answers[i]?.choice !== undefined ? <MathText text={q.options[answers[i].choice!]} /> : "—"} · Correct:{" "}
                <MathText text={q.options[q.correctOption]} />
              </p>
            ) : q.type === "problem" ? (
              <p className="small">
                Your answer: {answers[i]?.revealed ? "(solution shown)" : answers[i]?.text ? <MathText text={answers[i].text!} /> : "—"} · Correct:{" "}
                <MathText text={q.modelAnswer} />
              </p>
            ) : (
              <p className="small">Your answer: {answers[i]?.text || "—"}</p>
            )}
            <p className="small muted">
              <MathText text={q.explanation} />
            </p>
          </div>
        ))}
      </div>
    );
  }

  // ---- Taking ------------------------------------------------------------
  const q = questions[index];
  const answer = answers[index];
  return (
    <div className="quiz">
      <div className="progress">
        <div className="progress-fill" style={{ width: `${((index + (answer ? 1 : 0)) / questions.length) * 100}%` }} />
      </div>
      <div className="card question">
        <p className="muted small">
          Question {index + 1} of {questions.length} · {names.get(q.topicId)} · {q.difficulty}
        </p>
        <h2 className="prompt">
          <MathText text={q.prompt} />
        </h2>
        <DiagramButton
          key={`diagram-${index}`}
          content={course.content}
          label="📈 Draw a diagram for this question"
          about={`Question (don't reveal the answer in the diagram): ${q.prompt}${q.options.length ? `\nOptions: ${q.options.join(" | ")}` : ""}`}
        />

        {q.type === "multiple_choice" ? (
          <div className="options">
            {q.options.map((opt, i) => {
              const state = answer ? (i === q.correctOption ? "correct" : i === answer.choice ? "incorrect" : "") : "";
              return (
                <button
                  key={i}
                  className={`option ${state}`}
                  disabled={!!answer}
                  onClick={() => record(q, { choice: i, score: i === q.correctOption ? 1 : 0 })}
                >
                  <span className="option-letter">{String.fromCharCode(65 + i)}</span>
                  <span>
                    <MathText text={opt} />
                  </span>
                </button>
              );
            })}
          </div>
        ) : q.type === "problem" ? (
          <ProblemInput key={index} question={q} content={course.content} answered={!!answer} onAnswer={(a) => record(q, a)} />
        ) : (
          <div className="short">
            <textarea
              rows={4}
              value={answer?.text ?? draft}
              disabled={!!answer || grading}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write your answer in your own words…"
            />
            {!answer && (
              <button className="btn primary" disabled={grading || !draft.trim()} onClick={() => submitShort(q)}>
                {grading ? "Grading…" : "Submit answer"}
              </button>
            )}
          </div>
        )}

        {error && <div className="banner error">{error}</div>}

        {answer && (
          <div className={`feedback ${answer.score >= 0.8 ? "right" : answer.score >= 0.4 ? "partial" : "wrong"}`}>
            <strong>
              {answer.revealed
                ? "Solution shown — have another go at a similar problem later"
                : answer.score >= 0.8
                  ? "Correct"
                  : answer.score >= 0.4
                    ? "Partly correct"
                    : "Not quite"}
              {answer.grade && ` · ${Math.round(answer.score * 100)}%`}
            </strong>
            {!!answer.hintsUsed && !answer.revealed && (
              <p className="small muted">
                {answer.hintsUsed} hint{answer.hintsUsed === 1 ? "" : "s"} used (−{Math.round(answer.hintsUsed * HINT_PENALTY * 100)}%)
              </p>
            )}
            {answer.grade && (
              <p>
                <MathText text={answer.grade.feedback} />
              </p>
            )}
            {answer.grade && answer.grade.missingPoints.length > 0 && (
              <ul>
                {answer.grade.missingPoints.map((m) => (
                  <li key={m}>
                    <MathText text={m} />
                  </li>
                ))}
              </ul>
            )}
            {q.type === "short_answer" && (
              <p>
                <em>Model answer:</em> <MathText text={q.modelAnswer} />
              </p>
            )}
            {q.type === "problem" && <WorkedSolution question={q} content={course.content} />}
            <p className="muted">
              <MathText text={q.explanation} />
            </p>
            <button className="btn primary" onClick={next} autoFocus>
              {index + 1 < questions.length ? "Next question" : "See results"}
            </button>
          </div>
        )}
      </div>
      <button
        className="btn ghost small"
        onClick={() => {
          if (confirm("Quit this quiz? Answers so far still count toward your mastery.")) setQuestions(null);
        }}
      >
        Quit quiz
      </button>
    </div>
  );
}

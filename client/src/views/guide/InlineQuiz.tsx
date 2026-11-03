import { useState } from "react";
import type { Course, Grade, Question } from "../../types";
import type { Topic } from "../../../../shared/schemas";
import { api } from "../../api";
import { MathText } from "../../MathText";
import { ProblemInput, WorkedSolution } from "../quiz/Problem";
import { defaultQuizStyle } from "../../quizStyle";

type Set_ = (fn: (c: Course) => Course) => void;

interface Answer {
  choice?: number;
  grade?: Grade;
  score: number;
  revealed?: boolean;
}

/** Three quick questions on one topic, answered right inside the study guide. */
export function InlineQuiz({ course, topic, mastery, set }: { course: Course; topic: Topic; mastery: number; set: Set_ }) {
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [grading, setGrading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = await api.quiz(course.content, [{ id: topic.id, name: topic.name, mastery }], 3, "practice", defaultQuizStyle(course));
      if (!qs.length) throw new Error("No questions came back. Try again.");
      setQuestions(qs);
      setAnswers({});
      setDrafts({});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function record(i: number, q: Question, a: Answer) {
    setAnswers((prev) => ({ ...prev, [i]: a }));
    set((c) => ({ ...c, attempts: [...c.attempts, { topicId: q.topicId, score: a.score, at: new Date().toISOString() }] }));
  }

  async function grade(i: number, q: Question) {
    setGrading(i);
    setError(null);
    try {
      const g = await api.grade(course.content, q.prompt, q.modelAnswer, drafts[i] ?? "");
      record(i, q, { grade: g, score: g.score });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGrading(null);
    }
  }

  if (!questions) {
    return (
      <div className="inline-quiz start">
        <button className="btn small primary" onClick={load} disabled={loading}>
          {loading ? "Writing questions…" : "✏️ Check yourself (3 questions)"}
        </button>
        {error && <div className="banner error">{error}</div>}
      </div>
    );
  }

  const done = questions.every((_, i) => answers[i]);
  const score = questions.reduce((s, _, i) => s + (answers[i]?.score ?? 0), 0);

  return (
    <div className="inline-quiz">
      <h4>Check yourself</h4>
      {questions.map((q, i) => {
        const a = answers[i];
        return (
          <div key={i} className="iq">
            <p className="iq-prompt">
              {i + 1}. <MathText text={q.prompt} />
            </p>
            {q.type === "multiple_choice" ? (
              <div className="options compact">
                {q.options.map((opt, j) => {
                  const state = a ? (j === q.correctOption ? "correct" : j === a.choice ? "incorrect" : "") : "";
                  return (
                    <button
                      key={j}
                      className={`option ${state}`}
                      disabled={!!a}
                      onClick={() => record(i, q, { choice: j, score: j === q.correctOption ? 1 : 0 })}
                    >
                      <span className="option-letter">{String.fromCharCode(65 + j)}</span>
                      <span>
                        <MathText text={opt} />
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : q.type === "problem" ? (
              <ProblemInput question={q} content={course.content} answered={!!a} onAnswer={(ans) => record(i, q, ans)} compact />
            ) : (
              <div className="short">
                <textarea
                  rows={2}
                  value={drafts[i] ?? ""}
                  disabled={!!a || grading === i}
                  onChange={(e) => setDrafts((d) => ({ ...d, [i]: e.target.value }))}
                  placeholder="Answer in your own words…"
                />
                {!a && (
                  <button className="btn small" disabled={grading !== null || !(drafts[i] ?? "").trim()} onClick={() => grade(i, q)}>
                    {grading === i ? "Checking…" : "Check"}
                  </button>
                )}
              </div>
            )}
            {a && (
              <div className={`feedback small ${a.score >= 0.8 ? "right" : a.score >= 0.4 ? "partial" : "wrong"}`}>
                <strong>{a.revealed ? "Solution shown" : a.score >= 0.8 ? "Correct" : a.score >= 0.4 ? "Partly correct" : "Not quite"}</strong>
                {a.grade && (
                  <p>
                    <MathText text={a.grade.feedback} />
                  </p>
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
              </div>
            )}
          </div>
        );
      })}
      {error && <div className="banner error">{error}</div>}
      {done && (
        <div className="row">
          <strong>
            {score.toFixed(score % 1 ? 1 : 0)} / {questions.length}
            {score / questions.length >= 0.8 ? " — nice work!" : " — worth another look."}
          </strong>
          <button className="btn small" onClick={load} disabled={loading}>
            {loading ? "Writing questions…" : "Another round"}
          </button>
        </div>
      )}
    </div>
  );
}

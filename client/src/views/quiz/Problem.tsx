import { useState } from "react";
import type { Grade, Question } from "../../types";
import { api } from "../../api";
import { MathText } from "../../MathText";
import { DiagramButton } from "../../DiagramButton";

export interface ProblemAnswer {
  text: string;
  working: string;
  grade?: Grade;
  score: number;
  hintsUsed: number;
  revealed?: boolean;
}

/** Each hint used takes 10% off the score for that problem. */
export const HINT_PENALTY = 0.1;

/** Answer area for a "problem" question: hints, working, final answer, check or reveal. */
export function ProblemInput({
  question,
  content,
  answered,
  onAnswer,
  compact = false,
}: {
  question: Question;
  content: string;
  answered: boolean;
  onAnswer: (a: ProblemAnswer) => void;
  compact?: boolean;
}) {
  const [hintsShown, setHintsShown] = useState(0);
  const [working, setWorking] = useState("");
  const [final, setFinal] = useState("");
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hints = question.hints ?? [];

  async function check() {
    setGrading(true);
    setError(null);
    try {
      const grade = await api.grade(content, question.prompt, question.modelAnswer, final, {
        solutionSteps: question.solutionSteps?.length ? question.solutionSteps : [question.modelAnswer],
        working,
      });
      const score = Math.max(0, grade.score * (1 - HINT_PENALTY * hintsShown));
      onAnswer({ text: final, working, grade, score, hintsUsed: hintsShown });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGrading(false);
    }
  }

  return (
    <div className="problem">
      {hints.length > 0 && (
        <div className="hints">
          {hints.slice(0, hintsShown).map((h, i) => (
            <p key={i} className="hint">
              💡 <strong>Hint {i + 1}:</strong> <MathText text={h} />
            </p>
          ))}
          {!answered && hintsShown < hints.length && (
            <button className="btn ghost small" onClick={() => setHintsShown((n) => n + 1)}>
              💡 {hintsShown === 0 ? "Need a hint?" : "Another hint"} ({hintsShown + 1} of {hints.length}, −10%)
            </button>
          )}
        </div>
      )}
      <label className="field compact-field">
        <span className="small">Your working (optional — helps you get partial credit)</span>
        <textarea
          rows={compact ? 3 : 5}
          value={working}
          disabled={answered || grading}
          onChange={(e) => setWorking(e.target.value)}
          placeholder={"Show your steps, e.g.\nR2 → R2 − 3R1\ndet = 1·4 − 2·3 = −2"}
          className="working"
        />
      </label>
      <label className="field compact-field">
        <span className="small">Final answer</span>
        <input
          value={final}
          disabled={answered || grading}
          onChange={(e) => setFinal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && final.trim() && !answered && check()}
          placeholder="e.g. λ = 2, 5   or   x = 3/4"
        />
      </label>
      {!answered && (
        <div className="row">
          <button className="btn primary small" disabled={grading || !final.trim()} onClick={check}>
            {grading ? "Checking your solution…" : "Check answer"}
          </button>
          <button
            className="btn ghost small"
            disabled={grading}
            onClick={() => onAnswer({ text: final, working, score: 0, hintsUsed: hintsShown, revealed: true })}
          >
            I'm stuck — show the solution
          </button>
        </div>
      )}
      {error && <div className="banner error">{error}</div>}
    </div>
  );
}

/** The worked solution, step by step, with an optional diagram of it. */
export function WorkedSolution({ question, content }: { question: Question; content?: string }) {
  const steps = question.solutionSteps ?? [];
  return (
    <div className="worked">
      <strong>Worked solution</strong>
      {steps.length > 0 && (
        <ol>
          {steps.map((s, i) => (
            <li key={i}>
              <MathText text={s} />
            </li>
          ))}
        </ol>
      )}
      <p className="final-answer">
        <em>Answer:</em> <MathText text={question.modelAnswer} />
      </p>
      {content && (
        <DiagramButton
          content={content}
          label="📈 Draw the solution"
          about={`Problem: ${question.prompt}\nWorked solution:\n${steps.map((st, i) => `${i + 1}. ${st}`).join("\n")}\nAnswer: ${question.modelAnswer}`}
        />
      )}
    </div>
  );
}

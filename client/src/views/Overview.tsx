import type { Course } from "../types";
import { isDue } from "../../../shared/srs";
import { masteryLabel } from "../../../shared/mastery";
import { buildPlan, toDateKey } from "../../../shared/plan";

export function MasteryBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const level = value >= 0.85 ? "high" : value >= 0.65 ? "good" : value >= 0.4 ? "mid" : "low";
  return (
    <div className="mastery" title={`${pct}% · ${masteryLabel(value)}`}>
      <div className="mastery-track">
        <div className={`mastery-fill ${level}`} style={{ width: `${Math.max(pct, value > 0 ? 3 : 0)}%` }} />
      </div>
      <span className="small muted">{value > 0 ? `${pct}%` : "—"}</span>
    </div>
  );
}

function Ring({ value }: { value: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 120 120" className="ring" role="img" aria-label={`${Math.round(value * 100)} percent ready`}>
      <circle cx="60" cy="60" r={r} className="ring-bg" />
      <circle
        cx="60"
        cy="60"
        r={r}
        className="ring-fg"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="58" textAnchor="middle" className="ring-value">
        {Math.round(value * 100)}%
      </text>
      <text x="60" y="78" textAnchor="middle" className="ring-label">
        exam ready
      </text>
    </svg>
  );
}

export function Overview({
  course,
  mastery,
  readiness,
  onDelete,
}: {
  course: Course;
  mastery: Record<string, number>;
  readiness: number;
  onDelete: () => void;
}) {
  const topics = course.guide.topics;
  const due = course.cards.filter((c) => isDue(c.schedule)).length;
  const avgQuiz = course.quizzes.length ? course.quizzes.reduce((s, q) => s + q.score, 0) / course.quizzes.length : null;
  const weakest = [...topics].sort((a, b) => (mastery[a.id] ?? 0) - (mastery[b.id] ?? 0)).slice(0, 3);
  const base = `#/course/${course.id}`;

  const today = (() => {
    if (!course.plan) return null;
    const plan = buildPlan({
      topics,
      mastery,
      start: new Date(),
      exam: new Date(course.plan.examDate + "T00:00:00"),
      minutesPerDay: course.plan.minutesPerDay,
    });
    return plan.days.find((d) => d.date === toDateKey(new Date())) ?? null;
  })();

  const next: { text: string; href: string; cta: string }[] = [];
  if (topics.every((t) => !mastery[t.id])) next.push({ text: "Start by reading the study guide, topic by topic.", href: `${base}/guide`, cta: "Open guide" });
  if (!course.cards.length) next.push({ text: "Generate flashcards so you can memorise the key points with spaced repetition.", href: `${base}/flashcards`, cta: "Make flashcards" });
  if (due) next.push({ text: `${due} flashcard${due === 1 ? " is" : "s are"} due for review.`, href: `${base}/flashcards`, cta: "Review now" });
  if (course.quizzes.length === 0) next.push({ text: "Take a practice quiz to find out where you stand.", href: `${base}/quiz`, cta: "Take a quiz" });
  else if (weakest[0] && (mastery[weakest[0].id] ?? 0) < 0.65)
    next.push({ text: `Your weakest topic is “${weakest[0].name}”. A weak-spots quiz targets it.`, href: `${base}/quiz?mode=weak_spots`, cta: "Drill weak spots" });
  if (!course.plan) next.push({ text: "Have an exam date? Get a day-by-day plan.", href: `${base}/plan`, cta: "Make a plan" });

  return (
    <div className="overview">
      <div className="overview-top">
        <div className="card ring-card">
          <Ring value={readiness} />
        </div>
        <div className="stats">
          <div className="stat card">
            <span className="stat-value">{topics.length}</span>
            <span className="muted small">topics</span>
          </div>
          <div className="stat card">
            <span className="stat-value">{course.cards.length}</span>
            <span className="muted small">flashcards · {due} due</span>
          </div>
          <div className="stat card">
            <span className="stat-value">{course.quizzes.length}</span>
            <span className="muted small">quizzes taken</span>
          </div>
          <div className="stat card">
            <span className="stat-value">{avgQuiz === null ? "—" : `${Math.round(avgQuiz * 100)}%`}</span>
            <span className="muted small">average quiz score</span>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>What to do next</h2>
          {today && today.items.length > 0 && (
            <div className="today">
              <strong>Today's plan</strong>
              <ul>
                {today.items.map((it, i) => (
                  <li key={i}>
                    {it.label} <span className="muted small">· {it.minutes} min</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ul className="next-list">
            {next.slice(0, 4).map((n) => (
              <li key={n.text}>
                <span>{n.text}</span>
                <a className="btn small" href={n.href}>
                  {n.cta}
                </a>
              </li>
            ))}
            {next.length === 0 && <li>You're on track. Keep reviewing flashcards daily and take an exam-style quiz.</li>}
          </ul>
        </div>

        <div className="card">
          <h2>Mastery by topic</h2>
          <ul className="topic-mastery">
            {topics.map((t) => (
              <li key={t.id}>
                <a href={`${base}/guide#${t.id}`} className="topic-link">
                  {t.name}
                </a>
                <MasteryBar value={mastery[t.id] ?? 0} />
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card">
        <h2>About this course</h2>
        <p>{course.guide.overview}</p>
      </div>

      <div className="danger-zone">
        <button className="btn ghost danger small" onClick={onDelete}>
          Delete course
        </button>
      </div>
    </div>
  );
}

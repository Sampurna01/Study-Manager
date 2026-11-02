import { useMemo, useState } from "react";
import type { Course } from "../types";
import { buildPlan, toDateKey, type PlanItem } from "../../../shared/plan";
import { EXAM_TYPES, countdown, formatDate, upcomingAssessments } from "./Syllabus";

type Set_ = (fn: (c: Course) => Course) => void;

const KIND_ICON: Record<PlanItem["kind"], string> = { learn: "📖", review: "🔁", quiz: "✏️", mock_exam: "🎯" };

function defaultExamDate() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return toDateKey(d);
}

function itemHref(course: Course, item: PlanItem) {
  const base = `#/course/${course.id}`;
  switch (item.kind) {
    case "learn":
      return `${base}/guide#${item.topicIds[0]}`;
    case "review":
      return `${base}/flashcards`;
    case "quiz":
      return `${base}/quiz${item.topicIds.length === 1 ? `?topic=${item.topicIds[0]}` : "?mode=weak_spots"}`;
    case "mock_exam":
      return `${base}/quiz?mode=exam`;
  }
}

export function Plan({ course, mastery, set }: { course: Course; mastery: Record<string, number>; set: Set_ }) {
  const fromLink = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("exam");
  const upcomingExams = upcomingAssessments(course.syllabus).filter((a) => EXAM_TYPES.has(a.type) && a.date > toDateKey(new Date()));
  const [examDate, setExamDate] = useState(
    (fromLink && /^\d{4}-\d{2}-\d{2}$/.test(fromLink) ? fromLink : null) ??
      course.plan?.examDate ??
      upcomingExams[0]?.date ??
      defaultExamDate(),
  );
  const [minutes, setMinutes] = useState(course.plan?.minutesPerDay ?? 60);
  const todayKey = toDateKey(new Date());

  // The plan is rebuilt from today with current mastery, so it adapts as you study.
  const plan = useMemo(() => {
    if (!course.plan) return null;
    return buildPlan({
      topics: course.guide.topics,
      mastery,
      start: new Date(),
      exam: new Date(course.plan.examDate + "T00:00:00"),
      minutesPerDay: course.plan.minutesPerDay,
    });
  }, [course.plan, course.guide.topics, mastery]);

  const save = () =>
    set((c) => ({
      ...c,
      plan: { examDate, minutesPerDay: minutes, createdAt: new Date().toISOString(), completed: c.plan?.completed ?? [] },
    }));

  const toggle = (key: string) =>
    set((c) =>
      c.plan
        ? {
            ...c,
            plan: {
              ...c.plan,
              completed: c.plan.completed.includes(key) ? c.plan.completed.filter((k) => k !== key) : [...c.plan.completed, key],
            },
          }
        : c,
    );

  const daysLeft = Math.round((new Date(examDate + "T00:00:00").getTime() - new Date(todayKey + "T00:00:00").getTime()) / 86_400_000);

  return (
    <div className="plan">
      <div className="card">
        <h2>Your exam</h2>
        {upcomingExams.length > 0 && (
          <div className="exam-picks">
            <span className="small muted">From your syllabus:</span>
            {upcomingExams.map((a) => (
              <button
                key={a.name + a.date}
                className={`chip toggle ${examDate === a.date ? "on" : ""}`}
                onClick={() => setExamDate(a.date)}
              >
                {a.name} · {formatDate(a.date)} ({countdown(a.date)})
              </button>
            ))}
          </div>
        )}
        <div className="row wrap">
          <label className="inline-field">
            Exam date
            <input type="date" value={examDate} min={todayKey} onChange={(e) => setExamDate(e.target.value)} />
          </label>
          <label className="inline-field">
            Study time per day
            <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
              {[20, 30, 45, 60, 90, 120, 180, 240].map((m) => (
                <option key={m} value={m}>
                  {m < 60 ? `${m} min` : `${m / 60} h`}
                </option>
              ))}
            </select>
          </label>
          <button className="btn primary" onClick={save} disabled={daysLeft < 1}>
            {course.plan ? "Update plan" : "Build my plan"}
          </button>
        </div>
        {daysLeft < 1 ? (
          <p className="small banner warn">Pick a date after today.</p>
        ) : (
          <p className="muted small">
            {daysLeft} day{daysLeft === 1 ? "" : "s"} to go. The plan re-balances itself from your quiz and flashcard results each
            time you open it.
          </p>
        )}
      </div>

      {plan && plan.unscheduledMinutes > 0 && (
        <div className="banner warn">
          About {Math.round(plan.unscheduledMinutes / 5) * 5} minutes of learning don't fit before the exam. Increase daily study
          time, or focus on the topics marked as foundational first.
        </div>
      )}

      {plan && (
        <ol className="plan-days">
          {plan.days.map((day) => {
            const date = new Date(day.date + "T00:00:00");
            return (
              <li key={day.date} className={`card plan-day ${day.date === todayKey ? "today" : ""}`}>
                <div className="plan-date">
                  <strong>{day.date === todayKey ? "Today" : date.toLocaleDateString(undefined, { weekday: "long" })}</strong>
                  <span className="muted small">{date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                  <span className="muted small">{day.minutes} min</span>
                </div>
                <ul>
                  {day.items.map((item, i) => {
                    const key = `${day.date}|${item.label}`;
                    const done = course.plan!.completed.includes(key);
                    return (
                      <li key={i} className={done ? "done" : ""}>
                        <input type="checkbox" checked={done} onChange={() => toggle(key)} aria-label={`Mark "${item.label}" done`} />
                        <span aria-hidden>{KIND_ICON[item.kind]}</span>
                        <a href={itemHref(course, item)}>{item.label}</a>
                        <span className="muted small nowrap">{item.minutes} min</span>
                      </li>
                    );
                  })}
                  {day.items.length === 0 && <li className="muted">Rest day</li>}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

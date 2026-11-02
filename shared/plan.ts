/**
 * Builds a day-by-day study plan from now until the exam: learn topics in
 * prerequisite order (weakest/hardest get more time), schedule spaced reviews
 * after each topic is learned, fill spare time with practice quizzes, and keep
 * the final day for a mock exam.
 */

export interface PlanTopic {
  id: string;
  name: string;
  estimatedMinutes: number;
  difficulty: "foundational" | "intermediate" | "advanced";
  prerequisites: string[];
}

export type PlanItemKind = "learn" | "review" | "quiz" | "mock_exam";

export interface PlanItem {
  kind: PlanItemKind;
  topicIds: string[];
  minutes: number;
  label: string;
}

export interface PlanDay {
  date: string; // YYYY-MM-DD
  items: PlanItem[];
  minutes: number;
}

export interface StudyPlan {
  days: PlanDay[];
  unscheduledMinutes: number; // learning that didn't fit before the exam
  totalMinutes: number;
}

export interface PlanInput {
  topics: PlanTopic[];
  mastery: Record<string, number>;
  start: Date;
  exam: Date;
  minutesPerDay: number;
}

const REVIEW_OFFSETS = [1, 3, 7];
const REVIEW_MINUTES = 10;
const MIN_CHUNK = 10;
const DIFFICULTY_FACTOR = { foundational: 1, intermediate: 1.2, advanced: 1.45 } as const;

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Topological order that keeps the original order wherever prerequisites allow. */
export function orderByPrerequisites<T extends { id: string; prerequisites: string[] }>(topics: T[]): T[] {
  const ids = new Set(topics.map((t) => t.id));
  const done = new Set<string>();
  const result: T[] = [];
  const remaining = [...topics];
  while (remaining.length) {
    const idx = remaining.findIndex((t) => t.prerequisites.every((p) => !ids.has(p) || done.has(p)));
    // A cycle: take the first remaining topic rather than looping forever.
    const [next] = remaining.splice(idx === -1 ? 0 : idx, 1);
    done.add(next.id);
    result.push(next);
  }
  return result;
}

export function learnMinutes(topic: PlanTopic, mastery: number): number {
  const base = Math.max(MIN_CHUNK, topic.estimatedMinutes) * DIFFICULTY_FACTOR[topic.difficulty];
  return Math.max(MIN_CHUNK, Math.round((base * (1 - mastery)) / 5) * 5);
}

export function buildPlan({ topics, mastery, start, exam, minutesPerDay }: PlanInput): StudyPlan {
  const first = startOfDay(start);
  const examDay = startOfDay(exam);
  const dayCount = Math.max(1, Math.round((examDay.getTime() - first.getTime()) / 86_400_000));
  const budget = Math.max(MIN_CHUNK, Math.round(minutesPerDay));
  const names = new Map(topics.map((t) => [t.id, t.name]));

  const days: PlanDay[] = Array.from({ length: dayCount }, (_, i) => ({
    date: toDateKey(new Date(first.getFullYear(), first.getMonth(), first.getDate() + i)),
    items: [],
    minutes: 0,
  }));

  const hasMockDay = dayCount >= 3;
  const studyDays = hasMockDay ? dayCount - 1 : dayCount;

  const queue = orderByPrerequisites(topics.filter((t) => (mastery[t.id] ?? 0) < 0.65)).map((t) => ({
    topic: t,
    left: learnMinutes(t, mastery[t.id] ?? 0),
  }));
  // Topics already solid but not mastered get one refresher review early on.
  const refreshers = topics.filter((t) => (mastery[t.id] ?? 0) >= 0.65 && (mastery[t.id] ?? 0) < 0.85);
  const reviewsByDay = new Map<number, string[]>();
  const addReview = (day: number, id: string) => {
    if (day >= studyDays) return;
    reviewsByDay.set(day, [...(reviewsByDay.get(day) ?? []), id]);
  };
  refreshers.forEach((t, i) => addReview(Math.min(studyDays - 1, i % Math.max(1, Math.ceil(studyDays / 2))), t.id));

  const learnedSoFar: string[] = topics.filter((t) => (mastery[t.id] ?? 0) >= 0.65).map((t) => t.id);

  const push = (day: PlanDay, item: PlanItem) => {
    const last = day.items[day.items.length - 1];
    if (last && last.kind === item.kind && item.kind !== "learn" && item.kind !== "mock_exam") {
      last.topicIds = [...new Set([...last.topicIds, ...item.topicIds])];
      last.minutes += item.minutes;
      last.label = labelFor(last.kind, last.topicIds, names);
    } else {
      day.items.push(item);
    }
    day.minutes += item.minutes;
  };

  for (let d = 0; d < studyDays; d++) {
    const day = days[d];
    // 1. Spaced reviews, capped at 40% of the day.
    const reviewIds = [...new Set(reviewsByDay.get(d) ?? [])];
    const reviewCap = Math.max(REVIEW_MINUTES, Math.floor((budget * 0.4) / REVIEW_MINUTES) * REVIEW_MINUTES);
    const fitting = reviewIds.slice(0, Math.max(1, Math.floor(reviewCap / REVIEW_MINUTES)));
    const overflow = reviewIds.slice(fitting.length);
    overflow.forEach((id) => addReview(d + 1, id));
    if (fitting.length) {
      push(day, { kind: "review", topicIds: fitting, minutes: fitting.length * REVIEW_MINUTES, label: "" });
    }

    // 2. Learn new material.
    while (queue.length && budget - day.minutes >= MIN_CHUNK) {
      const head = queue[0];
      const chunk = Math.min(head.left, budget - day.minutes);
      head.left -= chunk;
      const finished = head.left <= 0;
      push(day, {
        kind: "learn",
        topicIds: [head.topic.id],
        minutes: chunk,
        label: `${finished && chunk !== learnMinutes(head.topic, mastery[head.topic.id] ?? 0) ? "Finish" : "Learn"}: ${head.topic.name}`,
      });
      if (finished) {
        queue.shift();
        learnedSoFar.push(head.topic.id);
        REVIEW_OFFSETS.forEach((off) => addReview(d + off, head.topic.id));
      } else {
        break; // day is full
      }
    }

    // 3. Spare time: practice quiz on what's been learned, weakest first.
    const spare = budget - day.minutes;
    if (spare >= MIN_CHUNK && learnedSoFar.length) {
      const weakest = [...learnedSoFar].sort((a, b) => (mastery[a] ?? 0) - (mastery[b] ?? 0)).slice(0, 3);
      push(day, { kind: "quiz", topicIds: weakest, minutes: Math.floor(spare / 5) * 5, label: "" });
    }
  }

  if (hasMockDay) {
    const day = days[dayCount - 1];
    const all = topics.map((t) => t.id);
    const mockMinutes = Math.min(budget, Math.max(30, Math.round(budget * 0.6)));
    push(day, { kind: "mock_exam", topicIds: all, minutes: mockMinutes, label: "Mock exam: all topics" });
    const rest = budget - mockMinutes;
    if (rest >= MIN_CHUNK) {
      const weakest = [...all].sort((a, b) => (mastery[a] ?? 0) - (mastery[b] ?? 0)).slice(0, 3);
      push(day, { kind: "review", topicIds: weakest, minutes: rest, label: "" });
    }
  }

  for (const day of days) {
    for (const item of day.items) if (!item.label) item.label = labelFor(item.kind, item.topicIds, names);
  }

  const unscheduledMinutes = queue.reduce((s, q) => s + q.left, 0);
  const totalMinutes = days.reduce((s, d) => s + d.minutes, 0);
  return { days, unscheduledMinutes, totalMinutes };
}

function labelFor(kind: PlanItemKind, ids: string[], names: Map<string, string>): string {
  const list = ids.map((id) => names.get(id) ?? id).join(", ");
  switch (kind) {
    case "review":
      return `Review: ${list}`;
    case "quiz":
      return `Practice quiz: ${list}`;
    case "mock_exam":
      return "Mock exam: all topics";
    default:
      return `Learn: ${list}`;
  }
}

import type { QuizStyle } from "../../shared/schemas";
import type { Course } from "./types";

const QUANTITATIVE =
  /math|calculus|algebra|geometr|trigonometr|statistic|probabilit|physics|mechanic|engineering|circuit|electr|thermo|chemistr|stoichiometr|economic|finance|accounting|matri|vector|equation|integral|derivative|differential|eigen|fourier|laplace|series|complex number|programming|algorithm/i;

/** Problem-heavy quizzes for quantitative courses, a balanced mix otherwise. */
export function defaultQuizStyle(course: Course): QuizStyle {
  if (course.quizStyle) return course.quizStyle;
  const text = [course.title, course.guide.title, ...course.guide.topics.map((t) => t.name)].join(" ");
  return QUANTITATIVE.test(text) ? "problems" : "balanced";
}

export const QUIZ_STYLES: { id: QuizStyle; label: string; desc: string }[] = [
  { id: "problems", label: "Problem solving", desc: "Worked exercises: calculate, solve, prove" },
  { id: "balanced", label: "Balanced", desc: "Problems plus concept questions" },
  { id: "concepts", label: "Concepts", desc: "Definitions, ideas and reasoning" },
];

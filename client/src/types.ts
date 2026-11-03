import type { StudyGuide, Question, Grade, Syllabus, SourceKind, QuizStyle } from "../../shared/schemas";
import type { CardSchedule } from "../../shared/srs";
import type { QuizAttempt } from "../../shared/mastery";

export type { StudyGuide, Question, Grade, CardSchedule, QuizAttempt, Syllabus, SourceKind };

export interface Flashcard {
  id: string;
  topicId: string;
  front: string;
  back: string;
  schedule: CardSchedule;
}

export interface QuizRecord {
  id: string;
  at: string;
  mode: "practice" | "weak_spots" | "exam";
  score: number; // 0..1
  total: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface PlanSettings {
  examDate: string; // YYYY-MM-DD
  minutesPerDay: number;
  createdAt: string; // plan is anchored to this date
  completed: string[]; // keys "date|index"
}

export interface Course {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  content: string;
  sources: { name: string; chars: number; kind?: SourceKind; summary?: string }[];
  guide: StudyGuide;
  cards: Flashcard[];
  attempts: QuizAttempt[];
  quizzes: QuizRecord[];
  chat: ChatMessage[];
  plan?: PlanSettings;
  /** Key points the student has ticked off in the study guide, as "topicId|index". */
  checked?: string[];
  /** Structure read from the course syllabus, if one was provided. */
  syllabus?: Syllabus;
  /** The quiz question style the student last chose. */
  quizStyle?: QuizStyle;
}

import { retention, type CardSchedule } from "./srs";

export interface QuizAttempt {
  topicId: string;
  score: number; // 0..1
  at: string;
}

/**
 * Estimate topic mastery (0..1) from quiz attempts and flashcard retention.
 * Quiz scores use a skeptical Beta(0.5, 1.5) prior (you're assumed not ready until shown
 * otherwise), so a single lucky answer doesn't read as mastery,
 * and recent attempts count more than old ones.
 */
export function topicMastery(topicId: string, attempts: QuizAttempt[], cards: CardSchedule[]): number {
  const mine = attempts.filter((a) => a.topicId === topicId).sort((a, b) => a.at.localeCompare(b.at));
  let weightSum = 0;
  let scoreSum = 0;
  mine.forEach((a, i) => {
    const w = Math.pow(0.85, mine.length - 1 - i); // most recent = 1
    weightSum += w;
    scoreSum += w * a.score;
  });
  const quiz = (scoreSum + 0.5) / (weightSum + 2);
  const quizConfidence = weightSum / (weightSum + 2);

  const reviewed = cards.filter((c) => c.lastReviewed);
  const cardScore = reviewed.length ? reviewed.reduce((s, c) => s + retention(c), 0) / reviewed.length : 0;
  const cardConfidence = cards.length ? reviewed.length / cards.length : 0;

  if (quizConfidence === 0 && cardConfidence === 0) return 0;
  // Quizzes are the stronger signal; flashcards fill in when quizzes are sparse.
  const qw = quizConfidence * 2;
  const cw = cardConfidence;
  return (quiz * qw + cardScore * cw) / (qw + cw);
}

/** Overall readiness: mastery weighted by each topic's study time. */
export function readiness(topics: { id: string; estimatedMinutes: number }[], mastery: Record<string, number>): number {
  const total = topics.reduce((s, t) => s + Math.max(1, t.estimatedMinutes), 0);
  if (!total) return 0;
  return topics.reduce((s, t) => s + Math.max(1, t.estimatedMinutes) * (mastery[t.id] ?? 0), 0) / total;
}

export function masteryLabel(m: number): string {
  if (m >= 0.85) return "Mastered";
  if (m >= 0.65) return "Solid";
  if (m >= 0.4) return "Developing";
  if (m > 0) return "Weak";
  return "Not started";
}

/**
 * Spaced repetition based on SM-2, with four answer ratings.
 * Intervals are in days; `due` is an ISO timestamp.
 */

export type Rating = "again" | "hard" | "good" | "easy";

export interface CardSchedule {
  ease: number; // ease factor, >= 1.3
  interval: number; // days until next review
  reps: number; // consecutive successful reviews
  lapses: number;
  due: string;
  lastReviewed?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_EASE = 1.3;

export function newSchedule(now: Date = new Date()): CardSchedule {
  return { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now.toISOString() };
}

export function review(card: CardSchedule, rating: Rating, now: Date = new Date()): CardSchedule {
  let { ease, interval, reps, lapses } = card;

  if (rating === "again") {
    reps = 0;
    lapses += 1;
    ease = Math.max(MIN_EASE, ease - 0.2);
    // Relearn in 10 minutes.
    return {
      ease,
      interval: 0,
      reps,
      lapses,
      due: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
      lastReviewed: now.toISOString(),
    };
  }

  if (rating === "hard") ease = Math.max(MIN_EASE, ease - 0.15);
  if (rating === "easy") ease = ease + 0.15;

  if (reps === 0) {
    interval = rating === "easy" ? 3 : 1;
  } else if (reps === 1) {
    interval = rating === "hard" ? 3 : rating === "easy" ? 8 : 6;
  } else {
    const multiplier = rating === "hard" ? 1.2 : rating === "easy" ? ease * 1.3 : ease;
    interval = Math.max(interval + 1, Math.round(interval * multiplier));
  }
  reps += 1;

  return {
    ease,
    interval,
    reps,
    lapses,
    due: new Date(now.getTime() + interval * DAY_MS).toISOString(),
    lastReviewed: now.toISOString(),
  };
}

export function isDue(card: CardSchedule, now: Date = new Date()): boolean {
  return new Date(card.due).getTime() <= now.getTime();
}

/** How well a card is retained, 0..1, for mastery estimates. */
export function retention(card: CardSchedule): number {
  if (!card.lastReviewed) return 0;
  // A card answered correctly with a long interval is well known.
  const fromInterval = 1 - Math.exp(-card.interval / 6);
  const lapsePenalty = Math.min(0.5, card.lapses * 0.1);
  return Math.max(0, Math.min(1, fromInterval - lapsePenalty + (card.reps > 0 ? 0.15 : 0)));
}

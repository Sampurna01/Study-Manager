import { describe, expect, it } from "vitest";
import { isDue, newSchedule, retention, review } from "../shared/srs";

const now = new Date("2026-01-01T12:00:00Z");
const days = (iso: string) => (new Date(iso).getTime() - now.getTime()) / 86_400_000;

describe("spaced repetition", () => {
  it("new cards are due immediately", () => {
    expect(isDue(newSchedule(now), now)).toBe(true);
  });

  it("grows intervals on successive good answers", () => {
    let s = newSchedule(now);
    s = review(s, "good", now);
    expect(s.interval).toBe(1);
    s = review(s, "good", now);
    expect(s.interval).toBe(6);
    s = review(s, "good", now);
    expect(s.interval).toBe(15);
    expect(days(s.due)).toBeCloseTo(15);
  });

  it("'again' resets progress, lowers ease and relearns in 10 minutes", () => {
    let s = review(review(newSchedule(now), "good", now), "good", now);
    s = review(s, "again", now);
    expect(s.reps).toBe(0);
    expect(s.lapses).toBe(1);
    expect(s.ease).toBeCloseTo(2.3);
    expect(new Date(s.due).getTime() - now.getTime()).toBe(10 * 60 * 1000);
  });

  it("never drops ease below 1.3", () => {
    let s = newSchedule(now);
    for (let i = 0; i < 20; i++) s = review(s, "again", now);
    expect(s.ease).toBe(1.3);
  });

  it("easy beats good beats hard", () => {
    const base = review(review(newSchedule(now), "good", now), "good", now);
    const hard = review(base, "hard", now).interval;
    const good = review(base, "good", now).interval;
    const easy = review(base, "easy", now).interval;
    expect(hard).toBeLessThan(good);
    expect(good).toBeLessThan(easy);
  });

  it("retention is 0 for unseen cards and rises with interval", () => {
    expect(retention(newSchedule(now))).toBe(0);
    const once = review(newSchedule(now), "good", now);
    const thrice = review(review(once, "good", now), "good", now);
    expect(retention(thrice)).toBeGreaterThan(retention(once));
  });
});

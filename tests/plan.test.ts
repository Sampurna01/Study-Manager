import { describe, expect, it } from "vitest";
import { buildPlan, orderByPrerequisites, type PlanTopic } from "../shared/plan";

const topic = (id: string, prerequisites: string[] = [], estimatedMinutes = 30): PlanTopic => ({
  id,
  name: id.toUpperCase(),
  estimatedMinutes,
  difficulty: "foundational",
  prerequisites,
});

const start = new Date(2026, 0, 1, 9);
const examIn = (n: number) => new Date(2026, 0, 1 + n);

describe("orderByPrerequisites", () => {
  it("puts prerequisites first while keeping the original order otherwise", () => {
    const order = orderByPrerequisites([topic("c", ["b"]), topic("a"), topic("b", ["a"]), topic("d")]);
    expect(order.map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("doesn't loop forever on cycles", () => {
    expect(orderByPrerequisites([topic("a", ["b"]), topic("b", ["a"])])).toHaveLength(2);
  });
});

describe("buildPlan", () => {
  const topics = [topic("a"), topic("b", ["a"]), topic("c", ["b"])];

  it("creates one entry per day until the exam and never exceeds the daily budget", () => {
    const plan = buildPlan({ topics, mastery: {}, start, exam: examIn(7), minutesPerDay: 45 });
    expect(plan.days).toHaveLength(7);
    expect(plan.days[0].date).toBe("2026-01-01");
    for (const d of plan.days) expect(d.minutes).toBeLessThanOrEqual(45);
  });

  it("learns every topic in prerequisite order and ends with a mock exam", () => {
    const plan = buildPlan({ topics, mastery: {}, start, exam: examIn(7), minutesPerDay: 60 });
    const learned = plan.days.flatMap((d) => d.items.filter((i) => i.kind === "learn").map((i) => i.topicIds[0]));
    expect([...new Set(learned)]).toEqual(["a", "b", "c"]);
    expect(plan.days.at(-1)!.items[0].kind).toBe("mock_exam");
    expect(plan.unscheduledMinutes).toBe(0);
  });

  it("schedules spaced reviews after a topic is learned", () => {
    const plan = buildPlan({ topics: [topic("a")], mastery: {}, start, exam: examIn(10), minutesPerDay: 60 });
    const reviewDays = plan.days
      .map((d, i) => (d.items.some((it) => it.kind === "review" && it.topicIds.includes("a")) ? i : -1))
      .filter((i) => i >= 0);
    expect(reviewDays).toEqual(expect.arrayContaining([1, 3, 7]));
  });

  it("skips learning for mastered topics", () => {
    const plan = buildPlan({ topics, mastery: { a: 0.95 }, start, exam: examIn(7), minutesPerDay: 60 });
    const learned = plan.days.flatMap((d) => d.items.filter((i) => i.kind === "learn").map((i) => i.topicIds[0]));
    expect(learned).not.toContain("a");
  });

  it("reports learning that doesn't fit", () => {
    const big = [topic("a", [], 300), topic("b", [], 300)];
    const plan = buildPlan({ topics: big, mastery: {}, start, exam: examIn(2), minutesPerDay: 30 });
    expect(plan.unscheduledMinutes).toBeGreaterThan(0);
  });

  it("handles an exam tomorrow", () => {
    const plan = buildPlan({ topics, mastery: {}, start, exam: examIn(1), minutesPerDay: 60 });
    expect(plan.days).toHaveLength(1);
    expect(plan.days[0].minutes).toBeGreaterThan(0);
  });
});

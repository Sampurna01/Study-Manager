import { describe, expect, it } from "vitest";
import { demoClassify, demoFlashcards, demoGrade, demoGuide, demoQuiz, demoSyllabus } from "../server/demo";

const content = `# Photosynthesis
Photosynthesis converts light energy into chemical energy. Chlorophyll absorbs mostly red and blue light.

# Respiration
Cellular respiration releases energy from glucose. Mitochondria produce most of the cell's ATP.`;

describe("demo mode", () => {
  it("builds a guide from headings", () => {
    const g = demoGuide("", content);
    expect(g.topics.map((t) => t.id)).toEqual(["photosynthesis", "respiration"]);
    expect(g.topics[1].prerequisites).toEqual(["photosynthesis"]);
  });

  it("produces cards and well-formed quiz questions", () => {
    const topics = demoGuide("", content).topics.map((t) => ({ id: t.id, name: t.name }));
    expect(demoFlashcards({ content, topics, count: 3, existingFronts: [] }).length).toBeGreaterThan(0);
    for (const q of demoQuiz({ content, topics, count: 4, mode: "practice" })) {
      if (q.type === "multiple_choice") {
        expect(q.options).toHaveLength(4);
        expect(q.options[q.correctOption]).toBe(q.modelAnswer);
      }
    }
  });

  it("grades by overlap", () => {
    const g = demoGrade({ content, prompt: "p", modelAnswer: "Mitochondria produce ATP", studentAnswer: "mitochondria produce atp" });
    expect(g.verdict).toBe("correct");
  });
});

const SYLLABUS = `BIO 101 Syllabus - Fall 2026
Instructor: Dr. Rivera
Learning outcomes are listed below. Office hours: Tuesdays.
Week 1: Photosynthesis basics (Sep 2)
Week 2: Respiration
Grading
Midterm exam: 30% (Oct 15)
Final exam: 40% (2026-12-10)
Assignments: 30%`;

describe("demo syllabus reading", () => {
  it("recognises a syllabus and ordinary notes", () => {
    expect(demoClassify("course.pdf", SYLLABUS).kind).toBe("syllabus");
    expect(demoClassify("chapter3.pdf", content).kind).toBe("textbook");
    expect(demoClassify("notes.md", content).kind).toBe("lecture_notes");
  });

  it("extracts schedule, assessments, weights and dates", () => {
    const topics = demoGuide("", content).topics.map((t) => ({ id: t.id, name: t.name }));
    const s = demoSyllabus({ text: SYLLABUS, topics, today: "2026-08-20" });
    expect(s.courseCode).toBe("BIO 101");
    expect(s.term).toBe("Fall 2026");
    expect(s.instructor).toBe("Dr. Rivera");
    expect(s.schedule.map((w) => w.label)).toEqual(["Week 1", "Week 2"]);
    expect(s.schedule[0]).toMatchObject({ date: "2026-09-02", topicIds: ["photosynthesis"] });
    expect(s.schedule[1].topicIds).toEqual(["respiration"]);
    const midterm = s.assessments.find((a) => a.type === "midterm")!;
    expect(midterm).toMatchObject({ weightPercent: 30, date: "2026-10-15" });
    expect(s.assessments.find((a) => a.type === "final")).toMatchObject({ weightPercent: 40, date: "2026-12-10" });
  });
});

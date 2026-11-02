import { useEffect, useState } from "react";
import { useCourses, useMastery } from "./store";
import { api } from "./api";
import type { Course } from "./types";
import { NewCourse } from "./views/NewCourse";
import { Overview } from "./views/Overview";
import { Guide } from "./views/Guide";
import { Flashcards } from "./views/Flashcards";
import { Quiz } from "./views/Quiz";
import { Tutor } from "./views/Tutor";
import { Plan } from "./views/Plan";
import { Syllabus } from "./views/Syllabus";
import { isDue } from "../../shared/srs";

export const TABS = [
  { id: "overview", label: "Overview" },
  { id: "syllabus", label: "Syllabus" },
  { id: "guide", label: "Study guide" },
  { id: "flashcards", label: "Flashcards" },
  { id: "quiz", label: "Quiz" },
  { id: "tutor", label: "Tutor" },
  { id: "plan", label: "Study plan" },
] as const;
export type Tab = (typeof TABS)[number]["id"];

interface Route {
  courseId: string | null;
  tab: Tab;
}

function parseHash(): Route {
  const [, courseId, tab] = window.location.hash.match(/^#\/course\/([^/]+)(?:\/(\w+))?/) ?? [];
  return {
    courseId: courseId ?? null,
    tab: TABS.some((t) => t.id === tab) ? (tab as Tab) : "overview",
  };
}

export function navigate(courseId: string | null, tab: Tab = "overview") {
  window.location.hash = courseId ? `#/course/${courseId}/${tab}` : "#/";
}

export function App() {
  const { courses, error, save, update, remove } = useCourses();
  const [route, setRoute] = useState<Route>(parseHash);
  const [ai, setAi] = useState<{ provider: string; model: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseHash());
      setMenuOpen(false);
    };
    window.addEventListener("hashchange", onHash);
    api.health().then((h) => setAi({ provider: h.provider, model: h.model })).catch(() => undefined);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const course = courses?.find((c) => c.id === route.courseId) ?? null;

  return (
    <div className={`shell ${menuOpen ? "menu-open" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="logo" aria-hidden>
            ◆
          </span>
          Study Manager
        </div>
        <button className="btn primary block" onClick={() => navigate(null)}>
          + New course
        </button>
        <nav className="course-list" aria-label="Courses">
          {courses?.length === 0 && <p className="muted small">Your courses will appear here.</p>}
          {courses?.map((c) => (
            <a key={c.id} href={`#/course/${c.id}/overview`} className={c.id === route.courseId ? "active" : ""}>
              <span className="course-title">{c.title}</span>
              <span className="muted small">{c.guide.topics.length} topics</span>
            </a>
          ))}
        </nav>
        {ai?.provider === "demo" && (
          <div className="demo-note small">
            <strong>Demo mode.</strong> The server is using a simple offline generator, not real AI. Start it with{" "}
            <code>npm run dev</code> for the real thing.
          </div>
        )}
        {ai?.provider === "ollama" && (
          <div className="ai-note small muted">
            AI runs on this computer with <strong>{ai.model}</strong> (free, private).
          </div>
        )}
      </aside>

      <main className="main">
        <button className="menu-toggle btn ghost" onClick={() => setMenuOpen((o) => !o)} aria-label="Toggle course list">
          ☰ Courses
        </button>
        {error && <div className="banner warn">{error}</div>}
        {courses === null ? (
          <div className="center muted">Loading…</div>
        ) : course ? (
          <CourseView key={course.id} course={course} tab={route.tab} update={update} remove={remove} />
        ) : route.courseId ? (
          <div className="center">
            <p>That course doesn't exist on this device.</p>
            <button className="btn" onClick={() => navigate(null)}>
              Create a course
            </button>
          </div>
        ) : (
          <NewCourse
            onCreated={(c) => {
              save(c);
              navigate(c.id);
            }}
          />
        )}
      </main>
    </div>
  );
}

function CourseView({
  course,
  tab,
  update,
  remove,
}: {
  course: Course;
  tab: Tab;
  update: (id: string, fn: (c: Course) => Course) => void;
  remove: (id: string) => void;
}) {
  const { mastery, readiness } = useMastery(course);
  const set = (fn: (c: Course) => Course) => update(course.id, fn);
  const due = course.cards.filter((c) => isDue(c.schedule)).length;

  return (
    <div className="course">
      <header className="course-header">
        <div>
          <h1>{course.guide.title || course.title}</h1>
          <p className="muted small">
            {course.sources.map((s) => s.name).join(", ") || "Pasted text"} · {Math.round(course.content.length / 1000)}k
            characters
          </p>
        </div>
        <div className="readiness-pill" title="Estimated exam readiness">
          <span>{Math.round(readiness * 100)}%</span> ready
        </div>
      </header>
      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <a
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            href={`#/course/${course.id}/${t.id}`}
            className={tab === t.id ? "active" : ""}
          >
            {t.label}
            {t.id === "flashcards" && due > 0 && <span className="badge">{due}</span>}
          </a>
        ))}
      </nav>
      <section className="tab-body">
        {tab === "overview" && (
          <Overview
            course={course}
            mastery={mastery}
            readiness={readiness}
            onDelete={() => {
              if (confirm(`Delete "${course.title}" and all its progress? This can't be undone.`)) {
                remove(course.id);
                navigate(null);
              }
            }}
          />
        )}
        {tab === "guide" && <Guide course={course} mastery={mastery} set={set} />}
        {tab === "flashcards" && <Flashcards course={course} mastery={mastery} set={set} />}
        {tab === "quiz" && <Quiz course={course} mastery={mastery} set={set} />}
        {tab === "tutor" && <Tutor course={course} mastery={mastery} set={set} />}
        {tab === "plan" && <Plan course={course} mastery={mastery} set={set} />}
        {tab === "syllabus" && <Syllabus course={course} set={set} />}
      </section>
    </div>
  );
}

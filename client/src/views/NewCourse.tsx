import { useRef, useState } from "react";
import { api } from "../api";
import { uid } from "../store";
import type { Course } from "../types";
import { SAMPLE_COURSE } from "../sample";

interface Source {
  id: string;
  name: string;
  text: string;
}

const ACCEPT = ".pdf,.txt,.md,.markdown,.csv,.html,.htm,.json,.tex,.rtf";

export function NewCourse({ onCreated }: { onCreated: (c: Course) => void }) {
  const [title, setTitle] = useState("");
  const [pasted, setPasted] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [uploading, setUploading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function addFiles(files: File[]) {
    if (!files.length) return;
    setError(null);
    setUploading(true);
    try {
      const results = await api.extract(files);
      const problems = results.filter((r) => r.error).map((r) => `${r.name}: ${r.error}`);
      setSources((prev) => [
        ...prev,
        ...results.filter((r) => r.text).map((r) => ({ id: uid(), name: r.name, text: r.text })),
      ]);
      if (problems.length) setError(problems.join("\n"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const content = [
    ...sources.map((s) => `===== ${s.name} =====\n${s.text}`),
    ...(pasted.trim() ? [sources.length ? `===== Notes =====\n${pasted.trim()}` : pasted.trim()] : []),
  ].join("\n\n");

  async function build() {
    if (!content.trim()) return;
    setBuilding(true);
    setError(null);
    try {
      const guide = await api.guide(title.trim(), content);
      const now = new Date().toISOString();
      onCreated({
        id: uid(),
        title: title.trim() || guide.title,
        createdAt: now,
        updatedAt: now,
        content,
        sources: [
          ...sources.map((s) => ({ name: s.name, chars: s.text.length })),
          ...(pasted.trim() ? [{ name: "Pasted notes", chars: pasted.trim().length }] : []),
        ],
        guide,
        cards: [],
        attempts: [],
        quizzes: [],
        chat: [],
      });
    } catch (e) {
      setError((e as Error).message);
      setBuilding(false);
    }
  }

  if (building) {
    return (
      <div className="new-course building">
        <div className="spinner" aria-hidden />
        <h2>Reading your course material…</h2>
        <p className="muted">
          Claude is breaking it into topics, pulling out the key points, and writing your study guide. Large courses can take
          a minute or two.
        </p>
      </div>
    );
  }

  return (
    <div className="new-course">
      <h1>Prepare for a course</h1>
      <p className="lead muted">
        Add your lecture notes, slides, textbook chapters or syllabus. Study Manager turns them into a study guide, flashcards
        with spaced repetition, adaptive quizzes, a personal tutor and a day-by-day plan to your exam.
      </p>

      <label className="field">
        <span>Course name (optional)</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. BIO 101 — Cell Biology" />
      </label>

      <div
        className={`dropzone ${dragging ? "dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles([...e.dataTransfer.files]);
        }}
        onClick={() => fileInput.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileInput.current?.click()}
      >
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            addFiles([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <strong>{uploading ? "Reading files…" : "Drop files here or click to upload"}</strong>
        <span className="muted small">PDF, Markdown, text or HTML · up to 30 MB each</span>
      </div>

      {sources.length > 0 && (
        <ul className="sources">
          {sources.map((s) => (
            <li key={s.id}>
              <span>📄 {s.name}</span>
              <span className="muted small">{s.text.length.toLocaleString()} characters</span>
              <button className="btn ghost small" onClick={() => setSources((p) => p.filter((x) => x.id !== s.id))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="field">
        <span>…or paste text</span>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={10}
          placeholder="Paste lecture notes, a syllabus, a chapter…"
        />
      </label>

      {error && <div className="banner error pre">{error}</div>}

      <div className="row">
        <button className="btn primary large" disabled={!content.trim() || uploading} onClick={build}>
          Build my study guide
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            setTitle(SAMPLE_COURSE.title);
            setPasted(SAMPLE_COURSE.content);
          }}
        >
          Try a sample course
        </button>
      </div>
    </div>
  );
}

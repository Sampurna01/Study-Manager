import { useRef, useState } from "react";
import { api } from "../api";
import { uid } from "../store";
import type { Course, SourceKind } from "../types";
import { SOURCE_KINDS, SOURCE_KIND_LABEL } from "../../../shared/schemas";
import { SAMPLE_COURSE, sampleSyllabus } from "../sample";

interface Source {
  id: string;
  name: string;
  text: string;
  kind: SourceKind | null; // null while it's being identified
  summary?: string;
}

const ACCEPT = ".pdf,.txt,.md,.markdown,.csv,.html,.htm,.json,.tex,.rtf";
const PASTED = "Pasted text";

/** Label each document with its type so the AI knows what it's reading. */
export function combineSources(sources: { name: string; text: string; kind: SourceKind | null }[]): string {
  if (sources.length === 1 && sources[0].name === PASTED && sources[0].kind !== "syllabus") return sources[0].text;
  return sources.map((s) => `===== ${s.name} (${SOURCE_KIND_LABEL[s.kind ?? "other"]}) =====\n${s.text}`).join("\n\n");
}

export function NewCourse({ onCreated }: { onCreated: (c: Course) => void }) {
  const [title, setTitle] = useState("");
  const [pasted, setPasted] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const setKind = (id: string, kind: SourceKind, summary?: string) =>
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, kind, summary: summary ?? s.summary } : s)));

  async function identify(source: Source) {
    try {
      const c = await api.classify(source.name, source.text);
      setKind(source.id, c.kind, c.summary);
    } catch {
      setKind(source.id, "other", "Couldn't identify this file automatically — pick its type.");
    }
  }

  async function addFiles(files: File[]) {
    if (!files.length) return;
    setError(null);
    setUploading(true);
    try {
      const results = await api.extract(files);
      const problems = results.filter((r) => r.error).map((r) => `${r.name}: ${r.error}`);
      const added: Source[] = results.filter((r) => r.text).map((r) => ({ id: uid(), name: r.name, text: r.text, kind: null }));
      setSources((prev) => [...prev, ...added]);
      if (problems.length) setError(problems.join("\n"));
      added.forEach(identify);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const hasMaterial = sources.length > 0 || pasted.trim().length > 0;
  const identifying = sources.some((s) => s.kind === null);

  async function build() {
    if (!hasMaterial) return;
    setError(null);
    try {
      const all: Source[] = [...sources];
      if (pasted.trim()) {
        setStep("Identifying your pasted text…");
        const pastedSource: Source = { id: uid(), name: PASTED, text: pasted.trim(), kind: null };
        try {
          const c = await api.classify(PASTED, pastedSource.text);
          pastedSource.kind = c.kind;
          pastedSource.summary = c.summary;
        } catch {
          pastedSource.kind = "lecture_notes";
        }
        all.push(pastedSource);
      }
      const content = combineSources(all);

      setStep("Writing your study guide…");
      const guide = await api.guide(title.trim(), content);

      const syllabi = all.filter((s) => s.kind === "syllabus");
      let syllabus: Course["syllabus"];
      if (syllabi.length) {
        setStep("Reading your syllabus…");
        try {
          syllabus = await api.syllabus(
            syllabi.map((s) => s.text).join("\n\n"),
            guide.topics.map((t) => ({ id: t.id, name: t.name })),
          );
        } catch {
          // The guide is still useful; the syllabus can be re-read from the Syllabus tab.
          syllabus = undefined;
        }
      }

      const now = new Date().toISOString();
      onCreated({
        id: uid(),
        title: title.trim() || (syllabus?.courseCode ? `${syllabus.courseCode} — ${syllabus.courseName}` : guide.title),
        createdAt: now,
        updatedAt: now,
        content,
        sources: all.map((s) => ({ name: s.name, chars: s.text.length, kind: s.kind ?? "other", summary: s.summary })),
        guide,
        cards: [],
        attempts: [],
        quizzes: [],
        chat: [],
        syllabus,
      });
    } catch (e) {
      setError((e as Error).message);
      setStep(null);
    }
  }

  if (step) {
    return (
      <div className="new-course building">
        <div className="spinner" aria-hidden />
        <h2>{step}</h2>
        <p className="muted">
          The AI is reading your material, breaking it into topics and pulling out the key points
          {sources.some((s) => s.kind === "syllabus") ? ", then reading your syllabus for the schedule and exam dates" : ""}. On
          your own computer this can take a few minutes, especially the first time. Keep this tab open.
        </p>
      </div>
    );
  }

  return (
    <div className="new-course">
      <h1>Prepare for a course</h1>
      <p className="lead muted">
        Add your syllabus, lecture notes, slides, textbook chapters, assignments or past exams. Study Manager works out what each file
        is, reads your syllabus for the schedule and exam dates, and turns everything into a study guide, flashcards, quizzes, a
        tutor and a day-by-day plan.
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
        <span className="muted small">Syllabus, notes, slides, readings, past exams · PDF, Markdown, text or HTML · up to 30 MB each</span>
      </div>

      {sources.length > 0 && (
        <ul className="sources">
          {sources.map((s) => (
            <li key={s.id}>
              <div className="source-info">
                <span className="source-name">📄 {s.name}</span>
                <span className="muted small">
                  {s.text.length.toLocaleString()} characters{s.summary ? ` · ${s.summary}` : ""}
                </span>
              </div>
              {s.kind === null ? (
                <span className="chip identifying">Identifying…</span>
              ) : (
                <select
                  className={`kind-select ${s.kind}`}
                  value={s.kind}
                  onChange={(e) => setKind(s.id, e.target.value as SourceKind)}
                  aria-label={`Type of ${s.name}`}
                >
                  {SOURCE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {SOURCE_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              )}
              <button className="btn ghost small" onClick={() => setSources((p) => p.filter((x) => x.id !== s.id))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {sources.length > 0 && !identifying && !sources.some((s) => s.kind === "syllabus") && (
        <p className="small muted">💡 Have a syllabus? Add it too — the app will pick up your schedule and exam dates.</p>
      )}

      <label className="field">
        <span>…or paste text</span>
        <textarea
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={10}
          placeholder="Paste a syllabus, lecture notes, a chapter…"
        />
      </label>

      {error && <div className="banner error pre">{error}</div>}

      <div className="row">
        <button className="btn primary large" disabled={!hasMaterial || uploading || identifying} onClick={build}>
          {identifying ? "Identifying files…" : "Build my study guide"}
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            setTitle(SAMPLE_COURSE.title);
            setPasted(SAMPLE_COURSE.content);
            if (!sources.some((x) => x.name === "BIO101-syllabus.txt")) {
              const syllabus: Source = { id: uid(), name: "BIO101-syllabus.txt", text: sampleSyllabus(), kind: null };
              setSources((prev) => [...prev, syllabus]);
              identify(syllabus);
            }
          }}
        >
          Try a sample course
        </button>
      </div>
    </div>
  );
}

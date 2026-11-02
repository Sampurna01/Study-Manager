import { useEffect, useRef, useState } from "react";
import type { ChatMessage, Course } from "../types";
import { api } from "../api";
import { Markdown } from "../Markdown";

type Set_ = (fn: (c: Course) => Course) => void;

// Older turns are dropped from what's sent (not from what's shown) to keep requests bounded.
const MAX_HISTORY = 40;

export function Tutor({ course, mastery, set }: { course: Course; mastery: Record<string, number>; set: Set_ }) {
  const topics = course.guide.topics;
  const [input, setInput] = useState(() => {
    const id = new URLSearchParams(window.location.hash.split("?")[1] ?? "").get("topic");
    const t = topics.find((x) => x.id === id);
    return t ? `Can you teach me "${t.name}"? Start with the big picture, then check my understanding.` : "";
  });
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [course.chat.length, streaming]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(text: string) {
    const content = text.trim();
    if (!content || streaming !== null) return;
    const history: ChatMessage[] = [...course.chat, { role: "user", content }];
    set((c) => ({ ...c, chat: history }));
    setInput("");
    setError(null);
    setStreaming("");
    const controller = new AbortController();
    abortRef.current = controller;
    let reply = "";
    try {
      let sent = history.slice(-MAX_HISTORY);
      if (sent[0]?.role !== "user") sent = sent.slice(1);
      await api.tutor(course.content, sent, (t) => {
        reply += t;
        setStreaming(reply);
      }, controller.signal);
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (reply.trim()) set((c) => ({ ...c, chat: [...c.chat, { role: "assistant", content: reply }] }));
      else if (!controller.signal.aborted) set((c) => ({ ...c, chat: c.chat.slice(0, -1) }));
      if (!reply.trim()) setInput(content);
      setStreaming(null);
      abortRef.current = null;
    }
  }

  const weakest = [...topics].sort((a, b) => (mastery[a.id] ?? 0) - (mastery[b.id] ?? 0))[0]?.name ?? "this course";
  const suggestions = [
    "Give me a 5-minute overview of the whole course.",
    `Explain "${topics[0]?.name ?? "the first topic"}" like I'm new to it.`,
    "What are the most likely exam questions, and how should I answer them?",
    `Quiz me on "${weakest}", one question at a time.`,
  ];

  return (
    <div className="tutor">
      <div className="chat card">
        {course.chat.length === 0 && streaming === null && (
          <div className="chat-empty">
            <h2>Your personal tutor</h2>
            <p className="muted">Ask anything about the course. The tutor answers from your material and can quiz you, explain step by step, or work through problems with hints.</p>
            <div className="suggestions">
              {suggestions.map((s) => (
                <button key={s} className="chip toggle" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {course.chat.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.role === "assistant" ? <Markdown text={m.content} /> : <p>{m.content}</p>}
          </div>
        ))}
        {streaming !== null && (
          <div className="msg assistant">
            {streaming ? <Markdown text={streaming} /> : <span className="typing" aria-label="Tutor is typing"><i /><i /><i /></span>}
          </div>
        )}
        <div ref={endRef} />
      </div>
      {error && <div className="banner error">{error}</div>}
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          rows={2}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder="Ask your tutor… (Enter to send, Shift+Enter for a new line)"
        />
        {streaming !== null ? (
          <button type="button" className="btn" onClick={() => abortRef.current?.abort()}>
            Stop
          </button>
        ) : (
          <button className="btn primary" disabled={!input.trim()}>
            Send
          </button>
        )}
      </form>
      {course.chat.length > 0 && streaming === null && (
        <button className="btn ghost small" onClick={() => set((c) => ({ ...c, chat: [] }))}>
          Clear conversation
        </button>
      )}
    </div>
  );
}

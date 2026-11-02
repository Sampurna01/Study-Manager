import { useEffect, useRef, useState } from "react";
import type { ChatMessage, Course } from "../../types";
import { api } from "../../api";
import { Markdown } from "../../Markdown";

type Set_ = (fn: (c: Course) => Course) => void;

export interface ExplainRequest {
  text: string;
  topicName: string;
}

/** Side panel that streams a plain-language explanation of a selected passage. */
export function ExplainPanel({
  course,
  request,
  set,
  onClose,
}: {
  course: Course;
  request: ExplainRequest;
  set: Set_;
  onClose: () => void;
}) {
  const [reply, setReply] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const question = `I'm studying "${request.topicName}". Explain this part in simple terms, with a short example if it helps:\n\n"${request.text}"`;
  const replyRef = useRef("");

  useEffect(() => {
    const controller = new AbortController();
    replyRef.current = "";
    setReply("");
    setDone(false);
    setError(null);
    api
      .tutor(course.content, [{ role: "user", content: question }], (t) => {
        replyRef.current += t;
        setReply(replyRef.current);
      }, controller.signal)
      .catch((e) => {
        if (!controller.signal.aborted) setError((e as Error).message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setDone(true);
      });
    return () => controller.abort();
    // Re-run only when a new passage is selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function continueInTutor() {
    const added: ChatMessage[] = [
      { role: "user", content: question },
      { role: "assistant", content: replyRef.current },
    ];
    set((c) => ({ ...c, chat: [...c.chat, ...added] }));
    window.location.hash = `#/course/${course.id}/tutor`;
  }

  return (
    <aside className="explain-panel" role="dialog" aria-label="Explanation">
      <div className="row spread">
        <h3>Explain this</h3>
        <button className="btn ghost small" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <blockquote>{request.text}</blockquote>
      <div className="explain-body">
        {reply ? (
          <Markdown text={reply} />
        ) : !error ? (
          <span className="typing" aria-label="Thinking">
            <i />
            <i />
            <i />
          </span>
        ) : null}
        {error && <div className="banner error">{error}</div>}
      </div>
      {done && reply && (
        <div className="row">
          <button className="btn primary small" onClick={continueInTutor}>
            Ask a follow-up in the tutor
          </button>
        </div>
      )}
    </aside>
  );
}

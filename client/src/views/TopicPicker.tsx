import type { Topic } from "../../../shared/schemas";

export function TopicPicker({
  topics,
  mastery,
  selected,
  onChange,
}: {
  topics: Topic[];
  mastery: Record<string, number>;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const weakest = [...topics]
    .sort((a, b) => (mastery[a.id] ?? 0) - (mastery[b.id] ?? 0))
    .slice(0, Math.min(3, topics.length))
    .map((t) => t.id);
  return (
    <div className="topic-picker">
      <div className="row small">
        <span className="muted">Topics:</span>
        <button className="link" onClick={() => onChange(topics.map((t) => t.id))}>
          All
        </button>
        <button className="link" onClick={() => onChange(weakest)}>
          Weakest 3
        </button>
        <button className="link" onClick={() => onChange([])}>
          None
        </button>
      </div>
      <div className="chips">
        {topics.map((t) => {
          const on = selected.includes(t.id);
          return (
            <button
              key={t.id}
              className={`chip toggle ${on ? "on" : ""}`}
              aria-pressed={on}
              onClick={() => onChange(on ? selected.filter((s) => s !== t.id) : [...selected, t.id])}
            >
              {t.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

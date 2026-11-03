import { useMemo, type ReactNode } from "react";
import { splitMath, Tex } from "../../MathText";

export interface GlossaryEntry {
  term: string;
  definition: string;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Builds one regex that finds any glossary term as a whole word (longest terms first). */
export function useGlossaryMatcher(glossary: GlossaryEntry[]) {
  return useMemo(() => {
    const terms = glossary.filter((g) => g.term.trim().length >= 2).sort((a, b) => b.term.length - a.term.length);
    if (!terms.length) return null;
    const byLower = new Map(terms.map((g) => [g.term.toLowerCase(), g]));
    const regex = new RegExp(`(?<![\\w-])(${terms.map((g) => escape(g.term)).join("|")})(?![\\w-])`, "gi");
    return { regex, byLower };
  }, [glossary]);
}

/**
 * Renders text with glossary terms as clickable buttons that show their definition.
 * Each term is highlighted only the first time it appears in a block, to avoid clutter.
 */
export function GlossaryText({
  text,
  matcher,
  id,
  active,
  onToggle,
}: {
  text: string;
  matcher: ReturnType<typeof useGlossaryMatcher>;
  id: string;
  active: string | null;
  onToggle: (key: string | null) => void;
}) {
  const out: ReactNode[] = [];
  const seen = new Set<string>();
  splitMath(text).forEach((part, p) => {
    if ("tex" in part) {
      out.push(<Tex key={`m${p}`} tex={part.tex} display={part.display} />);
      return;
    }
    const segment = part.text;
    if (!matcher) {
      out.push(segment);
      return;
    }
    let last = 0;
    matcher.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = matcher.regex.exec(segment))) {
      const entry = matcher.byLower.get(m[0].toLowerCase());
      if (!entry || seen.has(entry.term)) continue;
      seen.add(entry.term);
      if (m.index > last) out.push(segment.slice(last, m.index));
      const key = `${id}:${entry.term}`;
      const open = active === key;
      out.push(
        <span key={key} className="term-wrap">
          <button
            type="button"
            className={`term ${open ? "open" : ""}`}
            aria-expanded={open}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(open ? null : key);
            }}
          >
            {m[0]}
          </button>
          {open && (
            <span className="term-pop" role="tooltip">
              <strong>{entry.term}</strong>
              <span>
                {splitMath(entry.definition).map((d, j) => ("tex" in d ? <Tex key={j} tex={d.tex} /> : d.text))}
              </span>
            </span>
          )}
        </span>,
      );
      last = m.index + m[0].length;
    }
    if (last < segment.length) out.push(segment.slice(last));
  });
  return <>{out}</>;
}

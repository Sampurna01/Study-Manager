import { Fragment, type ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

export type Part = { text: string } | { tex: string; display: boolean };

// $$display$$, \[display\], \(inline\), and $inline$. For $...$ the opening $ must not be
// followed by a space and the closing $ must not be preceded by a space or followed by a
// digit, so prices like "$5 and $10" stay plain text.
const MATH = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g;

/** Split text into plain-text and maths parts. */
export function splitMath(text: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  MATH.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MATH.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    const display = m[1] !== undefined || m[2] !== undefined;
    parts.push({ tex: (m[1] ?? m[2] ?? m[3] ?? m[4]).trim(), display });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export function hasMath(text: string): boolean {
  MATH.lastIndex = 0;
  return MATH.test(text);
}

export function Tex({ tex, display = false }: { tex: string; display?: boolean }) {
  // KaTeX escapes its input; trust: false blocks \href, \url and other HTML-producing commands.
  const html = katex.renderToString(tex, { displayMode: display, throwOnError: false, trust: false, strict: "ignore", output: "html" });
  return <span className={display ? "math-display" : "math-inline"} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Plain text with $...$ maths rendered. `renderText` customises how plain-text parts are shown. */
export function MathText({ text, renderText }: { text: string; renderText?: (text: string, index: number) => ReactNode }) {
  const parts = splitMath(text);
  return (
    <>
      {parts.map((p, i) =>
        "tex" in p ? (
          <Tex key={i} tex={p.tex} display={p.display} />
        ) : (
          <Fragment key={i}>{renderText ? renderText(p.text, i) : p.text}</Fragment>
        ),
      )}
    </>
  );
}

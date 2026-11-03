import { Fragment, type ReactNode } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { repairDecodedLatex } from "../../shared/latex";

export type Part = { text: string } | { tex: string; display: boolean };

// $$display$$, \[display\], \(inline\), and $inline$. For $...$ the opening $ must not be
// followed by a space and the closing $ must not be preceded by a space or followed by a
// digit, so prices like "$5 and $10" stay plain text.
const MATH = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\d)/g;

/** Split text into plain-text and maths parts. */
export function splitMath(input: string): Part[] {
  // Courses saved before the LaTeX repair may contain "\text" stored as tab + "ext".
  const text = repairDecodedLatex(input);
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
  // Models sometimes forget the $...$ around maths; find bare LaTeX in the text parts.
  return parts.flatMap((p) => ("text" in p && /\\[a-zA-Z]/.test(p.text) ? findBareMath(p.text) : [p]));
}

const SMALL_WORDS = new Set("a i an as at be by do go he if in is it me my no of on or so to up us we".split(" "));
// Strongly mathematical: a LaTeX command, sub/superscript, or braces.
const isMathy = (t: string) => /\\[a-zA-Z]+|\\[,;!]|[_^{}]/.test(t);
// Can sit between mathy tokens: operators, numbers, 1-2 letter symbols like x, dz, (z).
const isGlue = (t: string) =>
  /^[=+\-*/<>≤≥≠·×|]+$/.test(t) || /^[\d.]+$/.test(t) || (/^\(?[a-zA-Z]{1,2}\)?$/.test(t) && !SMALL_WORDS.has(t.toLowerCase()));

function validTex(tex: string): boolean {
  try {
    katex.renderToString(tex, { throwOnError: true, strict: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Split plain text around runs of bare LaTeX (e.g. "Evaluate \\oint_C \\frac{1}{z} dz now"). */
export function findBareMath(text: string): Part[] {
  const tokens = text.split(/(\s+)/); // whitespace kept as its own tokens
  const space = (t: string) => /^\s+$/.test(t);
  // Trailing sentence punctuation, but not the "," in the thin-space command "\\,".
  const stripPunct = (t: string) => t.replace(/(?<!\\)[.,;:]+$/, "");
  const parts: Part[] = [];
  let flushed = 0; // tokens before this index are already in `parts`
  let carry = ""; // punctuation split off the end of the previous maths run
  let i = 0;
  while (i < tokens.length) {
    if (space(tokens[i]) || !isMathy(tokens[i])) {
      i++;
      continue;
    }
    // Extend backwards over glue (e.g. "x =" before "\\sqrt{2}").
    let start = i;
    for (let k = i - 1; k >= flushed; k--) {
      if (space(tokens[k])) continue;
      if (isGlue(tokens[k])) start = k;
      else break;
    }
    // Extend forwards over mathy and glue tokens.
    let end = i;
    for (let j = i + 1; j < tokens.length; j++) {
      if (space(tokens[j])) continue;
      const core = stripPunct(tokens[j]);
      if (!core || !(isMathy(core) || isGlue(core))) break;
      end = j;
      if (core !== tokens[j]) break; // punctuation ends the run
    }
    const raw = tokens.slice(start, end + 1).join("");
    const trail = raw.length - stripPunct(raw).length;
    const tex = raw.slice(0, raw.length - trail);
    if (validTex(tex)) {
      const before = carry + tokens.slice(flushed, start).join("");
      if (before) parts.push({ text: before });
      parts.push({ tex, display: false });
      carry = raw.slice(raw.length - trail);
      flushed = end + 1;
    }
    i = end + 1;
  }
  const rest = carry + tokens.slice(flushed).join("");
  if (rest) parts.push({ text: rest });
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

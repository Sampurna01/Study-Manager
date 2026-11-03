/**
 * Repairs LaTeX that was damaged by JSON escaping.
 *
 * Models often write LaTeX inside JSON strings with single backslashes. JSON reads
 * "\text" as a tab + "ext", "\frac" as a form feed + "rac", "\bigg" as a
 * backspace + "igg", "\right" as a carriage return + "ight" and "\neq" as a
 * newline + "eq"; other commands ("\int", "\alpha") are invalid JSON and make
 * the whole answer unreadable.
 */

// LaTeX commands starting with "n" (so "\n" + these is LaTeX, not a newline).
const N_COMMANDS =
  "nabla|neq|ne|nu|not|ni|neg|newline|nleq|ngeq|nexists|nmid|nparallel|nsubseteq|nsupseteq|ncong|nsim|nwarrow|nearrow|natural|nolimits|normalsize|noindent";
const N_COMMAND_AFTER_BACKSLASH = new RegExp(`^n(?:${N_COMMANDS.split("|").map((c) => c.slice(1)).join("|")})(?![a-zA-Z])`);
const N_COMMAND_AFTER_NEWLINE = new RegExp(`\\n(?=(?:${N_COMMANDS.split("|").map((c) => c.slice(1)).join("|")})(?![a-zA-Z]))`, "g");

/**
 * Fix raw JSON text from a model before JSON.parse: turn LaTeX backslashes that
 * would be misread as escapes (or are invalid escapes) into literal backslashes.
 * Correctly escaped JSON ("\\frac", "\n", "\"") is left alone.
 */
export function repairJsonLatex(raw: string): string {
  let out = "";
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch !== "\\") {
      out += ch;
      i++;
      continue;
    }
    const next = raw[i + 1] ?? "";
    const after = raw[i + 2] ?? "";
    if (next === "\\" || next === '"' || next === "/") {
      out += ch + next; // a proper escape
      i += 2;
    } else if (next === "u" && /^[0-9a-fA-F]{4}/.test(raw.slice(i + 2, i + 6))) {
      out += raw.slice(i, i + 6); // \uXXXX
      i += 6;
    } else if ("bfrt".includes(next) && next !== "" && /[a-zA-Z]/.test(after)) {
      out += "\\\\"; // \text, \frac, \bigg, \right → literal backslash
      i += 1;
    } else if (next === "n" && N_COMMAND_AFTER_BACKSLASH.test(raw.slice(i + 1))) {
      out += "\\\\"; // \neq, \nabla → literal backslash
      i += 1;
    } else if ("bfnrt".includes(next) && next !== "") {
      out += ch + next; // a real escape: \n newline, \t tab...
      i += 2;
    } else {
      out += "\\\\"; // invalid escape such as \int, \alpha, \{ → literal backslash
      i += 1;
    }
  }
  return out;
}

/**
 * Fix strings that were already decoded with the damage (e.g. saved earlier):
 * control characters followed by a command name become backslashes again.
 */
export function repairDecodedLatex(s: string): string {
  if (!/[\t\f\b\r\n]/.test(s)) return s;
  return s
    .replace(/\t(?=[a-zA-Z])/g, "\\t")
    .replace(/\f(?=[a-zA-Z])/g, "\\f")
    .replace(/\x08(?=[a-zA-Z])/g, "\\b")
    .replace(/\r(?=[a-zA-Z])/g, "\\r")
    .replace(N_COMMAND_AFTER_NEWLINE, "\\n");
}

/** Apply repairDecodedLatex to every string inside a parsed JSON value. */
export function repairStrings<T>(value: T): T {
  if (typeof value === "string") return repairDecodedLatex(value) as T;
  if (Array.isArray(value)) return value.map(repairStrings) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, repairStrings(v)])) as T;
  }
  return value;
}

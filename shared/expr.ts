/**
 * A small, safe maths-expression evaluator for plotting (no eval).
 * Supports numbers, x, pi/π, e, + - * / ^ (and **), parentheses, implicit
 * multiplication (2x, 3(x+1), x sin(x)), and common functions.
 */

type Fn = (x: number) => number;

const FUNCTIONS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sec: (v) => 1 / Math.cos(v),
  csc: (v) => 1 / Math.sin(v),
  cot: (v) => 1 / Math.tan(v),
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  arcsin: Math.asin,
  arccos: Math.acos,
  arctan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  log10: Math.log10,
  log2: Math.log2,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  sign: Math.sign,
  floor: Math.floor,
  ceil: Math.ceil,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, π: Math.PI, e: Math.E };

type Token = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const m = src.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i)!;
      tokens.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
    } else if (/[a-zA-Zπ]/.test(c)) {
      const m = src.slice(i).match(/^(π|[a-zA-Z]+\d*)/)!;
      tokens.push({ t: "id", v: m[0].toLowerCase() });
      i += m[0].length;
    } else if (src.startsWith("**", i)) {
      tokens.push({ t: "op", v: "^" });
      i += 2;
    } else if ("+-*/^()".includes(c)) {
      tokens.push({ t: "op", v: c });
      i++;
    } else if (c === "·" || c === "×") {
      tokens.push({ t: "op", v: "*" });
      i++;
    } else if (c === "−") {
      tokens.push({ t: "op", v: "-" });
      i++;
    } else {
      throw new Error(`Unexpected "${c}"`);
    }
  }
  return tokens;
}

/** Split identifiers like "xsin" or "pix" into known pieces. */
function splitIdentifier(id: string): string[] | null {
  if (id === "x" || id in FUNCTIONS || id in CONSTANTS) return [id];
  for (let cut = id.length - 1; cut > 0; cut--) {
    const head = id.slice(0, cut);
    if (head === "x" || head in FUNCTIONS || head in CONSTANTS) {
      const rest = splitIdentifier(id.slice(cut));
      if (rest) return [head, ...rest];
    }
  }
  return null;
}

/** Compile an expression in x into a function, or throw if it can't be understood. */
export function compile(source: string): Fn {
  const cleaned = source
    .replace(/\$/g, "")
    .replace(/\\left|\\right/g, "")
    .replace(/\\(sin|cos|tan|exp|ln|log|sqrt|pi|sinh|cosh|tanh|arcsin|arccos|arctan)/g, "$1")
    .replace(/^\s*(y|f\s*\(\s*x\s*\)|[a-z]\s*\(\s*x\s*\))\s*=\s*/i, "")
    .trim();
  const raw = tokenize(cleaned);
  const tokens: Token[] = [];
  for (const tok of raw) {
    if (tok.t !== "id") tokens.push(tok);
    else {
      const parts = splitIdentifier(tok.v);
      if (!parts) throw new Error(`Unknown name "${tok.v}"`);
      parts.forEach((p) => tokens.push({ t: "id", v: p }));
    }
  }
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.t === "op" && peek()!.v === v;

  function expr(): Fn {
    let left = term();
    while (isOp("+") || isOp("-")) {
      const op = (tokens[pos++] as { v: string }).v;
      const a = left;
      const b = term();
      left = op === "+" ? (x) => a(x) + b(x) : (x) => a(x) - b(x);
    }
    return left;
  }

  function startsFactor(): boolean {
    const tok = peek();
    return !!tok && (tok.t === "num" || tok.t === "id" || (tok.t === "op" && tok.v === "("));
  }

  function term(): Fn {
    let left = unary();
    for (;;) {
      if (isOp("*") || isOp("/")) {
        const op = (tokens[pos++] as { v: string }).v;
        const a = left;
        const b = unary();
        left = op === "*" ? (x) => a(x) * b(x) : (x) => a(x) / b(x);
      } else if (startsFactor()) {
        const a = left;
        const b = power(); // implicit multiplication binds like *
        left = (x) => a(x) * b(x);
      } else return left;
    }
  }

  function unary(): Fn {
    if (isOp("-")) {
      pos++;
      const a = unary();
      return (x) => -a(x);
    }
    if (isOp("+")) {
      pos++;
      return unary();
    }
    return power();
  }

  function power(): Fn {
    const base = primary();
    if (isOp("^")) {
      pos++;
      const exp = unary(); // right-associative: 2^3^2 = 2^9
      return (x) => Math.pow(base(x), exp(x));
    }
    return base;
  }

  function primary(): Fn {
    const tok = tokens[pos++];
    if (!tok) throw new Error("Expression ended early");
    if (tok.t === "num") return () => tok.v;
    if (tok.t === "op" && tok.v === "(") {
      const inner = expr();
      if (!isOp(")")) throw new Error("Missing )");
      pos++;
      return inner;
    }
    if (tok.t === "id") {
      if (tok.v === "x") return (x) => x;
      if (tok.v in CONSTANTS) {
        const c = CONSTANTS[tok.v];
        return () => c;
      }
      const fn = FUNCTIONS[tok.v];
      // sin(x), sin x, sin^2(x)
      let exponent: Fn | null = null;
      if (isOp("^")) {
        pos++;
        exponent = primary();
      }
      const arg = isOp("(") ? primary() : power();
      return exponent ? (x) => Math.pow(fn(arg(x)), exponent!(x)) : (x) => fn(arg(x));
    }
    throw new Error(`Unexpected "${tok.v}"`);
  }

  const fn = expr();
  if (pos < tokens.length) throw new Error(`Unexpected "${(tokens[pos] as { v: unknown }).v}"`);
  return fn;
}

/** Compile, or return null if the expression can't be understood. */
export function tryCompile(source: string): Fn | null {
  try {
    const fn = compile(source);
    fn(0.5); // smoke test
    return fn;
  } catch {
    return null;
  }
}

import { describe, expect, it } from "vitest";
import { compile, tryCompile } from "../shared/expr";

const at = (src: string, x: number) => compile(src)(x);

describe("expression evaluator", () => {
  it("handles arithmetic and precedence", () => {
    expect(at("1 + 2 * 3", 0)).toBe(7);
    expect(at("(1 + 2) * 3", 0)).toBe(9);
    expect(at("2^3^2", 0)).toBe(512);
    expect(at("-x^2", 3)).toBe(-9);
    expect(at("x**2 - 4", 3)).toBe(5);
    expect(at("10/4", 0)).toBe(2.5);
    expect(at("1.5e2", 0)).toBe(150);
  });

  it("supports functions, constants and implicit multiplication", () => {
    expect(at("sin(pi/2)", 0)).toBeCloseTo(1);
    expect(at("2x + 1", 3)).toBe(7);
    expect(at("3(x+1)", 1)).toBe(6);
    expect(at("x sin(x)", Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(at("xsin(x)", Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(at("e^x", 1)).toBeCloseTo(Math.E);
    expect(at("ln(e)", 0)).toBeCloseTo(1);
    expect(at("log(100)", 0)).toBeCloseTo(2);
    expect(at("sqrt(x)", 9)).toBe(3);
    expect(at("sin^2(x) + cos^2(x)", 1.2)).toBeCloseTo(1);
    expect(at("2π", 0)).toBeCloseTo(2 * Math.PI);
  });

  it("accepts LaTeX-ish and 'y =' forms", () => {
    expect(at("y = x^2", 3)).toBe(9);
    expect(at("f(x) = 2x", 3)).toBe(6);
    expect(at("$\\sin(x)$", Math.PI / 2)).toBeCloseTo(1);
    expect(at("1 − x", 1)).toBe(0);
    expect(at("x - x^3/6 + x^5/120", 0.5)).toBeCloseTo(Math.sin(0.5), 4);
  });

  it("rejects what it can't understand instead of guessing", () => {
    expect(tryCompile("alert(1)")).toBeNull();
    expect(tryCompile("x +")).toBeNull();
    expect(tryCompile("(x")).toBeNull();
    expect(tryCompile("y; x")).toBeNull();
    expect(tryCompile("window")).toBeNull();
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateFormula, UnsupportedFormulaError } from "@/lib/excel/formula-engine";

test("evaluates a simple multiplication", () => {
  assert.ok(Math.abs(evaluateFormula("=85*10.764", () => null) - 914.94) < 1e-9);
});

test("evaluates cell references", () => {
  const values: Record<string, number> = { D5: 120, E5: 900 };
  assert.equal(evaluateFormula("=D5*E5", (addr) => values[addr] ?? null), 108000);
});

test("evaluates SUM over a range", () => {
  const values: Record<string, number> = { G8: 10, G9: 20, G10: 30 };
  assert.equal(evaluateFormula("=SUM(G8:G10)", (addr) => values[addr] ?? null), 60);
});

test("respects operator precedence and parentheses", () => {
  assert.equal(evaluateFormula("=(2+3)*4", () => null), 20);
  assert.equal(evaluateFormula("=2+3*4", () => null), 14);
});

test("throws UnsupportedFormulaError on missing reference instead of guessing", () => {
  assert.throws(() => evaluateFormula("=A1*2", () => null), UnsupportedFormulaError);
});

test("throws UnsupportedFormulaError on division by zero instead of returning Infinity", () => {
  assert.throws(() => evaluateFormula("=10/0", () => null), UnsupportedFormulaError);
});

test("throws UnsupportedFormulaError on unsupported functions (no silent fallback)", () => {
  assert.throws(() => evaluateFormula("=VLOOKUP(A1,B:C,2)", () => null), UnsupportedFormulaError);
});
